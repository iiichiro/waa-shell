import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { db, type Message } from '../db';
import { getActivePathMessages } from '../db/threads';
import { fileToBase64 } from './FileService';
import { chatCompletion, listModels } from './ModelService';
import { executeTool, getToolDefinitions } from './ToolService';

/**
 * スレッドを削除し、関連するデータ（メッセージ、ファイル、設定）をすべて削除する
 */
export async function deleteThread(threadId: number): Promise<void> {
  await db.transaction('rw', db.threads, db.messages, db.files, db.threadSettings, async () => {
    // 関連データを削除
    await db.messages.where('threadId').equals(threadId).delete();
    await db.files.where('threadId').equals(threadId).delete();
    await db.threadSettings.where('threadId').equals(threadId).delete();
    // スレッド本体を削除
    await db.threads.delete(threadId);
  });
}

/**
 * 複数のスレッドを一括削除する
 */
export async function deleteMultipleThreads(threadIds: number[]): Promise<void> {
  await db.transaction('rw', db.threads, db.messages, db.files, db.threadSettings, async () => {
    await db.messages.where('threadId').anyOf(threadIds).delete();
    await db.files.where('threadId').anyOf(threadIds).delete();
    await db.threadSettings.where('threadId').anyOf(threadIds).delete();
    await db.threads.where('id').anyOf(threadIds).delete();
  });
}

/**
 * チャット履歴とスレッドの永続化を担当するサービス
 */
export async function createThread(
  title: string,
  settings?: {
    modelId?: string;
    systemPrompt?: string;
    contextWindow?: number;
    maxTokens?: number;
    extraParams?: Record<string, unknown>;
  },
): Promise<number> {
  const now = new Date();

  return db.transaction('rw', db.threads, db.threadSettings, async () => {
    const threadId = await db.threads.add({
      title,
      createdAt: now,
      updatedAt: now,
    });

    if (settings) {
      await db.threadSettings.add({
        threadId,
        modelId: settings.modelId || '',
        systemPrompt: settings.systemPrompt,
        contextWindow: settings.contextWindow,
        maxTokens: settings.maxTokens,
        extraParams: settings.extraParams,
      });
    }

    return threadId;
  });
}

/**
 * メッセージを特定のスレッドに保存し、AIの回答を取得して保存する
 */
export async function sendMessage(
  threadId: number,
  content: string,
  requestModelId: string,
  options: {
    stream?: boolean;
    attachments?: File[];
    parentId?: number | null;
    onUserMessageSaved?: (messageId: number | null | undefined) => void;
    signal?: AbortSignal;
  } = {},
): Promise<Message | AsyncIterable<ChatCompletionChunk>> {
  const threadSetting = await db.threadSettings.where({ threadId }).first();
  const modelId = threadSetting?.modelId || requestModelId;

  // 0. モデルの有効状態をチェック
  const allModels = await listModels();
  const currentModel = allModels.find((m) => m.id === modelId);
  if (currentModel && !currentModel.isEnabled) {
    throw new Error(`モデル「${currentModel.name}」は無効化されているため送信できません。`);
  }

  const now = new Date();

  const thread = await db.threads.get(threadId);
  if (!thread) throw new Error('Thread not found');

  const systemPrompt = threadSetting?.systemPrompt;
  const maxTokens = threadSetting?.maxTokens;
  const contextWindow = threadSetting?.contextWindow;
  const extraParams = threadSetting?.extraParams;

  // 1. ユーザーメッセージをDBに保存
  // parentId が undefined の場合は最新(activeLeafId)を、null の場合はルートを意味する
  let currentParentId =
    options.parentId === undefined ? thread.activeLeafId : (options.parentId ?? undefined);

  // UI/UX改善: もし現在のアクティブなリーフと起点が異なる場合、即座に更新して表示を切り替える
  // これにより再送時に古いメッセージが即座に消える
  if (currentParentId !== thread.activeLeafId) {
    await db.threads.update(threadId, { activeLeafId: currentParentId ?? null });
  }

  let userMessageId: number | undefined;

  if (content || (options.attachments && options.attachments.length > 0)) {
    const userMessage: Message = {
      threadId,
      role: 'user',
      content,
      parentId: currentParentId,
      createdAt: now,
    };
    userMessageId = await db.messages.add(userMessage);
    currentParentId = userMessageId;
    await db.threads.update(threadId, { updatedAt: now, activeLeafId: userMessageId });

    if (options.attachments && options.attachments.length > 0 && userMessageId) {
      const { saveFile } = await import('./FileService');
      for (const file of options.attachments) {
        await saveFile(file, file.name, {
          threadId,
          messageId: userMessageId,
        });
      }
    }
  }

  // コールバックがあれば即座に呼び出す（UI更新用）
  if (options.onUserMessageSaved) {
    options.onUserMessageSaved(currentParentId);
  }

  while (true) {
    // アクティブなパス（ブランチ）に絞って履歴を取得
    // 保存したユーザーメッセージ（または指定された起点）を含む履歴を取得
    let history = await getActivePathMessages(threadId, currentParentId);

    if (contextWindow && contextWindow > 0 && history.length > contextWindow) {
      history = history.slice(-contextWindow);
    }
    const messagesForAi: ChatCompletionMessageParam[] = [];

    const modelName = currentModel ? currentModel.name : modelId;
    // デフォルトはtrueとして扱う（不明なモデルの場合など）
    const supportsTools = currentModel ? currentModel.supportsTools !== false : true;
    const supportsImages = currentModel ? currentModel.supportsImages !== false : true;
    const protocol = currentModel?.protocol || 'chat_completion';

    if (protocol === 'response_api') {
      try {
        const inputItems: unknown[] = [];

        // System Prompt
        if (systemPrompt) {
          inputItems.push({
            role: 'system',
            content: systemPrompt,
          });
        }

        // History
        for (const m of history) {
          const item: Record<string, unknown> = { role: m.role };
          if (m.role === 'tool') {
            // tool messages
            item.content = m.content;
            item.tool_call_id = m.tool_call_id;
          } else if (m.role === 'assistant' && m.tool_calls) {
            // assistant tool calls
            item.content = m.content || null;
            item.tool_calls = m.tool_calls;
          } else {
            // user or assistant text
            // Handle Images for User
            if (m.role === 'user' && m.id !== undefined) {
              const files = await db.files.where('messageId').equals(m.id).toArray();
              const imageFiles = files.filter((f) => f.mimeType.startsWith('image/'));

              if (imageFiles.length > 0 && supportsImages) {
                const contentList: unknown[] = [{ type: 'text', text: m.content || '' }];
                for (const file of imageFiles) {
                  if (file.id === undefined) continue;
                  const { base64 } = await fileToBase64(file.id);
                  contentList.push({
                    type: 'image_url',
                    image_url: { url: `data:${file.mimeType};base64,${base64}` },
                  });
                }
                item.content = contentList;
              } else {
                item.content = m.content || '';
              }
            } else {
              item.content = m.content || '';
            }
          }
          inputItems.push(item);
        }

        // Client & Request
        // TODO: ChatService should not import from openai directly for types if possible, but here we use 'any' for simplicity or need to import types.
        // We use 'chatCompletion' wrapper but it is designed for 'chat.completions'.
        // We need 'getOpenAIClient' logic here or expand 'chatCompletion' to support 'responses'.
        // For now, let's reuse 'chatCompletion' but we need to modify it or access client directly.
        // 'chatCompletion' in ModelService returns a specific result.
        // Let's modify 'ModelService' to expose a 'createResponse' function or similar.
        // OR: Since I cannot easily modify 'ModelService' interface extensively right now without breaking changes,
        // will use a new exported function from ModelService `createResponseApi`.
        const { createResponseApi } = await import('./ModelService');

        // biome-ignore lint/suspicious/noExplicitAny: Response API return type is dynamic
        const response: any = await createResponseApi({
          // Issue: 'listModels' returns flattened info. We need the actual provider object to create client.
          // Helper 'getModelProvider' or similar needed.
          // Let's rely on 'modelId' (UUID) to let ModelService find the config/manual model and then the provider.
          model: modelId,
          input: inputItems,
          max_tokens: maxTokens,
          extraParams: extraParams,
          signal: options.signal,
        });

        // Handle Response (Non-streaming for now as per initial implementation, or check stream option)
        // User request sample uses `await openai.responses.create(...)` and logs `response.output`.
        // The output is an array of items.

        // Find 'message' item
        const outputItems = (response.output || []) as {
          type: string;
          content?: { type: string; text: string }[];
          summary?: { type: string; text: string }[];
        }[];
        const messageItem = outputItems.find((item) => item.type === 'message');
        const reasoningItem = outputItems.find((item) => item.type === 'reasoning');

        let content = '';
        let reasoningSummary = '';

        if (messageItem?.content) {
          // content is list of {type: 'output_text', text: '...'}
          for (const c of messageItem.content) {
            if (c.type === 'output_text') content += c.text;
          }
        }

        if (reasoningItem?.summary) {
          for (const s of reasoningItem.summary) {
            if (s.type === 'summary_text') reasoningSummary += s.text;
          }
        }

        // Save Assistant Message
        const assistantMessage: Message = {
          threadId,
          role: 'assistant',
          content: content || '(No content)',
          reasoningSummary: reasoningSummary,
          parentId: currentParentId,
          model: modelName,
          createdAt: new Date(),
        };

        const finalId = await db.messages.add(assistantMessage);
        await db.threads.update(threadId, { activeLeafId: finalId });
        assistantMessage.id = finalId;
        return assistantMessage;
      } catch (error) {
        console.error('Response API Error:', error);
        throw error; // Let the catch block below handle it
      }
    }

    if (systemPrompt) {
      messagesForAi.push({ role: 'system', content: systemPrompt });
    }

    for (const m of history) {
      if (m.tool_calls && m.tool_calls.length > 0) {
        // ツール非対応モデルの場合はどうする？
        // 履歴にツール呼び出しがあるが、今ツール非対応なら、これを含めるとエラーになる可能性がある。
        // しかし履歴は履歴なので含めるべきか？
        // 一旦含めるが、モデルがエラーを吐くかもしれない。
        // ここでは「これから送る・使う機能」を制限する意図なので履歴はそのままにする。
        messagesForAi.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.tool_calls,
        });
        continue;
      }

      if (m.role === 'tool') {
        messagesForAi.push({
          role: 'tool',
          content: m.content || '',
          tool_call_id: m.tool_call_id || '',
        });
        continue;
      }

      const contentParts: ChatCompletionContentPart[] = [{ type: 'text', text: m.content || '' }];
      if (m.id !== undefined) {
        const files = await db.files.where('messageId').equals(m.id).toArray();
        for (const file of files) {
          if (file.id !== undefined && file.mimeType.startsWith('image/')) {
            // 画像対応モデルかつ画像ファイルの場合のみ追加
            if (supportsImages) {
              const { base64 } = await fileToBase64(file.id);
              contentParts.push({
                type: 'image_url',
                image_url: { url: `data:${file.mimeType};base64,${base64}` },
              });
            }
          }
        }
      }

      if (contentParts.length > 1) {
        messagesForAi.push({
          role: m.role,
          content: contentParts,
        } as ChatCompletionMessageParam);
      } else {
        messagesForAi.push({
          role: m.role,
          content: m.content || '',
        });
      }
    }

    // ツール定義の取得制御
    // supportsToolsがtrueの場合のみツールを取得して渡す
    const tools = supportsTools ? await getToolDefinitions() : [];

    try {
      const response = await chatCompletion({
        model: modelId,
        messages: messagesForAi,
        stream: options.stream,
        tools: tools.length > 0 ? tools : undefined,
        max_tokens: maxTokens,
        extraParams: extraParams,
        signal: options.signal,
      });

      if (options.stream && response != null && Symbol.asyncIterator in response) {
        return handleStreamResponse(
          threadId,
          modelId,
          modelName,
          currentParentId,
          response as AsyncIterable<ChatCompletionChunk>,
        );
      }

      const result = response as ChatCompletion;
      const message = result.choices[0].message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        const assistantId = await db.messages.add({
          threadId,
          role: 'assistant',
          content: message.content || '',
          tool_calls: message.tool_calls,
          model: modelName,
          parentId: currentParentId,
          createdAt: new Date(),
        });
        currentParentId = assistantId;
        await db.threads.update(threadId, { activeLeafId: assistantId });

        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== 'function') continue;
          let toolResult = '';
          try {
            const args = JSON.parse(toolCall.function.arguments);
            toolResult = await executeTool(toolCall.function.name, args);
          } catch (e) {
            toolResult = `Error: ${String(e)}`;
          }

          const toolId = await db.messages.add({
            threadId,
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
            parentId: currentParentId,
            createdAt: new Date(),
          });
          currentParentId = toolId;
          await db.threads.update(threadId, { activeLeafId: toolId });
        }
        continue;
      }

      const assistantMessage: Message = {
        threadId,
        role: 'assistant',
        content: message.content || '',
        parentId: currentParentId,
        usage: result.usage
          ? {
              promptTokens: result.usage.prompt_tokens,
              completionTokens: result.usage.completion_tokens,
              totalTokens: result.usage.total_tokens,
            }
          : undefined,
        model: modelName,
        createdAt: new Date(),
      };
      const finalId = await db.messages.add(assistantMessage);
      await db.threads.update(threadId, { activeLeafId: finalId });
      assistantMessage.id = finalId;
      return assistantMessage;
    } catch (error) {
      const errorMessage: Message = {
        threadId,
        role: 'assistant',
        content: `エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        parentId: currentParentId,
        model: 'system',
        createdAt: new Date(),
      };
      const errorId = await db.messages.add(errorMessage);
      await db.threads.update(threadId, { activeLeafId: errorId });
      errorMessage.id = errorId;
      // エラー時もメッセージとして返却することで、UI上での表示を確実にする
      return errorMessage;
    }
  }
}

async function* handleStreamResponse(
  threadId: number,
  modelId: string,
  modelName: string,
  parentId: number | null | undefined,
  stream: AsyncIterable<ChatCompletionChunk>,
): AsyncIterable<ChatCompletionChunk> {
  let fullContent = '';
  // biome-ignore lint/suspicious/noExplicitAny: Building partial tool calls requires flexible object
  const toolCallsMap: Record<number, any> = {};
  let isToolCall = false;
  let currentParentId = parentId;

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (!choice) continue;

    if (choice.delta?.content) {
      fullContent += choice.delta.content;
    }

    if (choice.delta?.tool_calls) {
      isToolCall = true;
      for (const tc of choice.delta.tool_calls) {
        if (!toolCallsMap[tc.index]) {
          toolCallsMap[tc.index] = {
            id: tc.id || '',
            type: 'function',
            function: { name: '', arguments: '' },
          };
        }
        const target = toolCallsMap[tc.index];
        if (tc.id) target.id = tc.id;
        if (tc.function) {
          if (tc.function.name) target.function.name += tc.function.name;
          if (tc.function.arguments) target.function.arguments += tc.function.arguments;
        }
      }
    }
    yield chunk;
  }

  if (isToolCall) {
    const toolCalls = Object.values(toolCallsMap);
    const assistantId = await db.messages.add({
      threadId,
      role: 'assistant',
      content: fullContent,
      tool_calls: toolCalls,
      model: modelName,
      parentId: currentParentId,
      createdAt: new Date(),
    });
    currentParentId = assistantId;
    await db.threads.update(threadId, { activeLeafId: assistantId });

    for (const toolCall of toolCalls) {
      let toolResult = '';
      try {
        const args = JSON.parse(toolCall.function.arguments);
        toolResult = await executeTool(toolCall.function.name, args);
      } catch (e) {
        toolResult = `Error: ${String(e)}`;
      }
      const toolId = await db.messages.add({
        threadId,
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
        parentId: currentParentId,
        createdAt: new Date(),
      });
      currentParentId = toolId;
      await db.threads.update(threadId, { activeLeafId: toolId });
    }

    const nextResponse = await sendMessage(threadId, '', modelId, {
      stream: true,
      parentId: currentParentId,
    });
    if (Symbol.asyncIterator in nextResponse) {
      const iterator = nextResponse as AsyncIterable<ChatCompletionChunk>;
      for await (const chunk of iterator) {
        yield chunk;
      }
    }
  } else {
    const finalId = await db.messages.add({
      threadId,
      role: 'assistant',
      content: fullContent,
      model: modelName,
      parentId: currentParentId,
      createdAt: new Date(),
    });
    await db.threads.update(threadId, { activeLeafId: finalId });
  }
}

/**
 * メッセージを再生成する
 * 1. 指定されたメッセージを削除（または無視して）
 * 2. その親メッセージ（ユーザー）から再送
 */
export async function regenerateMessage(
  threadId: number,
  messageId: number,
  modelId: string,
  options: {
    onUserMessageSaved?: (messageId: number | null | undefined) => void;
    signal?: AbortSignal;
  } = {},
) {
  const message = await db.messages.get(messageId);
  if (!message || message.role !== 'assistant') return;

  // AIメッセージの親（通常はユーザーメッセージ）を起点に再送
  // parentIdがundefined（最初のメッセージ）の場合はnullを渡すことで、正しくルートブランチとして作成させる
  return sendMessage(threadId, '', modelId, {
    stream: true,
    parentId: message.parentId ?? null,
    onUserMessageSaved: options.onUserMessageSaved,
    signal: options.signal,
  });
}

/**
 * ブランチを切り替える。指定されたメッセージの最新の子孫を自動的に見つける
 */
export async function switchBranch(threadId: number, messageId: number) {
  const allMessages = await db.messages.where('threadId').equals(threadId).toArray();

  // 子メッセージを辿って最新のメッセージ（リーフ）を見つける
  const findLatestLeaf = (currentId: number): number => {
    const children = allMessages
      .filter((m) => m.parentId === currentId)
      .sort((a, b) => (b.id || 0) - (a.id || 0));

    if (children.length === 0 || !children[0].id) return currentId;
    return findLatestLeaf(children[0].id);
  };

  const leafId = findLatestLeaf(messageId);
  await db.threads.update(threadId, { activeLeafId: leafId });
}

/**
 * メッセージとそのすべての末裔を削除する
 */
export async function deleteMessageAndDescendants(threadId: number, messageId: number) {
  const allMessages = await db.messages.where('threadId').equals(threadId).toArray();

  const getDescendantIds = (currentId: number): number[] => {
    const ids: number[] = [currentId];
    const children = allMessages.filter((m) => m.parentId === currentId);
    for (const child of children) {
      if (child.id) {
        ids.push(...getDescendantIds(child.id));
      }
    }
    return ids;
  };

  const idsToDelete = getDescendantIds(messageId);
  await db.transaction('rw', db.messages, db.threads, db.files, async () => {
    // 削除対象のメッセージに関連するファイルを削除
    await db.files.where('messageId').anyOf(idsToDelete).delete();
    // メッセージを削除
    await db.messages.bulkDelete(idsToDelete);

    // activeLeafId が削除対象の中に含まれている場合、親メッセージに巻き戻す
    const thread = await db.threads.get(threadId);
    if (thread?.activeLeafId && idsToDelete.includes(thread.activeLeafId)) {
      const message = allMessages.find((m) => m.id === messageId);
      await db.threads.update(threadId, { activeLeafId: message?.parentId ?? null });
    }
  });
}

/**
 * メッセージの内容を更新する
 */
export async function updateMessageContent(messageId: number, content: string) {
  await db.messages.update(messageId, { content });
}
