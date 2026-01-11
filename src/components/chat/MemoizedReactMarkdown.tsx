import { type ComponentType, memo } from 'react';
import ReactMarkdown, { type Options } from 'react-markdown';

export const MemoizedReactMarkdown = memo(
  ReactMarkdown as ComponentType<Options & { className?: string }>,
  (
    prevProps: Readonly<Options> & { className?: string },
    nextProps: Readonly<Options> & { className?: string },
  ) => prevProps.children === nextProps.children && prevProps.className === nextProps.className,
);
