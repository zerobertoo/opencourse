import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import { cn } from '@/lib/utils';

type ElementProps<Tag extends keyof React.JSX.IntrinsicElements> =
  React.JSX.IntrinsicElements[Tag] & ExtraProps;

/** Builds a Markdown element renderer that adds Tailwind classes and drops the AST `node` prop. */
function styled<Tag extends keyof React.JSX.IntrinsicElements>(
  Tag: Tag,
  baseClassName: string,
  extraProps: Record<string, unknown> = {},
) {
  return function StyledElement({ node, className, ...props }: ElementProps<Tag>) {
    void node;
    const Component = Tag as React.ElementType;
    return <Component className={cn(baseClassName, className)} {...extraProps} {...props} />;
  };
}

// Raw HTML is not rendered by react-markdown, so lesson content cannot inject markup.
const components: Components = {
  h1: styled('h2', 'mt-6 text-2xl font-semibold first:mt-0'),
  h2: styled('h2', 'mt-6 text-xl font-semibold first:mt-0'),
  h3: styled('h3', 'mt-5 text-lg font-semibold first:mt-0'),
  p: styled('p', 'mt-3 leading-relaxed first:mt-0'),
  ul: styled('ul', 'mt-3 list-disc space-y-1 ps-6 first:mt-0'),
  ol: styled('ol', 'mt-3 list-decimal space-y-1 ps-6 first:mt-0'),
  blockquote: styled(
    'blockquote',
    'mt-3 border-s-4 border-primary/40 ps-4 text-muted-foreground first:mt-0',
  ),
  a: styled('a', 'text-primary underline underline-offset-4', {
    target: '_blank',
    rel: 'noopener noreferrer',
  }),
  pre: styled(
    'pre',
    'mt-3 overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-sm first:mt-0',
  ),
  code: function Code({ node, className, ...props }: ElementProps<'code'>) {
    void node;
    // fenced blocks carry a `language-*` class and are styled by `pre`; inline code gets a chip
    const isBlock = className?.startsWith('language-') ?? false;
    return (
      <code
        className={cn(
          !isBlock && 'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]',
          className,
        )}
        {...props}
      />
    );
  },
};

/** Renders lesson Markdown with the app typography. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('text-base', className)}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
