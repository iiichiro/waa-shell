import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatHeader } from './components/chat/ChatHeader';
import { ChatInputArea } from './components/chat/ChatInputArea';
import { ChatMessage } from './components/chat/ChatMessage';
import { ScrollToBottomButton } from './components/chat/ScrollToBottomButton';
import { ThreadSettingsModal } from './components/chat/ThreadSettingsModal';
import { SlashCommandForm } from './components/command/SlashCommandForm';
import { SlashCommandSuggest } from './components/command/SlashCommandSuggest';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { useAppWindow } from './hooks/useAppWindow';

// Lazy load heavy components
const CommandManager = lazy(() =>
  import('./components/command/CommandManager').then((m) => ({ default: m.CommandManager })),
);
const FileExplorer = lazy(() =>
  import('./components/common/FileExplorer').then((m) => ({ default: m.FileExplorer })),
);
const Sidebar = lazy(() =>
  import('./components/layout/Sidebar').then((m) => ({ default: m.Sidebar })),
);
const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView })),
);

import { useChatInput } from './hooks/useChatInput';
import { useChatOperations } from './hooks/useChatOperations';
import { useChatThread } from './hooks/useChatThread';
import { useConfirm } from './hooks/useConfirm';
import { db, type Message, type Provider, type SlashCommand, type ThreadSettings } from './lib/db';
import { getMessageBranchInfo } from './lib/db/threads';
import { summarizeThread } from './lib/services/ChatService';
import { listModels, type ModelInfo } from './lib/services/ModelService';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const {
    activeThreadId,
    isSidebarOpen,
    isLauncher,
    isSettingsOpen,
    setSettingsOpen,
    isCommandManagerOpen,
    isFileExplorerOpen,
    fileExplorerThreadId,
    setFileExplorerOpen,
    isThreadSettingsOpen,
    setThreadSettingsOpen,
    sendShortcut,
    setActiveThreadId,
    toggleSidebar,
    autoGenerateTitle,
    titleGenerationProvider,
    titleGenerationModel,
    enableSummarizeAndNewChat,
    summarizeProvider,
    summarizeModel,
    enabledTools,
    setToolEnabled,
  } = useAppStore();

  const headerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);

  const { confirmProps } = useConfirm();

  // ドラフト設定
  const [draftThreadSettings, setDraftThreadSettings] = useState<Partial<ThreadSettings>>({});

  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState('');
  const [selectedCommand, setSelectedCommand] = useState<SlashCommand | null>(null);

  const [isSummarizing, setIsSummarizing] = useState(false);

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(() => {});
  }, []);

  // ウィンドウ制御・チャットロジック・操作フックの呼び出し
  const {
    messages,
    activeThread,
    scrollContainerRef,
    messagesEndRef,
    isAtBottom,
    showScrollButton,
    scrollToBottom,
    handleScroll,
    titleInput,
    setTitleInput,
    editingTitle,
    setEditingTitle,
    handleTitleUpdate,
    streamingContent,
    setStreamingContent,
  } = useChatThread({ activeThreadId });

  const {
    data: models = [],
    isLoading: isModelsLoading,
    isRefetching: isModelsRefetching,
  } = useQuery<ModelInfo[]>({
    queryKey: ['models'],
    queryFn: () => listModels(),
    staleTime: Infinity,
  });

  const { data: providers = [] } = useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: () => db.providers.toArray(),
  });

  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');

  useEffect(() => {
    if (!selectedModelId && models.length > 0) {
      // 有効なモデルの先頭、または単に先頭のモデルを選択
      const defaultModel = models.find((m) => m.isEnabled) || models[0];
      setSelectedModelId(defaultModel.id);
      setSelectedProviderId(defaultModel.providerId);
    }
  }, [models, selectedModelId]);

  const handleModelChange = useCallback((modelId: string, providerId: string) => {
    setSelectedModelId(modelId);
    setSelectedProviderId(providerId);
  }, []);

  const shouldExpand = !!(
    messages.length > 0 ||
    activeThreadId ||
    streamingContent ||
    isSettingsOpen
  );

  // ストリーミング開始時刻を保持するためのref
  const streamingDate = useRef(new Date());
  const prevStreamingContentRef = useRef(streamingContent);
  useEffect(() => {
    if (streamingContent && !prevStreamingContentRef.current) {
      streamingDate.current = new Date();
    }
    prevStreamingContentRef.current = streamingContent;
  }, [streamingContent]);

  const { handleWindowClose } = useAppWindow({
    isLauncher,
    shouldExpand,
    showSuggest,
    messagesCount: messages.length,
    headerRef,
    scrollContainerRef,
    inputAreaRef,
  });

  const { sendMutation, handleSend, handleStop, handleRegenerate, handleSwitchBranch, handleEdit } =
    useChatOperations({
      activeThreadId,
      setActiveThreadId,
      selectedModelId,
      models: models as ModelInfo[],
      draftThreadSettings,
      setDraftThreadSettings,
      setStreamingContent,
      autoGenerateTitle,
      titleGenerationProvider,
      titleGenerationModel,
    });

  // 仮想スクロールの設定
  const rowVirtualizer = useVirtualizer({
    count:
      messages.length +
      (sendMutation.isPending && !streamingContent ? 1 : 0) +
      (streamingContent ? 1 : 0),
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 150, // メッセージの推定高さ
    overscan: 5, // 描画範囲外の確保数
  });

  const {
    inputText,
    setInputText,
    selectedFiles,
    textareaRef,
    fileInputRef,
    handleInputChange: originalHandleInputChange,
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

  const placeholderText =
    sendShortcut === 'enter'
      ? 'メッセージを入力... (Enterで送信)'
      : 'メッセージを入力... (Ctrl+Enterで送信)';

  // 選択中のモデルが有効かどうか
  const isSelectedModelEnabled = useMemo(() => {
    const targetId = selectedModelId || (models.length > 0 ? models[0].id : '');
    return models.find((mod) => mod.id === targetId)?.isEnabled ?? true;
  }, [models, selectedModelId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    originalHandleInputChange(e);

    if (value.startsWith('/')) {
      const query = value.slice(1).split(' ')[0];
      setSuggestQuery(query);
      setShowSuggest(true);
    } else {
      setShowSuggest(false);
    }
  };

  // 以下、残りの App.tsx 内ロジックを調整 (切り出しきれなかった初期化等のみ残す)

  const handleNewChat = useCallback(() => {
    setActiveThreadId(null);
    setInputText('');
    setDraftThreadSettings({});
  }, [setActiveThreadId, setInputText]);

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

  const handleDraftSave = (settings: Partial<ThreadSettings>) => {
    setDraftThreadSettings(settings);
    setThreadSettingsOpen(false);
  };

  const handleSummarizeAndNewChat = useCallback(async () => {
    if (!activeThreadId || isSummarizing) return;

    setIsSummarizing(true);
    try {
      // 設定された要約用モデルがあればそれを使用、なければ現在のモデルを使用
      const pId = summarizeProvider || selectedProviderId;
      const mId = summarizeModel || selectedModelId;

      const summary = await summarizeThread(activeThreadId, pId, mId);

      if (summary) {
        handleNewChat();
        setInputText(summary);
      }
    } catch (error) {
      console.error('Summarization failed:', error);
      // 必要があればユーザーにエラー通知を表示するなどの処理を追加
    } finally {
      setIsSummarizing(false);
    }
  }, [
    activeThreadId,
    isSummarizing,
    summarizeProvider,
    summarizeModel,
    selectedProviderId,
    selectedModelId,
    handleNewChat,
    setInputText,
  ]);

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground relative font-sans ${isLauncher ? 'rounded-xl border shadow-2xl' : ''}`}
    >
      <div ref={headerRef} className="shrink-0 z-100">
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
          onSummarizeAndNewChat={handleSummarizeAndNewChat}
          isSummarizing={isSummarizing}
          enableSummarizeAndNewChat={enableSummarizeAndNewChat}
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
      </div>

      <div
        className={`flex ${isLauncher && !shouldExpand ? 'flex-none h-fit' : 'flex-1'} overflow-hidden relative w-full`}
      >
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
            <Suspense fallback={<div className="w-64 h-full bg-muted/30" />}>
              <Sidebar className="h-full" onClose={toggleSidebar} onNewChat={handleNewChat} />
            </Suspense>
          </div>
        )}

        <main
          className={`${isLauncher && !shouldExpand ? 'flex-none h-fit' : 'flex-1'} flex flex-col relative h-full w-full min-w-0 overflow-hidden gap-1`}
        >
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            key={activeThreadId || 'new-thread'}
            className={`${isLauncher && !shouldExpand ? 'flex-none h-2 p-0 overflow-hidden' : 'flex-1 overflow-y-auto px-3 py-3 md:px-4 py-4 md:px-8'} scroll-smooth custom-scrollbar relative`}
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

            {/* 仮想スクロールコンテナ */}
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const isLoader =
                  sendMutation.isPending &&
                  !streamingContent &&
                  virtualRow.index === messages.length;
                const isStream = streamingContent && virtualRow.index === messages.length;

                // メッセージインデックス（ローダーやストリーミングを含まない）
                const messageIndex = virtualRow.index;

                if (isLoader) {
                  return (
                    <div
                      key="loader"
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingBottom: '24px', // space-y-6 分の余白
                      }}
                    >
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
                    </div>
                  );
                }

                if (isStream) {
                  return (
                    <div
                      key="streaming"
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingBottom: '24px',
                      }}
                    >
                      <ChatMessage
                        message={{
                          role: 'assistant',
                          content: streamingContent,
                          threadId: 0,
                          createdAt: streamingDate.current,
                        }}
                        isStreaming
                        onCopy={handleCopy}
                      />
                    </div>
                  );
                }

                const m = messages[messageIndex];
                if (!m) return null;

                return (
                  <div
                    key={m.id}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                      paddingBottom: '24px', // 元の space-y-6 md:space-y-8 の代わり
                    }}
                  >
                    <MessageItem
                      message={m}
                      onCopy={handleCopy}
                      onEdit={handleEdit}
                      onRegenerate={handleRegenerate}
                      onSwitchBranch={handleSwitchBranch}
                      isModelEnabled={isSelectedModelEnabled}
                    />
                  </div>
                );
              })}
            </div>
            {/* 自動スクロール用のアンカー */}
            <div ref={messagesEndRef} />
          </div>

          <div
            ref={inputAreaRef}
            className={`pt-1 bg-gradient-to-t from-background via-background/95 to-transparent z-10 w-full shrink-0 relative ${isLauncher ? 'p-3 pt-2' : 'p-2.5 md:px-5 md:pb-3'}`}
          >
            <ScrollToBottomButton
              show={showScrollButton}
              onClick={scrollToBottom}
              hasNewMessage={
                !isAtBottom &&
                (!!streamingContent ||
                  (messages.length > 0 && messages[messages.length - 1].role !== 'user'))
              }
            />
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
                  isModelEnabled={isSelectedModelEnabled}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Overlays at root level with high z-index */}
      {isCommandManagerOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-background animate-in slide-in-from-right">
          <Suspense fallback={null}>
            <CommandManager />
          </Suspense>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-background animate-in slide-in-from-right">
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <SettingsView />
          </Suspense>
        </div>
      )}

      {isFileExplorerOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-background animate-in slide-in-from-right">
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <FileExplorer threadId={fileExplorerThreadId} />
          </Suspense>
        </div>
      )}

      <ThreadSettingsModal
        isOpen={isThreadSettingsOpen}
        onClose={() => setThreadSettingsOpen(false)}
        threadId={activeThreadId || undefined}
        initialSettings={!activeThreadId ? draftThreadSettings : undefined}
        onSave={!activeThreadId ? handleDraftSave : undefined}
      />

      <ConfirmDialog {...confirmProps} />
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
    staleTime: 5 * 60 * 1000,
  });

  const { data: attachments } = useQuery({
    queryKey: ['attachments', message.id],
    queryFn: () => {
      if (!message.id) return [];
      return db.files.where('messageId').equals(message.id).toArray();
    },
    enabled: !!message.id,
    staleTime: 5 * 60 * 1000,
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
