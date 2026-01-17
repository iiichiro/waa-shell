import { AlertCircle, Bot, Terminal, User } from 'lucide-react';
import type { Message } from '../../../lib/db';

interface ChatMessageAvatarProps {
  message: Message;
}

export function ChatMessageAvatar({ message }: ChatMessageAvatarProps) {
  const isError = message.model === 'system';

  return (
    <div
      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-colors ${
        message.role === 'user'
          ? 'bg-muted border'
          : isError
            ? 'bg-destructive/20 border border-destructive/30 text-destructive'
            : message.role === 'tool'
              ? 'bg-success/20 border border-success/30 text-success'
              : 'bg-primary/20 text-primary'
      }`}
    >
      {message.role === 'user' ? (
        <User className="w-4 h-4 text-sidebar-foreground" />
      ) : isError ? (
        <AlertCircle className="w-4 h-4" />
      ) : message.role === 'tool' ? (
        <Terminal className="w-4 h-4" />
      ) : (
        <Bot className="w-4 h-4" />
      )}
    </div>
  );
}
