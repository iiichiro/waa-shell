import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { useCallback, useRef } from 'react';
import { db, type Message, type ThreadSettings } from '../lib/db';
import {
  createThread,
  deleteMessageAndDescendants,
  generateTitle,
  sendMessage,
  switchBranch,
  updateMessageWithFiles,
} from '../lib/services/ChatService';
import type { ModelInfo } from '../lib/services/ModelService';

interface UseChatOperationsProps {
  activeThreadId: number | null;
  setActiveThreadId: (id: number | null) => void;
  selectedModelId: string;
  models: ModelInfo[];
  draftThreadSettings: Partial<ThreadSettings>;
  setDraftThreadSettings: (settings: Partial<ThreadSettings>) => void;
  setStreamingContent: (content: string) => void;
  autoGenerateTitle: boolean;
  titleGenerationProvider: string;
  titleGenerationModel: string;
}

/**
 * チャットの送信、再生成、編集、停止などの「操作」ロジックを管理するフック
 */
export function useChatOperations({
  activeThreadId,
  setActiveThreadId,
  selectedModelId,
  models,
  draftThreadSettings,
  setDraftThreadSettings,
  setStreamingContent,
  autoGenerateTitle,
  titleGenerationProvider,
  titleGenerationModel,
}: UseChatOperationsProps) {
  const queryClient = useQueryClient();
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

  const processStreamResponse = useCallback(
    async (response: Message | AsyncIterable<ChatCompletionChunk>) => {
      if (response && Symbol.asyncIterator in response) {
        let fullContent = '';
        const iterator = response as AsyncIterable<ChatCompletionChunk>;
        for await (const chunk of iterator) {
          const delta = chunk.choices[0]?.delta?.content || '';
          fullContent += delta;
          setStreamingContent(fullContent);
        }
        setStreamingContent('');
      }
    },
    [setStreamingContent],
  );

  const sendMutation = useMutation({
    mutationFn: async ({
      text,
      attachments,
      parentId,
      isRegenerate = false,
    }: {
      text: string;
      attachments: File[];
      parentId?: number | null;
      isRegenerate?: boolean;
    }) => {
      let threadId = activeThreadId;
      let isNewThread = false;

      if (!threadId) {
        threadId = await createThread(text.slice(0, 20) || '新しいチャット');
        isNewThread = true;
        setActiveThreadId(threadId);
        await queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
      }

      if (isNewThread && Object.keys(draftThreadSettings).length > 0) {
        await db.threadSettings.add({
          ...draftThreadSettings,
          threadId,
          modelId: draftThreadSettings.modelId || selectedModelId || models[0]?.id || '',
        } as ThreadSettings);
        setDraftThreadSettings({});
      }

      const existingController = abortControllersRef.current.get(threadId);
      if (existingController) {
        existingController.abort();
        abortControllersRef.current.delete(threadId);
      }
      const abortController = new AbortController();
      abortControllersRef.current.set(threadId, abortController);

      const targetModel = selectedModelId || (models.length > 0 ? models[0].id : '');
      const selectedModel = models.find((m) => m.id === targetModel);
      const shouldStream = selectedModel ? selectedModel.enableStream : true;

      try {
        const response = await sendMessage(threadId, text, targetModel, {
          stream: shouldStream,
          attachments: isRegenerate ? [] : attachments,
          parentId,
          onUserMessageSaved: async () => {
            await queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
          },
          signal: abortController.signal,
        });

        queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
        await processStreamResponse(response);
        queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
        queryClient.invalidateQueries({ queryKey: ['thread', threadId] });

        if (isNewThread && autoGenerateTitle && titleGenerationProvider && titleGenerationModel) {
          generateTitle(threadId, titleGenerationProvider, titleGenerationModel).then(() => {
            queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
            queryClient.invalidateQueries({ queryKey: ['threads'] });
          });
        }

        return threadId;
      } finally {
        abortControllersRef.current.delete(threadId);
      }
    },
  });

  const handleSend = useCallback(
    (parentId?: number | null, overrideText?: string, overrideAttachments?: File[]) => {
      // 実際の実装は App.tsx の handleSend ロジックを元にする
      // ここでは簡略化して mutation を呼ぶ
      if (sendMutation.isPending) return;

      // バリデーション等のロジックは App.tsx からここへ移行する予定
      sendMutation.mutate({
        text: overrideText || '',
        attachments: overrideAttachments || [],
        parentId,
      });
    },
    [sendMutation],
  );

  const handleStop = useCallback(() => {
    if (!activeThreadId) return;
    const controller = abortControllersRef.current.get(activeThreadId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(activeThreadId);
      setStreamingContent('');
      queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
    }
  }, [activeThreadId, queryClient, setStreamingContent]);

  const handleRegenerate = useCallback(
    async (messageId: number, type: 'regenerate' | 'branch' = 'branch') => {
      if (!activeThreadId || sendMutation.isPending) return;

      const message = await db.messages.get(messageId);
      if (!message) return;

      const parentId = message.role === 'user' ? messageId : (message.parentId ?? null);

      if (type === 'regenerate') {
        const startId = message.role === 'assistant' ? messageId : undefined;
        if (startId) {
          await deleteMessageAndDescendants(activeThreadId, startId);
        } else {
          const allInThread = await db.messages.where('threadId').equals(activeThreadId).toArray();
          const children = allInThread.filter((m) => m.parentId === messageId);
          for (const child of children) {
            if (child.id) await deleteMessageAndDescendants(activeThreadId, child.id);
          }
        }
        await queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
      }

      sendMutation.mutate({
        text: '',
        attachments: [],
        parentId: parentId,
        isRegenerate: true,
      });
    },
    [activeThreadId, sendMutation, queryClient],
  );

  return {
    sendMutation,
    handleSend,
    handleStop,
    handleRegenerate,
    handleSwitchBranch: async (targetMessageId: number) => {
      if (!activeThreadId) return;
      await switchBranch(activeThreadId, targetMessageId);
      queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
      queryClient.invalidateQueries({ queryKey: ['thread', activeThreadId] });
    },
    handleEdit: async (
      messageId: number,
      content: string,
      type: 'save' | 'regenerate' | 'branch',
      removedFileIds: number[] = [],
      newFiles: File[] = [],
    ) => {
      const message = await db.messages.get(messageId);
      if (!message) return;

      if (type === 'save') {
        await updateMessageWithFiles(messageId, content, removedFileIds, newFiles);
        queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
        return;
      }

      if (type === 'regenerate') {
        await updateMessageWithFiles(messageId, content, removedFileIds, newFiles);
        if (activeThreadId) {
          const allInThread = await db.messages.where('threadId').equals(activeThreadId).toArray();
          const children = allInThread.filter((m) => m.parentId === messageId);
          for (const child of children) {
            if (child.id) {
              await deleteMessageAndDescendants(activeThreadId, child.id);
            }
          }
          await handleRegenerate(messageId, 'regenerate');
        }
        return;
      }

      // type === 'branch'
      const existingFiles = await db.files.where('messageId').equals(messageId).toArray();
      const keptFiles = existingFiles
        .filter((f) => f.id !== undefined && !removedFileIds.includes(f.id))
        .map((f) => new File([f.blob], f.fileName, { type: f.mimeType }));

      handleSend(message.parentId ?? null, content, [...keptFiles, ...newFiles]);
    },
  };
}
