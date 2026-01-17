import { Terminal, Wrench } from 'lucide-react';
import type OpenAI from 'openai';
import type { LocalFile, Message } from '../../../lib/db';
import { MarkdownRenderer } from '../MarkdownRenderer';
import { ImageAttachment } from './ImageAttachment';

const formatJson = (jsonStr: string) => {
  try {
    const parsed = JSON.parse(jsonStr);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return jsonStr;
  }
};

interface ChatMessageContentProps {
  message: Message;
  isThinking: boolean;
  attachments?: LocalFile[];
  onPreviewFile: (file: LocalFile) => void;
}

export function ChatMessageContent({
  message,
  isThinking,
  attachments,
  onPreviewFile,
}: ChatMessageContentProps) {
  const isError = message.model === 'system';

  return (
    <div
      className={`text-foreground inline-block text-left max-w-full w-full transition-all space-y-2 ${
        message.role === 'assistant'
          ? isError
            ? 'bg-destructive/10 p-3 rounded-xl rounded-tl-none border border-destructive/20 shadow-sm w-full text-destructive'
            : 'bg-muted p-3 rounded-xl rounded-tl-none border shadow-sm w-full'
          : 'bg-primary/10 p-2 px-3 rounded-xl rounded-tl-none text-sm border border-primary/10 inline-block'
      } ${message.role === 'user' && typeof message.content === 'string' ? 'whitespace-pre-wrap' : ''}`}
    >
      {isThinking ? (
        <div className="flex space-x-1 h-6 items-center px-1">
          <div className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" />
        </div>
      ) : (
        <>
          {/* 思考プロセス */}
          {(message.reasoning || message.reasoningSummary) && (
            <details className="mb-2 group/reasoning border-l-2 border-primary/30 pl-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground list-none flex items-center gap-1 select-none">
                <span className="opacity-70 group-open/reasoning:rotate-90 transition-transform text-[10px]">
                  ▶
                </span>
                <span>思考プロセス{message.reasoningSummary ? '（要約）' : ''}</span>
              </summary>
              <div className="mt-2 text-sm text-foreground/80 leading-relaxed bg-foreground/5 p-3 rounded-md overflow-x-auto whitespace-pre-wrap font-sans">
                <MarkdownRenderer content={message.reasoning || message.reasoningSummary || ''} />
              </div>
            </details>
          )}

          {/* ツール呼び出し (INPUT) */}
          {message.tool_calls && message.tool_calls.length > 0 && (
            <div className="space-y-2 mb-2">
              {message.tool_calls.map(
                (tc: OpenAI.Chat.ChatCompletionMessageToolCall, idx: number) => {
                  const fn = 'function' in tc ? tc.function : undefined;
                  if (!fn) return null;
                  return (
                    <details
                      key={`${tc.id}-${idx}`}
                      className="group/tool bg-foreground/5 border border-border/50 rounded-lg overflow-hidden"
                    >
                      <summary className="cursor-pointer p-3 flex items-center justify-between hover:bg-foreground/5 transition-colors select-none list-none">
                        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                          <Wrench className="w-3 h-3" />
                          <span>ツール呼び出し: {fn.name}</span>
                        </div>
                        <span className="text-[10px] opacity-50 group-open/tool:rotate-180 transition-transform">
                          ▼
                        </span>
                      </summary>
                      <div className="px-3 pb-3">
                        <MarkdownRenderer
                          content={`\`\`\`json\n${formatJson(fn.arguments)}\n\`\`\``}
                        />
                      </div>
                    </details>
                  );
                },
              )}
            </div>
          )}

          {/* メインコンテンツ (OUTPUT for tools or regular message) */}
          {message.role === 'tool' ? (
            <details className="group/tool-output bg-success/5 border border-success/30 rounded-lg overflow-hidden mb-2">
              <summary className="cursor-pointer p-3 flex items-center justify-between hover:bg-success/5 transition-colors select-none list-none text-success">
                <div className="flex items-center gap-2 text-xs font-bold">
                  <Terminal className="w-3 h-3" />
                  <span>ツール実行結果 (LLMへの入力)</span>
                </div>
                <span className="text-[10px] opacity-50 group-open/tool-output:rotate-180 transition-transform">
                  ▼
                </span>
              </summary>
              <div className="px-3 pb-3">
                <MarkdownRenderer
                  content={
                    typeof message.content === 'string'
                      ? message.content.trim().startsWith('{') ||
                        message.content.trim().startsWith('[')
                        ? `\`\`\`json\n${formatJson(message.content)}\n\`\`\``
                        : message.content
                      : ''
                  }
                />
              </div>
            </details>
          ) : (
            <div className="space-y-2">
              <MarkdownRenderer
                content={typeof message.content === 'string' ? message.content : ''}
              />
              {/* 添付ファイル（画像）の表示 - テキストの下に配置 */}
              {attachments && attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {attachments
                    .filter((f) => f.mimeType.startsWith('image/'))
                    .map((file) => (
                      <ImageAttachment
                        key={file.id}
                        file={file}
                        onClick={() => onPreviewFile(file)}
                      />
                    ))}
                </div>
              )}

              {/* その他のファイル (画像以外) */}
              {attachments?.some((f) => !f.mimeType.startsWith('image/')) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {attachments
                    .filter((f) => !f.mimeType.startsWith('image/'))
                    .map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => onPreviewFile(file)}
                        className="flex items-center gap-2 bg-muted border rounded-lg p-2 text-xs hover:bg-muted/80 transition-colors"
                      >
                        <span className="truncate max-w-[150px]">{file.fileName}</span>
                        <span className="text-muted-foreground">
                          ({(file.size / 1024).toFixed(1)}KB)
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
