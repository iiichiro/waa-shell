import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef } from 'react';
import {
  LAUNCHER_HEIGHT_EXPANDED,
  LAUNCHER_MAX_HEIGHT,
  LAUNCHER_MIN_HEIGHT,
  LAUNCHER_SUGGEST_MIN_HEIGHT,
  WINDOW_DEFAULT_HEIGHT_EXPANDED,
} from '../lib/constants/UIConstants';

interface UseAppWindowProps {
  isLauncher: boolean;
  shouldExpand: boolean;
  showSuggest: boolean;
  messagesCount: number;
  headerRef: React.RefObject<HTMLDivElement | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  inputAreaRef: React.RefObject<HTMLDivElement | null>;
  onClose?: () => void;
}

/**
 * ウィンドウのサイズ調整、フォーカス、キーボードイベントなどの管理を行うフック
 */
export function useAppWindow({
  isLauncher,
  shouldExpand,
  showSuggest,
  messagesCount,
  headerRef,
  scrollContainerRef,
  inputAreaRef,
}: UseAppWindowProps) {
  const prevShouldExpandRef = useRef<boolean | null>(null);

  // ウィンドウを閉じる/隠す処理
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

  // ランチャーモードのサイズ調整
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

        if (shouldExpand) {
          if (prevShouldExpandRef.current !== true) {
            const expandedHeight = isLauncher
              ? LAUNCHER_HEIGHT_EXPANDED
              : WINDOW_DEFAULT_HEIGHT_EXPANDED;
            await appWindow.setSize(new LogicalSize(currentLogicalSize.width, expandedHeight));
          }
        } else {
          const headerHeight = headerRef.current?.offsetHeight || 0;
          const messagesHeight =
            messagesCount > 0 ? scrollContainerRef.current?.scrollHeight || 0 : 0;
          const inputHeight = inputAreaRef.current?.offsetHeight || 0;

          const totalContentHeight = headerHeight + messagesHeight + inputHeight;
          const minHeight = LAUNCHER_MIN_HEIGHT;
          const maxCompactHeight = LAUNCHER_MAX_HEIGHT;

          let targetHeight = Math.max(
            minHeight,
            Math.min(totalContentHeight + 24, maxCompactHeight),
          );

          if (showSuggest) {
            targetHeight = Math.max(targetHeight, LAUNCHER_SUGGEST_MIN_HEIGHT);
          }

          await appWindow.setSize(new LogicalSize(currentLogicalSize.width, targetHeight));
        }

        prevShouldExpandRef.current = shouldExpand;
      } catch (e) {
        console.error('Failed to resize window:', e);
      }
    };

    const observer = new ResizeObserver(() => resizeWindow());
    observer.observe(document.body);
    if (inputAreaRef.current) observer.observe(inputAreaRef.current);

    resizeWindow();
    return () => observer.disconnect();
  }, [
    isLauncher,
    shouldExpand,
    showSuggest,
    messagesCount,
    headerRef,
    scrollContainerRef,
    inputAreaRef,
  ]);

  return { handleWindowClose };
}
