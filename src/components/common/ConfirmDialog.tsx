import { AlertTriangle, Info } from 'lucide-react';
import type React from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  showCancel?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'OK',
  showCancel = true,
  isDestructive,
  cancelText = 'キャンセル',
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          {isDestructive ? (
            <AlertTriangle className="w-5 h-5 text-destructive" />
          ) : (
            <Info className="w-5 h-5 text-primary" />
          )}
          <span>{title}</span>
        </div>
      }
      maxWidth="max-w-md"
      footer={
        <>
          {showCancel && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md hover:bg-accent text-sm font-medium text-muted-foreground transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all shadow-sm ${
              isDestructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div className="text-sm text-foreground space-y-2">
        {typeof message === 'string' ? <p>{message}</p> : message}
      </div>
    </Modal>
  );
}
