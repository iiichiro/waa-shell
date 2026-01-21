import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatHeader } from './components/chat/ChatHeader';
import { ChatInputArea } from './components/chat/ChatInputArea';
import { ChatMessage } from './components/chat/ChatMessage';
import { ScrollToBottomButton } from './components/chat/ScrollToBottomButton';
import { ThreadSettingsModal } from './components/chat/ThreadSettingsModal';
import { CommandManager } from './components/command/CommandManager';
import { SlashCommandForm } from './components/command/SlashCommandForm';
import { SlashCommandSuggest } from './components/command/SlashCommandSuggest';
import { FileExplorer } from './components/common/FileExplorer';
import { Sidebar } from './components/layout/Sidebar';
import { SettingsView } from './components/settings/SettingsView';
import { useChatInput } from './hooks/useChatInput';
import {
  LAUNCHER_MAX_HEIGHT,
  LAUNCHER_MIN_HEIGHT,
  LAUNCHER_SUGGEST_MIN_HEIGHT,
  WINDOW_DEFAULT_HEIGHT_EXPANDED,
} from './lib/constants/UIConstants';
import { db, type Message, type SlashCommand, type Thread, type ThreadSettings } from './lib/db';
import { getActivePathMessages, getMessageBranchInfo } from './lib/db/threads';
import {
  createThread,
  deleteMessageAndDescendants,
  generateTitle,
  sendMessage,
  switchBranch,
  updateMessageWithFiles,
} from './lib/services/ChatService';
import { listModels, type ModelInfo } from './lib/services/ModelService';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const queryClient = useQueryClient();
  const {
    activeThreadId,
    isSidebarOpen,
    isLauncher,
    setIsLauncher,
    isSettingsOpen,
    setSettingsOpen,
    isCommandManagerOpen,
    setCommandManagerOpen,
    isFileExplorerOpen,
    fileExplorerThreadId,
    setFileExplorerOpen,
    isThreadSettingsOpen,
    setThreadSettingsOpen,
    theme,
    sendShortcut,
    setActiveThreadId,
    toggleSidebar,
    autoGenerateTitle,
    titleGenerationProvider,
    titleGenerationModel,
    enabledTools,
    setToolEnabled,
  } = useAppStore();

  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(''); // モデル選択状態の管理
  const [selectedProviderId, setSelectedProviderId] = useState<string>(''); // プロバイダー選択状態の管理

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);

  // ドラフト設定（新規チャット作成前に設定された値）
  const [draftThreadSettings, setDraftThreadSettings] = useState<Partial<ThreadSettings>>({});

  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState('');
  const [selectedCommand, setSelectedCommand] = useState<SlashCommand | null>(null);

  // AbortController for cancelling generation (per thread)
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

  const {
    data: models = [],
    isLoading: isModelsLoading,
    isRefetching: isModelsRefetching,
  } = useQuery<ModelInfo[]>({
    queryKey: ['models'],
    queryFn: () => listModels(),
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: () => db.providers.toArray(),
  });

  const handleWindowClose = useCallback(async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const appWindow = getCurrentWindow();
      if (isLauncher) {
        await appWindow.hide();
      } else {
        await appWindow.close();
      }
    }
  }, [isLauncher]);

  const handleModelChange = useCallback(
    async (modelId: string, providerId?: string) => {
      setSelectedModelId(modelId);
      if (providerId) setSelectedProviderId(providerId);

      if (!activeThreadId) {
        // 新規チャット時はドラフト設定も更新して同期を保つ
        setDraftThreadSettings((prev) => ({
          ...prev,
          modelId,
          providerId: providerId || prev.providerId,
        }));
      } else {
        // 既存スレッドの場合は即座に設定を更新
        const existing = await db.threadSettings.where({ threadId: activeThreadId }).first();
        if (existing?.id) {
          await db.threadSettings.update(existing.id, {
            modelId,
            providerId: providerId || existing.providerId,
          });
        } else {
          await db.threadSettings.add({
            threadId: activeThreadId,
            modelId,
            providerId,
          } as ThreadSettings);
        }
        queryClient.invalidateQueries({ queryKey: ['threadSettings', activeThreadId] });
      }
    },
    [activeThreadId, queryClient],
  );

  // テーマの適用
  useEffect(() => {
    const applyTheme = () => {
      const root = window.document.documentElement;
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      const shouldBeDark = theme === 'dark' || (theme === 'system' && isSystemDark);

      if (shouldBeDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();

    // システム設定の変更を監視
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // ウィンドウフォーカス時に状態を再取得（ランチャー/メインウィンドウ間の状態同期）
  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

    let unlisten: (() => void) | undefined;

    const setupFocusListener = async () => {
      const appWindow = getCurrentWindow();
      unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          // 画面表示時にDBから最新データを再取得
          queryClient.invalidateQueries({ queryKey: ['threads'] });
          queryClient.invalidateQueries({ queryKey: ['providers'] });
          queryClient.invalidateQueries({ queryKey: ['models'] });
          queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
          queryClient.invalidateQueries({ queryKey: ['thread', activeThreadId] });

          // Zustandストアを再読み込み（テーマなどの設定を同期）
          useAppStore.persist.rehydrate();
        }
      });
    };

    setupFocusListener();

    return () => {
      unlisten?.();
    };
  }, [queryClient, activeThreadId]);

  useEffect(() => {
    if (models.length > 0 && selectedModelId) {
      // 現在の選択モデルが有効なリストにあるか確認（プロバイダー切り替え時などのため）
      // プロバイダーIDも考慮してチェック
      const isValid = models.some(
        (m) =>
          m.id === selectedModelId && (!selectedProviderId || m.providerId === selectedProviderId),
      );
      if (!isValid) {
        // 無効なら先頭の有効なモデルを選択
        const firstEnabled = models.find((m) => m.isEnabled) || models[0];
        if (firstEnabled) {
          setSelectedModelId(firstEnabled.id);
          setSelectedProviderId(firstEnabled.providerId);
        }
      }
    } else if (models.length > 0 && !selectedModelId) {
      const firstEnabled = models.find((m) => m.isEnabled) || models[0];
      setSelectedModelId(firstEnabled.id);
      setSelectedProviderId(firstEnabled.providerId);
    }
  }, [models, selectedModelId, selectedProviderId]);

  // スレッドの設定を取得（アクティブスレッド変更時の同期用）
  const { data: threadSettings } = useQuery({
    queryKey: ['threadSettings', activeThreadId],
    queryFn: () =>
      activeThreadId ? db.threadSettings.where({ threadId: activeThreadId }).first() : undefined,
    enabled: !!activeThreadId,
  });

  // スレッド変更または設定変更時にヘッダーのモデル選択を同期
  useEffect(() => {
    if (activeThreadId) {
      if (threadSettings?.modelId) {
        // 既存スレッド設定があれば反映
        setSelectedModelId(threadSettings.modelId);
        if (threadSettings.providerId) {
          setSelectedProviderId(threadSettings.providerId);
        }
      }
    } else if (draftThreadSettings.modelId) {
      // 新規チャット時はドラフト設定を反映
      setSelectedModelId(draftThreadSettings.modelId);
      if (draftThreadSettings.providerId) {
        setSelectedProviderId(draftThreadSettings.providerId);
      }
    }
  }, [activeThreadId, threadSettings, draftThreadSettings]);

  useEffect(() => {
    // ブラウザデバッグ用、またはTauri環境での判定
    const params = new URLSearchParams(window.location.search);
    const forceLauncher = params.get('mode') === 'launcher';

    if (forceLauncher) {
      setIsLauncher(true);
      setActiveThreadId(null);
    } else if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const windowLabel = getCurrentWindow().label;
      const launcher = windowLabel === 'launcher';
      setIsLauncher(launcher);

      if (launcher) {
        setActiveThreadId(null);
      }
    }
  }, [setActiveThreadId, setIsLauncher]);

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeThreadId],
    queryFn: () => (activeThreadId ? getActivePathMessages(activeThreadId) : []),
    enabled: true,
  });

  const { data: activeThread } = useQuery<Thread | undefined>({
    queryKey: ['thread', activeThreadId],
    queryFn: () => (activeThreadId ? db.threads.get(activeThreadId) : undefined),
    enabled: !!activeThreadId,
  });

  useEffect(() => {
    if (activeThread) {
      setTitleInput(activeThread.title);
    }
  }, [activeThread]);

  // Scroll & Auto-scroll logic
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // メッセージが更新されたときにスクロール制御
  // biome-ignore lint/correctness/useExhaustiveDependencies: メッセージ更新時のその他依存関係整理
  useEffect(() => {
    // ユーザーが自発的に上にスクロールしている場合は勝手にスクロールしない
    if (isAtBottom) {
      scrollToBottom();
    } else {
      // 下にいないのに新しいメッセージが来た -> ボタンを表示して通知
      // ただしストリーミング中は頻繁に更新されるため、ストリーミング開始時などは考慮が必要
      // ここでは簡易的に「一番下じゃないならボタンを出す」
      setShowScrollButton(true);
    }
  }, [messages, streamingContent, activeThreadId]);

  // スクロールイベントハンドラ
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;

    // 余裕を持って判定 (10px)
    const newIsAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(newIsAtBottom);

    if (newIsAtBottom) {
      setShowScrollButton(false);
    } else {
      // メッセージが画面外にある程度ある場合のみボタンを表示する (ランチャーモード対策)
      // ランチャーモードでメッセージが少ない場合はスクロール自体が発生しないか、距離が短い
      const hasScrollableContent = scrollHeight > clientHeight + 20;
      if (hasScrollableContent) {
        setShowScrollButton(true);
      } else {
        setShowScrollButton(false);
      }
    }
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
    setShowScrollButton(false);
  }, []);

  // スレッド切り替え時は強制的に下にスクロール
  // biome-ignore lint/correctness/useExhaustiveDependencies: スレッド切り替え時にスクロール
  useEffect(() => {
    scrollToBottom();
  }, [activeThreadId, scrollToBottom]);

  // ユーザーが送信した直後は強制スクロールするためのハンドリング
  // messagesの更新検知だけだと、AIの応答（ストリーミング開始）と区別がつかないことがあるため
  // 送信アクション（handleSend）内で明示的にフラグを立てるか、
  // ここで「最後のメッセージがUserなら強制スクロール」というLogicを入れる
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user') {
        scrollToBottom();
      }
    }
  }, [messages, scrollToBottom]);

  // メッセージ追加時のスクロール制御 (Old logic removed/merged above)
  const prevMessagesLengthRef = useRef(messages.length);
  useEffect(() => {
    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  const handleTitleUpdate = async () => {
    if (activeThreadId && titleInput.trim()) {
      await db.threads.update(activeThreadId, { title: titleInput });
      queryClient.invalidateQueries({ queryKey: ['thread', activeThreadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    }
    setEditingTitle(false);
  };

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
    [],
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
            // スクロールはuseEffectで行うため削除
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
    onSuccess: (threadId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
    onError: (error) => {
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
        console.log('Generation cancelled by user');
        return;
      }
      console.error('送信エラー:', error);
      queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
    },
    onSettled: (threadId) => {
      const id = threadId || activeThreadId;
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['messages', id] });
        queryClient.invalidateQueries({ queryKey: ['thread', id] });
      }
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });

  const handleSend = (
    parentId?: number | null,
    overrideText?: string,
    overrideAttachments?: File[],
  ) => {
    // フックの値を使うか、引数でオーバーライドされるか
    // ここではフックの値はこの関数スコープの外にあるため、直接アクセスできない
    // なので、useChatInputのonSendコールバックから呼び出されるときは
    // overrideText, overrideAttachments として渡ってくるように設計するか、
    // あるいは useChatInput の戻り値をここで参照できるようにする必要がある。

    // しかし handleSend はコンポーネント内関数なので、useChatInputの戻り値を参照可能。
    // そのため、ここでは undefined チェックを行う。
    const textToSend = overrideText ?? inputText;
    const attachmentsToSend = overrideAttachments ?? selectedFiles.map((sf) => sf.file);

    if (overrideText === undefined && !textToSend.trim() && attachmentsToSend.length === 0) return;
    if (sendMutation.isPending) return;

    const targetModelId = selectedModelId || (models.length > 0 ? models[0].id : '');
    const currentModel = models.find(
      (m) => m.id === targetModelId && (!selectedProviderId || m.providerId === selectedProviderId),
    );

    if (currentModel) {
      const provider = providers.find((p) => p.id?.toString() === currentModel.providerId);
      if (provider?.requiresApiKey && !provider.apiKey) {
        alert(
          `プロバイダー「${provider.name}」を使用するにはAPIキーの設定が必要です。設定画面からAPIキーを入力してください。`,
        );
        return;
      }
    }

    if (currentModel && !currentModel.isEnabled) {
      alert(
        `モデル「${currentModel.name}」は無効化されているため送信できません。モデル設定から有効化するか、別のモデルを選択してください。`,
      );
      return;
    }

    sendMutation.mutate({
      text: textToSend,
      attachments: attachmentsToSend,
      parentId,
    });

    // inputTextのクリアはuseChatInput側で行われるが、
    // ここで明示的に呼ぶ必要はない（onSendコールバック経由ならフックがクリアする）
    // ただし、handleRegenerate等から呼ばれた場合(overrideTextあり)はクリアしない
  };

  // 入力管理フックの使用
  const {
    inputText,
    setInputText,
    selectedFiles,
    textareaRef,
    fileInputRef,
    handleInputChange,
    handleFileSelect,
    handleRemoveFile,
    handlePaste,
    handleKeyDown,
    handleSend: triggerSend,
  } = useChatInput({
    onSend: (text, files) => handleSend(undefined, text, files),
    sendShortcut,
    isLauncher,
    handleWindowClose,
  });

  const handleCommandSelect = (command: SlashCommand) => {
    setShowSuggest(false);
    if (command.variables.length > 0) {
      setSelectedCommand(command);
    } else {
      setInputText(command.content);
    }
  };

  const handleFormConfirm = (filledPrompt: string) => {
    setInputText(filledPrompt);
    setSelectedCommand(null);
  };

  const handleStop = useCallback(() => {
    if (!activeThreadId) return;
    const controller = abortControllersRef.current.get(activeThreadId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(activeThreadId);
      setStreamingContent('');
      queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
    }
  }, [activeThreadId, queryClient]);

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => {});
  }, []);

  // Ref pattern to break dependency chain and prevent re-renders
  const handleSendRef = useRef(handleSend);
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  const handleRegenerate = useCallback(
    async (messageId: number, type: 'regenerate' | 'branch' = 'branch') => {
      if (!activeThreadId) return;
      if (sendMutation.isPending) return;

      const targetModelId = selectedModelId || (models.length > 0 ? models[0].id : '');
      const currentModel = models.find(
        (m) =>
          m.id === targetModelId && (!selectedProviderId || m.providerId === selectedProviderId),
      );

      if (currentModel && !currentModel.isEnabled) {
        alert(
          `モデル「${currentModel.name}」は無効化されているため送信できません。モデル設定から有効化するか、別のモデルを選択してください。`,
        );
        return;
      }

      const message = await db.messages.get(messageId);
      if (!message) return;

      let parentIdForRegenerate: number | null;

      if (message.role === 'user') {
        if (type === 'regenerate') {
          const allInThread = await db.messages.where('threadId').equals(activeThreadId).toArray();
          const children = allInThread.filter((m) => m.parentId === messageId);
          for (const child of children) {
            if (child.id) {
              await deleteMessageAndDescendants(activeThreadId, child.id);
            }
          }
        }
        parentIdForRegenerate = messageId;
      } else {
        if (type === 'regenerate') {
          await deleteMessageAndDescendants(activeThreadId, messageId);
        }
        parentIdForRegenerate = message.parentId ?? null;
      }

      await queryClient.invalidateQueries({
        queryKey: ['messages', activeThreadId],
      });

      sendMutation.mutate({
        text: '',
        attachments: [],
        parentId: parentIdForRegenerate,
        isRegenerate: true,
      });
    },
    [activeThreadId, sendMutation, selectedModelId, selectedProviderId, models, queryClient],
  );

  const handleEdit = useCallback(
    async (
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
        queryClient.invalidateQueries({
          queryKey: ['messages', activeThreadId],
        });
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
          handleRegenerate(messageId, 'regenerate');
        }
        return;
      }

      // type === 'branch'
      const existingFiles = await db.files.where('messageId').equals(messageId).toArray();
      const keptFiles = existingFiles
        .filter((f) => f.id !== undefined && !removedFileIds.includes(f.id))
        .map((f) => new File([f.blob], f.fileName, { type: f.mimeType }));

      // Use Ref to call handleSend without adding it as a dependency
      handleSendRef.current(message.parentId ?? null, content, [...keptFiles, ...newFiles]);
    },
    [activeThreadId, queryClient, handleRegenerate],
  );

  const handleSwitchBranch = async (targetMessageId: number) => {
    if (!activeThreadId) return;
    await switchBranch(activeThreadId, targetMessageId);
    queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
    queryClient.invalidateQueries({ queryKey: ['thread', activeThreadId] });
  };

  const handleNewChat = useCallback(() => {
    setActiveThreadId(null);
    setInputText('');
    setDraftThreadSettings({});
  }, [setActiveThreadId, setInputText]);

  const handleDraftSave = (settings: Partial<ThreadSettings>) => {
    setDraftThreadSettings(settings);
    if (settings.modelId) {
      setSelectedModelId(settings.modelId);
    }
  };

  // ランチャーモード：ウィンドウサイズ調整
  useEffect(() => {
    if (!isLauncher) return;
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

    const resizeWindow = async () => {
      try {
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const appWindow = getCurrentWindow();
        const currentSize = await appWindow.innerSize();
        const factor = await appWindow.scaleFactor();
        const currentLogicalSize = currentSize.toLogical(factor);

        const shouldExpand =
          messages.length > 0 ||
          activeThreadId ||
          streamingContent ||
          sendMutation.isPending ||
          isSettingsOpen ||
          isCommandManagerOpen ||
          isFileExplorerOpen;

        if (shouldExpand) {
          await appWindow.setSize(
            new LogicalSize(currentLogicalSize.width, WINDOW_DEFAULT_HEIGHT_EXPANDED),
          );
        } else {
          // DOMの高さを計測してウィンドウサイズを決定
          // 少し余裕を持たせる (+20px)
          const contentHeight = document.documentElement.scrollHeight;
          const minHeight = LAUNCHER_MIN_HEIGHT;
          const maxCompactHeight = LAUNCHER_MAX_HEIGHT;

          let targetHeight = Math.max(minHeight, Math.min(contentHeight + 20, maxCompactHeight));

          // サジェスト表示中は少し広げる
          if (showSuggest) {
            targetHeight = Math.max(targetHeight, LAUNCHER_SUGGEST_MIN_HEIGHT);
          }

          await appWindow.setSize(new LogicalSize(currentLogicalSize.width, targetHeight));
        }
      } catch (e) {
        console.error('Failed to resize window:', e);
      }
    };

    // リサイズ監視用のObserver
    const observer = new ResizeObserver(() => {
      resizeWindow();
    });
    observer.observe(document.body);

    resizeWindow();

    return () => {
      observer.disconnect();
    };
  }, [
    isLauncher,
    messages.length,
    activeThreadId,
    streamingContent,
    sendMutation.isPending,
    isSettingsOpen,
    isCommandManagerOpen,
    isFileExplorerOpen,
    showSuggest,
  ]);

  // スラッシュコマンド監視
  useEffect(() => {
    if (inputText.startsWith('/') && !selectedCommand) {
      const query = inputText.slice(1).split(' ')[0] || '';
      setSuggestQuery(query);
      setShowSuggest(true);
    } else {
      setShowSuggest(false);
    }
  }, [inputText, selectedCommand]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 子画面が開いている場合はそちらを閉じる
        if (isThreadSettingsOpen) {
          setThreadSettingsOpen(false);
          return;
        }
        if (isSettingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (isCommandManagerOpen) {
          setCommandManagerOpen(false);
          return;
        }
        if (isFileExplorerOpen) {
          setFileExplorerOpen(false);
          return;
        }

        // サジェスト等が閉じている場合はウィンドウを隠す（ランチャーモード時）
        if (!showSuggest && !selectedCommand && isLauncher) {
          handleWindowClose();
        }
        if (isToolMenuOpen) {
          setIsToolMenuOpen(false);
          return;
        }
      }

      // 新規チャット (Ctrl + N)
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewChat();
        return;
      }

      // 設定 (Ctrl + ,)
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      // サイドバーのトグル (Ctrl + [)
      if ((e.ctrlKey || e.metaKey) && e.key === '[') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // モデル切り替え (Ctrl + M)
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        const enabledModels = models.filter((m) => m.isEnabled);
        if (enabledModels.length === 0) return;

        const currentIndex = enabledModels.findIndex((m) => m.id === selectedModelId);
        const nextIndex = (currentIndex + 1) % enabledModels.length;
        setSelectedModelId(enabledModels[nextIndex].id);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    isLauncher,
    showSuggest,
    selectedCommand,
    isSettingsOpen,
    setSettingsOpen,
    isCommandManagerOpen,
    setCommandManagerOpen,
    isFileExplorerOpen,
    setFileExplorerOpen,
    isThreadSettingsOpen,
    setThreadSettingsOpen,
    isToolMenuOpen,
    handleWindowClose,
    handleNewChat,
    toggleSidebar,
    models,
    selectedModelId,
  ]);

  const placeholderText =
    sendShortcut === 'enter'
      ? 'メッセージを入力... (Enterで送信)'
      : 'メッセージを入力... (Ctrl+Enterで送信)';

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground relative font-sans ${isLauncher ? 'rounded-xl border shadow-2xl' : ''}`}
    >
      <ChatHeader
        isLauncher={isLauncher}
        activeThreadId={activeThreadId}
        activeThreadTitle={activeThread?.title}
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
        onNewChat={handleNewChat}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenThreadSettings={() => setThreadSettingsOpen(true)}
        onOpenFileExplorer={(tid) => setFileExplorerOpen(true, tid)}
        onCloseLauncher={handleWindowClose}
        models={models}
        providers={providers}
        selectedModelId={selectedModelId}
        selectedProviderId={selectedProviderId}
        handleModelChange={(mId, pId) => handleModelChange(mId, pId)}
        editingTitle={editingTitle}
        titleInput={titleInput}
        setTitleInput={setTitleInput}
        setEditingTitle={setEditingTitle}
        handleTitleUpdate={handleTitleUpdate}
        enabledTools={enabledTools}
        setToolEnabled={setToolEnabled}
        hasDraftSettings={Object.keys(draftThreadSettings).length > 0}
        isModelsLoading={isModelsLoading || isModelsRefetching}
      />

      <div className="flex flex-1 overflow-hidden relative w-full">
        {isSidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-80 md:hidden cursor-default"
            onClick={toggleSidebar}
            aria-label="サイドバーを閉じる"
          />
        )}

        {!isLauncher && (
          <div
            className={`relative z-90 transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${isSidebarOpen ? 'translate-x-0 w-64 opacity-100' : '-translate-x-full w-0 opacity-0'}`}
          >
            <Sidebar className="h-full" onClose={toggleSidebar} onNewChat={handleNewChat} />
          </div>
        )}

        <main className="flex-1 flex flex-col relative h-full w-full min-w-0 overflow-hidden">
          <ThreadSettingsModal
            isOpen={isThreadSettingsOpen}
            onClose={() => setThreadSettingsOpen(false)}
            threadId={activeThreadId || undefined}
            initialSettings={!activeThreadId ? draftThreadSettings : undefined}
            onSave={!activeThreadId ? handleDraftSave : undefined}
          />

          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            key={activeThreadId || 'new-thread'}
            className={`flex-1 overflow-y-auto space-y-6 md:space-y-8 scroll-smooth custom-scrollbar ${isLauncher ? 'px-3 py-3' : 'px-4 py-4 md:px-8'}`}
          >
            {messages.length === 0 && !sendMutation.isPending && !isLauncher && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-30 select-none">
                <div className="w-16 h-16 bg-muted rounded-3xl flex items-center justify-center mb-6 border border-border">
                  <div className="w-10 h-10 border-2 border-current rounded-lg flex items-center justify-center">
                    <span className="font-bold text-xl leading-none">AI</span>
                  </div>
                </div>
                <p className="text-base font-semibold tracking-wide uppercase">
                  AIと会話を始めましょう
                </p>
                <p className="text-xs mt-2 opacity-60">
                  下のボックスにメッセージを入力してください
                </p>
              </div>
            )}
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                onCopy={handleCopy}
                onEdit={handleEdit}
                onRegenerate={handleRegenerate}
                onSwitchBranch={handleSwitchBranch}
                isModelEnabled={
                  models.find(
                    (mod) =>
                      mod.id === (selectedModelId || (models.length > 0 ? models[0].id : '')),
                  )?.isEnabled ?? true
                }
              />
            ))}
            {sendMutation.isPending && messages.length > 0 && !streamingContent && (
              <ChatMessage
                message={{
                  id: 0,
                  role: 'assistant',
                  content: '',
                  threadId: 0,
                  createdAt: new Date(),
                  model: 'AI',
                }}
                isThinking={true}
                onCopy={() => {}}
              />
            )}
            {streamingContent && (
              <ChatMessage
                message={{
                  role: 'assistant',
                  content: streamingContent,
                  threadId: 0,
                  createdAt: new Date(),
                }}
                isStreaming
                onCopy={handleCopy}
              />
            )}
            <div className="h-4" />
            <div ref={messagesEndRef} />
          </div>

          <ScrollToBottomButton
            show={showScrollButton}
            onClick={scrollToBottom}
            hasNewMessage={
              !isAtBottom &&
              (!!streamingContent ||
                (messages.length > 0 && messages[messages.length - 1].role !== 'user'))
            }
          />

          <div
            className={`pt-0 bg-gradient-to-t from-background via-background/95 to-transparent z-10 w-full shrink-0 ${isLauncher ? 'p-1.5' : 'p-2.5 md:px-5 md:pb-3'}`}
          >
            <div className="mx-auto relative w-full">
              {showSuggest && (
                <SlashCommandSuggest
                  query={suggestQuery}
                  onSelect={handleCommandSelect}
                  onClose={() => setShowSuggest(false)}
                />
              )}
              {selectedCommand && (
                <SlashCommandForm
                  command={selectedCommand}
                  onConfirm={handleFormConfirm}
                  onCancel={() => setSelectedCommand(null)}
                />
              )}
              <div className="md:px-4">
                {sendMutation.isPending && (
                  <div className="flex justify-center bg-gradient-to-t from-background/50 via-background/30 to-background/10 z-10 w-full h-0 shrink-0">
                    <button
                      type="button"
                      onClick={handleStop}
                      className="absolute -top-[44px] flex items-center gap-2 bg-background border shadow-lg px-4 py-2 rounded-full text-sm font-medium hover:bg-muted transition-colors animate-in fade-in slide-in-from-bottom-2"
                    >
                      <div className="w-2.5 h-2.5 bg-destructive rounded-[2px]" />
                      生成を停止
                    </button>
                  </div>
                )}
                <ChatInputArea
                  inputText={inputText}
                  handleSend={triggerSend}
                  fileInputRef={fileInputRef}
                  handleFileSelect={handleFileSelect}
                  handleRemoveFile={handleRemoveFile}
                  selectedFiles={selectedFiles}
                  placeholderText={placeholderText}
                  isPending={sendMutation.isPending}
                  handleInputChange={handleInputChange}
                  handlePaste={handlePaste}
                  handleKeyDown={handleKeyDown}
                  textareaRef={textareaRef}
                  isModelEnabled={
                    models.find(
                      (mod) =>
                        mod.id === (selectedModelId || (models.length > 0 ? models[0].id : '')),
                    )?.isEnabled ?? true
                  }
                />
              </div>
            </div>
          </div>

          {isCommandManagerOpen && (
            <div className="absolute inset-0 z-50 flex flex-col bg-background animate-in slide-in-from-right">
              <CommandManager />
            </div>
          )}

          {isSettingsOpen && (
            <div className="absolute inset-0 z-50 flex flex-col bg-background animate-in slide-in-from-right">
              <SettingsView />
            </div>
          )}

          {isFileExplorerOpen && (
            <div className="absolute inset-0 z-50 flex flex-col bg-background animate-in slide-in-from-right">
              <FileExplorer threadId={fileExplorerThreadId} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function MessageItem({
  message,
  onCopy,
  onEdit,
  onRegenerate,
  onSwitchBranch,
  isModelEnabled,
}: {
  message: Message;
  onCopy: (content: string) => void;
  onEdit: (id: number, content: string, type: 'save' | 'regenerate' | 'branch') => void;
  onRegenerate: (id: number, type: 'regenerate' | 'branch') => void;
  onSwitchBranch: (id: number) => void;
  isModelEnabled: boolean;
}) {
  const { data: branchInfo } = useQuery({
    queryKey: ['branchInfo', message.id],
    queryFn: () => (message.id ? getMessageBranchInfo(message.id) : null),
    enabled: !!message.id,
  });

  const { data: attachments } = useQuery({
    queryKey: ['attachments', message.id],
    queryFn: () => {
      if (!message.id) return [];
      return db.files.where('messageId').equals(message.id).toArray();
    },
    enabled: !!message.id,
  });

  return (
    <ChatMessage
      id={`message-${message.id}`}
      message={message}
      attachments={attachments}
      onCopy={onCopy}
      onEdit={onEdit}
      onRegenerate={onRegenerate}
      isModelEnabled={isModelEnabled}
      branchInfo={
        branchInfo
          ? {
              current: branchInfo.current,
              total: branchInfo.total,
              onSwitch: (index: number) => {
                const target = branchInfo.siblings[index - 1];
                if (target?.id) onSwitchBranch(target.id);
              },
            }
          : undefined
      }
    />
  );
}
