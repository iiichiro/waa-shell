import { MemoizedReactMarkdown } from './MemoizedReactMarkdown';
import 'katex/dist/katex.min.css';
import { Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { type ComponentPropsWithoutRef, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

interface MarkdownRendererProps {
  content: string;
}

type MdProps<T extends React.ElementType> = ComponentPropsWithoutRef<T> & {
  node?: unknown;
};

function CodeBlock({ className, children, ...props }: MdProps<'code'>) {
  const match = /language-(\w+)/.exec(className || '');
  const multiLine = /\n/.test(String(children));
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleCopy = async () => {
    if (!children) return;
    const code = String(children).replace(/\n$/, '');
    await navigator.clipboard.writeText(code);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!multiLine) {
    return (
      <code
        {...props}
        className={`${className} bg-muted rounded px-1 py-0.5 text-sm font-mono text-foreground`}
      >
        {children}
      </code>
    );
  }

  const language = (match || [])[1] || '';
  return (
    <div className="overflow-hidden border border-border rounded-md my-2">
      <div className="bg-muted px-3 py-1.5 text-xs text-muted-foreground border-b flex justify-between items-center select-none">
        <button
          type="button"
          className="flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors bg-transparent border-none p-0"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
          <span className="font-mono">{language || 'text'}</span>
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 transition-opacity hover:text-foreground"
          title="コードをコピー"
        >
          {isCopied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          <span className="text-[10px]">{isCopied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {!isCollapsed && (
        <SyntaxHighlighter
          {...props}
          style={oneDark}
          language={language}
          PreTag="div"
          showLineNumbers={true}
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1em',
            color: 'rgba(255, 255, 255, 0.3)',
            textAlign: 'right',
            userSelect: 'none',
          }}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            padding: '1rem',
            backgroundColor: 'rgb(40, 44, 52)',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            width: '100%',
          }}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      )}
    </div>
  );
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="custom-markdown prose prose-p:leading-relaxed prose-pre:p-0 break-words max-w-none mx-2 text-foreground">
      <MemoizedReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: CodeBlock,
          p({ children }: MdProps<'p'>) {
            return <p className="mb-2 last:mb-0 leading-7">{children}</p>;
          },
          a({ node, href, children, ...props }: MdProps<'a'>) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
                {...props}
              >
                {children}
              </a>
            );
          },
          ul({ children }: MdProps<'ul'>) {
            return <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>;
          },
          ol({ children }: MdProps<'ol'>) {
            return <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>;
          },
          li({ children }: MdProps<'li'>) {
            return <li className="pl-1">{children}</li>;
          },
          blockquote({ children }: MdProps<'blockquote'>) {
            return (
              <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-2 bg-muted/30 rounded-r text-muted-foreground italic">
                {children}
              </blockquote>
            );
          },
          table({ children }: MdProps<'table'>) {
            return (
              <div className="overflow-x-auto my-3 rounded-lg border border-border">
                <table className="min-w-full divide-y divide-border">{children}</table>
              </div>
            );
          },
          thead({ children }: MdProps<'thead'>) {
            return <thead className="bg-muted/80">{children}</thead>;
          },
          th({ children }: MdProps<'th'>) {
            return (
              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {children}
              </th>
            );
          },
          td({ children }: MdProps<'td'>) {
            return (
              <td className="px-4 py-2 whitespace-nowrap text-sm border-t border-border">
                {children}
              </td>
            );
          },
          hr() {
            return <hr className="my-4 border-border" />;
          },
        }}
      >
        {content}
      </MemoizedReactMarkdown>
    </div>
  );
}
