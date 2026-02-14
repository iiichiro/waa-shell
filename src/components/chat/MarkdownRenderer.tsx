// import 'katex/dist/katex.min.css'; // Removed static import
import { Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { type ComponentPropsWithoutRef, useEffect, useState } from 'react';
import type { Components } from 'react-markdown';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { MemoizedReactMarkdown } from './MemoizedReactMarkdown';

SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('tsx', tsx);

// KaTeX CSSを遅延読み込みする関数
const loadKatexCSS = (() => {
  let loaded = false;
  return () => {
    if (!loaded) {
      import('katex/dist/katex.min.css');
      loaded = true;
    }
  };
})();

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
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

// Markdown共有コンポーネント定義（レンダリング負荷軽減のため定数化）
const SHARED_COMPONENTS: Components = {
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
      <td className="px-4 py-2 whitespace-nowrap text-sm border-t border-border">{children}</td>
    );
  },
  hr() {
    return <hr className="my-4 border-border" />;
  },
};

// ストリーミング用レンダラー：完成したブロックと未完成の末尾を分けて処理
function StreamingMarkdownRenderer({ content }: { content: string }) {
  // 最後のダブル改行（段落区切り）を探す
  const lastDoubleNewline = content.lastIndexOf('\n\n');

  // 完成したコンテンツ（Markdownとしてレンダリング）
  const completedContent = lastDoubleNewline > 0 ? content.slice(0, lastDoubleNewline) : '';

  // 未完成のコンテンツ（プレーンテキストとして表示）
  const pendingContent = lastDoubleNewline > 0 ? content.slice(lastDoubleNewline) : content;

  return (
    <div className="custom-markdown prose prose-p:leading-relaxed prose-pre:p-0 break-words max-w-none mx-2 text-foreground">
      {completedContent && (
        <MemoizedReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={SHARED_COMPONENTS}
        >
          {completedContent}
        </MemoizedReactMarkdown>
      )}
      <p className="mb-2 last:mb-0 leading-7 whitespace-pre-wrap font-sans">
        {pendingContent}
        <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
      </p>
    </div>
  );
}

export function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  useEffect(() => {
    // 数式記法が含まれる場合のみKaTeX CSSをロード
    if (content.includes('$') || content.includes('\\(') || content.includes('\\[')) {
      loadKatexCSS();
    }
  }, [content]);

  if (isStreaming) {
    return <StreamingMarkdownRenderer content={content} />;
  }
  return (
    <div className="custom-markdown prose prose-p:leading-relaxed prose-pre:p-0 break-words max-w-none mx-2 text-foreground">
      <MemoizedReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={SHARED_COMPONENTS}
      >
        {content}
      </MemoizedReactMarkdown>
    </div>
  );
}
