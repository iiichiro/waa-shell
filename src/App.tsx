import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';
import type { ChangeEvent, ClipboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatHeader } from './components/chat/ChatHeader';
import { ChatInputArea, type SelectedFile } from './components/chat/ChatInputArea';
import { ChatMessage } from './components/chat/ChatMessage';
import { ThreadSettingsModal } from './components/chat/ThreadSettingsModal';
import { CommandManager } from './components/command/CommandManager';
import { SlashCommandForm } from './components/command/SlashCommandForm';
import { SlashCommandSuggest } from './components/command/SlashCommandSuggest';
import { FileExplorer } from './components/common/FileExplorer';
import { Sidebar } from './components/layout/Sidebar';
import { SettingsView } from './components/settings/SettingsView';
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
import { blobToDataURL } from './lib/utils/image';
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

  // const [activeThread, setActiveThread] = useState<Thread | null>(null); // useQueryで取得するため削除
  const [streamingContent, setStreamingContent] = useState('');
  // const [messages, setMessages] = useState<Message[]>([]); // useQueryで取得するため削除
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>(''); // モデル選択状態の管理

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

  // アプリケーション起動時の初期化
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: models = [] } = useQuery<ModelInfo[]>({
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
    (id: string) => {
      setSelectedModelId(id);
      if (!activeThreadId) {
        // 新規チャット時はドラフト設定も更新して同期を保つ
        setDraftThreadSettings((prev) => ({ ...prev, modelId: id }));
      }
    },
    [activeThreadId],
  );

  useEffect(() => {
    if (models.length > 0 && selectedModelId) {
      // 現在の選択モデルが有効なリストにあるか確認（プロバイダー切り替え時などのため）
      const isValid = models.some((m) => m.id === selectedModelId);
      if (!isValid) {
        // 無効なら先頭の有効なモデルを選択
        const firstEnabled = models.find((m) => m.isEnabled) || models[0];
        if (firstEnabled) setSelectedModelId(firstEnabled.id);
      }
    } else if (models.length > 0 && !selectedModelId) {
      const firstEnabled = models.find((m) => m.isEnabled) || models[0];
      setSelectedModelId(firstEnabled.id);
    }
  }, [models, selectedModelId]);

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
        // 既存スレッド設定があれば反映（リストになくてもIDはセットする→表示側で未設定扱い等が可能）
        setSelectedModelId(threadSettings.modelId);
      }
    } else if (draftThreadSettings.modelId) {
      // 新規チャット時はドラフト設定を反映
      setSelectedModelId(draftThreadSettings.modelId);
    }
  }, [activeThreadId, threadSettings, draftThreadSettings.modelId]);

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
  }, [setActiveThreadId, setIsLauncher]); // Run only once as these are stable

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
  ]);

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeThreadId],
    queryFn: () => (activeThreadId ? getActivePathMessages(activeThreadId) : []),
    // 新規スレッド作成中もクエリ自体は有効にしておく（更新を受け取れるように）
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

  // Auto-scroll to bottom of chat
  // biome-ignore lint/correctness/useExhaustiveDependencies: Auto-scroll trigger
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeThreadId]);

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
        // IDをセット
        setActiveThreadId(threadId);
        // IDが確実に入れ替わった状態でクエリを叩くため、ここで一度invalidate
        await queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
      }

      // 新規スレッドかつドラフト設定がある場合、設定を保存
      if (isNewThread && Object.keys(draftThreadSettings).length > 0) {
        await db.threadSettings.add({
          ...draftThreadSettings,
          threadId,
          // modelIdがドラフトにない場合は現在の選択モデルを使用
          modelId: draftThreadSettings.modelId || selectedModelId || models[0]?.id || '',
        } as ThreadSettings);
        // ドラフトをクリア
        setDraftThreadSettings({});
      }

      // このスレッド用のコントローラーがあればアボート
      const existingController = abortControllersRef.current.get(threadId);
      if (existingController) {
        existingController.abort();
        abortControllersRef.current.delete(threadId);
      }
      // 新しいコントローラーを作成
      const abortController = new AbortController();
      abortControllersRef.current.set(threadId, abortController);

      const targetModel = selectedModelId || (models.length > 0 ? models[0].id : '');
      const selectedModel = models.find((m) => m.id === targetModel);
      const shouldStream = selectedModel ? selectedModel.enableStream : true;

      try {
        const response = await sendMessage(threadId, text, targetModel, {
          stream: shouldStream,
          // 引数で渡された添付ファイルを使用（外部のselectedFiles状態に依存しない）
          attachments: isRegenerate ? [] : attachments,
          parentId,

          onUserMessageSaved: async () => {
            // ユーザーメッセージが保存された直後のタイミングでUIを更新（AI応答待ちの間もメッセージを表示）
            await queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
          },
          signal: abortController.signal,
        });

        // ユーザーメッセージが保存された直後のタイミングでUIを更新
        queryClient.invalidateQueries({ queryKey: ['messages', threadId] });

        await processStreamResponse(response);

        // ストリーミング完了後の最終的なメッセージ状態を反映
        queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
        queryClient.invalidateQueries({ queryKey: ['thread', threadId] });

        // タイトル自動生成 (バックグラウンド実行)
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
      // 全ての必要なクエリをリフレッシュ
      queryClient.invalidateQueries({ queryKey: ['messages', threadId] });
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
    onError: (error) => {
      if (error.name === 'AbortError' || error.message.includes('aborted')) {
        console.log('Generation cancelled by user');
        return; // キャンセル時はエラー表示しない
      }
      console.error('送信エラー:', error);
      // エラー時もメッセージリストを即座に更新（保存されたエラーを表示させる）
      queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
    },
    onSettled: (threadId) => {
      // 念のため settled でも invalidate して、リストの整合性を保つ
      const id = threadId || activeThreadId;
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['messages', id] });
        queryClient.invalidateQueries({ queryKey: ['thread', id] });
      }
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });

  // ランチャーモード：メッセージの有無とテキスト行数でウィンドウサイズを動的に変更
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

        // 履歴あり、またはストリーミング中、または送信中、または設定等のサブ画面が開いている場合は大きいウィンドウ
        const shouldExpand =
          messages.length > 0 ||
          activeThreadId ||
          streamingContent ||
          sendMutation.isPending ||
          isSettingsOpen ||
          isCommandManagerOpen ||
          isFileExplorerOpen;

        if (shouldExpand) {
          await appWindow.setSize(new LogicalSize(currentLogicalSize.width, 800));
        } else {
          // 履歴なし且つ入力待機中：コンパクトウィンドウ（テキスト行数に応じて高さ調整）
          const lineCount = (inputText.match(/\n/g) || []).length + 1;
          const baseHeight = 120; // ヘッダー(44px)+入力欄+パディングを考慮して少し広げる
          const lineHeight = 20;
          const maxCompactHeight = 300;
          const height = Math.min(baseHeight + (lineCount - 1) * lineHeight, maxCompactHeight);
          await appWindow.setSize(new LogicalSize(currentLogicalSize.width, height));
        }
      } catch (e) {
        console.error('Failed to resize window:', e);
      }
    };

    resizeWindow();
  }, [
    isLauncher,
    messages.length,
    activeThreadId,
    streamingContent,
    sendMutation.isPending,
    inputText,
    isSettingsOpen,
    isCommandManagerOpen,
    isFileExplorerOpen,
  ]);

  const handleSend = (
    parentId?: number | null,
    overrideText?: string,
    overrideAttachments?: File[],
  ) => {
    const textToSend = overrideText ?? inputText;
    const attachmentsToSend = overrideAttachments ?? selectedFiles.map((sf) => sf.file);

    // 空文字でも overrideText が指定されている（再生成）か、ファイルがある場合は送信を許可
    if (overrideText === undefined && !textToSend.trim() && attachmentsToSend.length === 0) return;
    if (sendMutation.isPending) return;

    const targetModelId = selectedModelId || (models.length > 0 ? models[0].id : '');
    const currentModel = models.find((m) => m.id === targetModelId);

    if (currentModel) {
      // 選択されたモデルのプロバイダーを確認
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

    // 送信前にメッセージを空にする。
    // クエリのinvalidateはmutationFnの中で適切なIDに対して行うように変更
    sendMutation.mutate({
      text: textToSend,
      attachments: attachmentsToSend,
      parentId,
    });
    if (!overrideText) setInputText('');
    setSelectedFiles([]);
  };

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputText(value);
    if (value.startsWith('/') && !selectedCommand) {
      const query = value.slice(1).split(' ')[0] || '';
      setSuggestQuery(query);
      setShowSuggest(true);
    } else {
      setShowSuggest(false);
    }
  };

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
      setStreamingContent(''); // ストリーミング表示をクリア
      // 念のためクエリを無効化して最新の状態（中断時点まで）を表示
      queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
    }
  }, [activeThreadId, queryClient]);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles: SelectedFile[] = [];
      for (const file of Array.from(e.target.files)) {
        const preview = await blobToDataURL(file);
        newFiles.push({ file, preview });
      }
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      const newFiles: SelectedFile[] = [];
      for (const file of Array.from(e.clipboardData.files)) {
        const preview = await blobToDataURL(file);
        newFiles.push({ file, preview });
      }
      setSelectedFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {});
  };

  const handleEdit = async (
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
        // 現在のメッセージより後のメッセージを削除
        const allInThread = await db.messages.where('threadId').equals(activeThreadId).toArray();
        const children = allInThread.filter((m) => m.parentId === messageId);
        for (const child of children) {
          if (child.id) {
            await deleteMessageAndDescendants(activeThreadId, child.id);
          }
        }
        // 再生成
        handleRegenerate(messageId, 'regenerate');
      }
      return;
    }

    // type === 'branch'
    // 既存のファイルから削除対象を除外して File オブジェクトに変換
    const existingFiles = await db.files.where('messageId').equals(messageId).toArray();
    const keptFiles = existingFiles
      .filter((f) => f.id !== undefined && !removedFileIds.includes(f.id))
      .map((f) => new File([f.blob], f.fileName, { type: f.mimeType }));

    // 既存の維持分と新規追加分を合わせて送信
    handleSend(message.parentId ?? null, content, [...keptFiles, ...newFiles]);
  };

  const handleRegenerate = async (messageId: number, type: 'regenerate' | 'branch' = 'branch') => {
    if (!activeThreadId) return;
    if (sendMutation.isPending) return; // 送信中は何もしない

    const targetModelId = selectedModelId || (models.length > 0 ? models[0].id : '');
    const currentModel = models.find((m) => m.id === targetModelId);
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
      // ユーザーメッセージからの再生成
      if (type === 'regenerate') {
        // 子メッセージ（アシスタント応答）を削除してから再生成
        const allInThread = await db.messages.where('threadId').equals(activeThreadId).toArray();
        const children = allInThread.filter((m) => m.parentId === messageId);
        for (const child of children) {
          if (child.id) {
            await deleteMessageAndDescendants(activeThreadId, child.id);
          }
        }
      }
      // ユーザーメッセージを親として再生成
      parentIdForRegenerate = messageId;
    } else {
      // アシスタントメッセージからの再生成
      if (type === 'regenerate') {
        // このアシスタントメッセージとその子孫を削除
        await deleteMessageAndDescendants(activeThreadId, messageId);
      }
      // 親メッセージ（ユーザーメッセージ）を起点に再生成
      parentIdForRegenerate = message.parentId ?? null;
    }

    // UIを更新してメッセージ削除を反映
    await queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });

    // sendMutationを使用して再生成を実行
    // isRegenerate=trueで呼び出すことで、添付ファイルなしで空文字送信（AI応答のみ生成）
    sendMutation.mutate({
      text: '',
      attachments: [],
      parentId: parentIdForRegenerate,
      isRegenerate: true,
    });
  };

  const handleSwitchBranch = async (targetMessageId: number) => {
    if (!activeThreadId) return;
    await switchBranch(activeThreadId, targetMessageId);
    queryClient.invalidateQueries({ queryKey: ['messages', activeThreadId] });
    queryClient.invalidateQueries({ queryKey: ['thread', activeThreadId] });
  };

  const handleNewChat = () => {
    setActiveThreadId(null);
    setInputText('');
    setDraftThreadSettings({}); // ドラフト設定もリセット
  };

  const handleDraftSave = (settings: Partial<ThreadSettings>) => {
    setDraftThreadSettings(settings);
    // モーダル保存時、モデルIDが含まれていればヘッダーも更新
    if (settings.modelId) {
      setSelectedModelId(settings.modelId);
    }
  };

  const placeholderText =
    sendShortcut === 'enter'
      ? 'メッセージを入力... (Enterで送信)'
      : 'メッセージを入力... (Ctrl+Enterで送信)';

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden bg-background text-foreground relative font-sans ${isLauncher ? 'rounded-xl border shadow-2xl' : ''}`}
    >
      {/* モバイルサイドバーオーバーレイ */}
      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden cursor-default"
          onClick={toggleSidebar}
          aria-label="サイドバーを閉じる"
        />
      )}

      {!isLauncher && (
        <div
          className={`fixed inset-y-0 left-0 z-50 transition-all duration-300 ease-in-out md:relative overflow-hidden shrink-0 ${
            isSidebarOpen ? 'translate-x-0 w-64 opacity-100' : '-translate-x-full w-0 opacity-0'
          }`}
        >
          <Sidebar className="h-full" onClose={toggleSidebar} onNewChat={handleNewChat} />
        </div>
      )}

      <main className="flex-1 flex flex-col relative h-full w-full min-w-0 overflow-hidden">
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
          handleModelChange={handleModelChange}
          editingTitle={editingTitle}
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          setEditingTitle={setEditingTitle}
          handleTitleUpdate={handleTitleUpdate}
          enabledTools={enabledTools}
          setToolEnabled={setToolEnabled}
          hasDraftSettings={Object.keys(draftThreadSettings).length > 0}
        />

        <ThreadSettingsModal
          isOpen={isThreadSettingsOpen}
          onClose={() => setThreadSettingsOpen(false)}
          threadId={activeThreadId || undefined}
          initialSettings={!activeThreadId ? draftThreadSettings : undefined}
          onSave={!activeThreadId ? handleDraftSave : undefined}
        />

        <div
          key={activeThreadId || 'new-thread'}
          className={`flex-1 overflow-y-auto space-y-6 md:space-y-8 scroll-smooth custom-scrollbar ${isLauncher ? 'px-3 py-3' : 'px-4 py-4 md:px-8'}`}
        >
          {messages.length === 0 && !isLauncher && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-30 select-none">
              <div className="w-16 h-16 bg-muted rounded-3xl flex items-center justify-center mb-6 border border-border">
                <div className="w-10 h-10 border-2 border-current rounded-lg flex items-center justify-center">
                  <span className="font-bold text-xl leading-none">AI</span>
                </div>
              </div>
              <p className="text-base font-semibold tracking-wide uppercase">
                AIと会話を始めましょう
              </p>
              <p className="text-xs mt-2 opacity-60">下のボックスにメッセージを入力してください</p>
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
                  (mod) => mod.id === (selectedModelId || (models.length > 0 ? models[0].id : '')),
                )?.isEnabled ?? true
              }
            />
          ))}
          {/* AI Thinking Indicator: ストリーミング開始前（サーバ接続中）に表示 */}
          {sendMutation.isPending && !streamingContent && (
            <ChatMessage
              message={{
                id: 0,
                role: 'assistant',
                content: '',
                threadId: 0,
                createdAt: new Date(),
                model: 'AI', // または選択中のモデル名を表示
              }}
              isThinking
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
                <div className="flex justify-center mb-2">
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex items-center gap-2 bg-background border shadow-lg px-4 py-2 rounded-full text-sm font-medium hover:bg-muted transition-colors animate-in fade-in slide-in-from-bottom-2"
                  >
                    <div className="w-2.5 h-2.5 bg-destructive rounded-[2px]" />
                    生成を停止
                  </button>
                </div>
              )}
              <ChatInputArea
                inputText={inputText}
                handleSend={() => handleSend()}
                fileInputRef={fileInputRef}
                handleFileSelect={handleFileSelect}
                handleRemoveFile={(index) => {
                  setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
                }}
                selectedFiles={selectedFiles}
                isLauncher={isLauncher}
                placeholderText={placeholderText}
                sendMutation={sendMutation}
                sendShortcut={sendShortcut}
                handleInputChange={handleInputChange}
                handlePaste={handlePaste}
                textareaRef={textareaRef}
                selectedModel={models.find((m) => m.id === selectedModelId)}
              />
            </div>
          </div>
        </div>

        {/* Sub-screen Overlays */}
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

  // メッセージに関連付けられた添付ファイルを取得
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
              onSwitch: (index) => {
                const target = branchInfo.siblings[index - 1];
                if (target?.id) onSwitchBranch(target.id);
              },
            }
          : undefined
      }
    />
  );
}
