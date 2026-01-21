import React, { useEffect, useState } from 'react';
import type { LocalFile, Message } from '../../lib/db';
import { blobToDataURL } from '../../lib/utils/image';
import { FilePreviewModal } from '../common/FilePreviewModal';
import { ChatMessageActions } from './message/ChatMessageActions';
import { ChatMessageAvatar } from './message/ChatMessageAvatar';
import { ChatMessageContent } from './message/ChatMessageContent';
import { ChatMessageEditor } from './message/ChatMessageEditor';
import { ChatMessageHeader } from './message/ChatMessageHeader';

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  isThinking?: boolean;
  attachments?: LocalFile[]; // メッセージに関連する添付ファイル
  onCopy: (content: string) => void;
  onEdit?: (
    messageId: number,
    content: string,
    type: 'save' | 'regenerate' | 'branch',
    removedFileIds?: number[],
    newFiles?: File[],
  ) => void;
  onRegenerate?: (messageId: number, type: 'regenerate' | 'branch') => void;
  branchInfo?: {
    current: number;
    total: number;
    onSwitch: (index: number) => void;
  };
  isModelEnabled?: boolean;
  id?: string;
}

function _ChatMessage({
  message,
  isStreaming,
  isThinking,
  attachments,
  onCopy,
  onEdit,
  onRegenerate,
  branchInfo,
  isModelEnabled,
  id,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(
    typeof message.content === 'string' ? message.content : '',
  );
  const [removedFileIds, setRemovedFileIds] = useState<number[]>([]);
  const [newFiles, setNewFiles] = useState<{ file: File; preview: string }[]>([]);
  const [previewFile, setPreviewFile] = useState<LocalFile | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setRemovedFileIds([]);
      setNewFiles([]);
    }
  }, [isEditing]);

  const handleEditSave = (type: 'save' | 'regenerate' | 'branch') => {
    if (message.id && (editContent.trim() || attachments?.length || newFiles.length)) {
      onEdit?.(
        message.id,
        editContent,
        type,
        removedFileIds,
        newFiles.map((f) => f.file),
      );
      setIsEditing(false);
    }
  };

  return (
    <div
      id={id}
      className={`flex gap-3 md:gap-4 mx-auto w-full group ${isStreaming ? 'animate-pulse' : ''}`}
    >
      <ChatMessageAvatar message={message} />

      <div className="flex-1 space-y-1 min-w-0">
        <ChatMessageHeader message={message} branchInfo={branchInfo} />

        <div className="relative">
          {isEditing ? (
            <ChatMessageEditor
              content={editContent}
              setContent={setEditContent}
              attachments={attachments}
              removedFileIds={removedFileIds}
              setRemovedFileIds={setRemovedFileIds}
              newFiles={newFiles}
              setNewFiles={setNewFiles}
              onSave={handleEditSave}
              onCancel={() => setIsEditing(false)}
              onPreviewFile={setPreviewFile}
              blobToDataURL={blobToDataURL}
            />
          ) : (
            <ChatMessageContent
              message={message}
              isThinking={!!isThinking}
              attachments={attachments}
              onPreviewFile={setPreviewFile}
            />
          )}

          {!isEditing && !isStreaming && (
            <ChatMessageActions
              message={message}
              isModelEnabled={!!isModelEnabled}
              onCopy={onCopy}
              onRegenerate={onRegenerate}
              onEdit={onEdit ? () => setIsEditing(true) : undefined}
            />
          )}
        </div>
      </div>

      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}

export const ChatMessage = React.memo(_ChatMessage, (prev, next) => {
  if (prev.isStreaming !== next.isStreaming) return false;
  if (prev.isThinking !== next.isThinking) return false;
  if (prev.isModelEnabled !== next.isModelEnabled) return false;
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.content !== next.message.content) return false;
  if (prev.message.role !== next.message.role) return false;
  // attachments comparison (shallow check for length + ids usually enough for performance)
  if (prev.attachments?.length !== next.attachments?.length) return false;
  // branchInfo comparison
  if (prev.branchInfo?.current !== next.branchInfo?.current) return false;
  if (prev.branchInfo?.total !== next.branchInfo?.total) return false;

  return true;
});

// To match original export style properly, we need to import React or adjust the definition.
// Added `import React from 'react';` at the top in previous steps if not present.
