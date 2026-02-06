import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db, type Thread } from '../lib/db';
import { getActivePathMessages } from '../lib/db/threads';

/**
 * チャットスレッド、メッセージ、スクロール制御などの管理を行うフック
 */
export function useChatThread({ activeThreadId }: { activeThreadId: number | null }) {
  const queryClient = useQueryClient();
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // メッセージ取得
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeThreadId],
    queryFn: () => (activeThreadId ? getActivePathMessages(activeThreadId) : []),
    enabled: true,
  });

  // スレッド情報取得
  const { data: activeThread } = useQuery<Thread | undefined>({
    queryKey: ['thread', activeThreadId],
    queryFn: () => (activeThreadId ? db.threads.get(activeThreadId) : undefined),
    enabled: !!activeThreadId,
  });

  // スレッド変更時にタイトル入力を同期
  useEffect(() => {
    if (activeThread) {
      setTitleInput(activeThread.title);
    }
  }, [activeThread]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
    setShowScrollButton(false);
  }, []);

  // スクロールイベントハンドラ
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const newIsAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(newIsAtBottom);

    if (newIsAtBottom) {
      setShowScrollButton(false);
    } else {
      const hasScrollableContent = scrollHeight > clientHeight + 20;
      setShowScrollButton(hasScrollableContent);
    }
  }, []);

  const [streamingContent, setStreamingContent] = useState('');

  // メッセージ更新時の自動スクロール
  // biome-ignore lint/correctness/useExhaustiveDependencies: メッセージやストリーミング内容の更新をトリガーにスクロール制御を行う
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    } else {
      setShowScrollButton(true);
    }
  }, [messages, streamingContent, activeThreadId, isAtBottom, scrollToBottom]);

  // 新しいスレッドのタイトルを更新
  const handleTitleUpdate = async () => {
    if (activeThreadId && titleInput.trim()) {
      await db.threads.update(activeThreadId, { title: titleInput });
      queryClient.invalidateQueries({ queryKey: ['thread', activeThreadId] });
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    }
    setEditingTitle(false);
  };

  return {
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
  };
}
