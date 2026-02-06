import { useCallback, useState } from 'react';

/**
 * 確認ダイアログの状態管理を行うプロパティ
 */
export interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  showCancel?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 確認ダイアログおよび通知アラートの状態管理を行うカスタムフック
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onClose: () => hide(),
  });

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  /**
   * 確認ダイアログを表示する
   */
  const showConfirm = useCallback(
    (opts: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      isDestructive?: boolean;
      onConfirm: () => void;
    }) => {
      setState({
        isOpen: true,
        showCancel: true,
        onClose: hide,
        ...opts,
      });
    },
    [hide],
  );

  /**
   * 通知アラート（OKボタンのみ）を表示する
   */
  const showAlert = useCallback(
    (message: string, title = '通知') => {
      setState({
        isOpen: true,
        title,
        message,
        confirmText: 'OK',
        showCancel: false,
        isDestructive: false,
        onConfirm: hide,
        onClose: hide,
      });
    },
    [hide],
  );

  return {
    confirmProps: state,
    showConfirm,
    showAlert,
    hideConfirm: hide,
  };
}
