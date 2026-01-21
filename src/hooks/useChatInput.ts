import {
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { MAX_INPUT_HISTORY } from '../lib/constants/ConfigConstants';
import {
  TEXTAREA_MAX_HEIGHT_LAUNCHER,
  TEXTAREA_MAX_HEIGHT_NORMAL,
} from '../lib/constants/UIConstants';

export interface SelectedFile {
  file: File;
  preview: string; // DataURL (Base64)
}

interface UseChatInputProps {
  onSend: (text: string, files: File[]) => void;
  sendShortcut: 'enter' | 'ctrl-enter';
  isLauncher: boolean;
  handleWindowClose?: () => void;
}

export function useChatInput({
  onSend,
  sendShortcut,
  isLauncher,
  handleWindowClose,
}: UseChatInputProps) {
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);

  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // テキストエリアの高さ自動調整
  // biome-ignore lint/correctness/useExhaustiveDependencies: 入力に応じて調整するためinputTextを監視
  useEffect(() => {
    const textarea = internalTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto'; // 一旦リセット
      const scrollHeight = textarea.scrollHeight;
      // ランチャーモードかつ履歴なし時はウィンドウサイズに合わせるため制限を緩くするが
      // ここでは見た目の高さ調整のみ行う
      const maxHeight = isLauncher ? TEXTAREA_MAX_HEIGHT_LAUNCHER : TEXTAREA_MAX_HEIGHT_NORMAL;
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [inputText, isLauncher]);

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const added: SelectedFile[] = [];
      for (const file of Array.from(e.target.files)) {
        const preview = await blobToDataURL(file);
        added.push({ file, preview });
      }
      setSelectedFiles((prev) => [...prev, ...added]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const blobToDataURL = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const addedFiles: SelectedFile[] = [];

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          const preview = await blobToDataURL(file);
          addedFiles.push({ file, preview });
        }
      }
    }

    if (addedFiles.length > 0) {
      setSelectedFiles((prev) => [...prev, ...addedFiles]);
    }
  };

  // 履歴管理
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1); // -1: 最新（入力中）、0以上: 履歴のインデックス

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (handleWindowClose) {
        handleWindowClose();
        return;
      }
    }

    // 履歴ナビゲーション (Up)
    if (e.key === 'ArrowUp') {
      // カーソルが先頭にある、または履歴編集中
      if (
        internalTextareaRef.current?.selectionStart === 0 &&
        internalTextareaRef.current?.selectionEnd === 0
      ) {
        if (history.length > 0) {
          e.preventDefault();
          const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
          setHistoryIndex(newIndex);
          setInputText(history[newIndex]);
          // カーソルを末尾へ
          setTimeout(() => {
            if (internalTextareaRef.current) {
              internalTextareaRef.current.selectionStart = internalTextareaRef.current.value.length;
              internalTextareaRef.current.selectionEnd = internalTextareaRef.current.value.length;
            }
          }, 0);
        }
      }
    }

    // 履歴ナビゲーション (Down)
    if (e.key === 'ArrowDown') {
      // カーソルが末尾にある、または履歴編集中
      const length = internalTextareaRef.current?.value.length || 0;
      if (
        internalTextareaRef.current?.selectionStart === length &&
        internalTextareaRef.current?.selectionEnd === length
      ) {
        if (historyIndex !== -1) {
          e.preventDefault();
          const newIndex = historyIndex + 1;
          if (newIndex >= history.length) {
            setHistoryIndex(-1);
            setInputText(''); // 最新に戻る（入力内容は保持していない簡易実装）
          } else {
            setHistoryIndex(newIndex);
            setInputText(history[newIndex]);
          }
        }
      }
    }

    if (e.key === 'Enter') {
      // IME変換中は送信しない
      if (e.nativeEvent.isComposing) return;

      if (sendShortcut === 'enter') {
        if (!e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      } else {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleSend();
        }
      }
    }
  };

  const handleSend = () => {
    if (!inputText.trim() && selectedFiles.length === 0) return;

    // 履歴に追加 (重複排除して末尾に追加)
    if (inputText.trim()) {
      setHistory((prev) => {
        const reset = prev.filter((t) => t !== inputText.trim());
        return [...reset, inputText.trim()].slice(-MAX_INPUT_HISTORY);
      });
    }
    setHistoryIndex(-1);

    onSend(
      inputText,
      selectedFiles.map((f) => f.file),
    );
    setInputText('');
    setSelectedFiles([]);

    // Reset height
    if (internalTextareaRef.current) {
      internalTextareaRef.current.style.height = 'auto';
    }
  };

  return {
    inputText,
    setInputText,
    selectedFiles,
    textareaRef: internalTextareaRef,
    fileInputRef,
    handleInputChange,
    handleFileSelect,
    handleRemoveFile,
    handlePaste,
    handleKeyDown,
    handleSend,
  };
}
