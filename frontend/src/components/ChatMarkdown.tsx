import { Fragment, type ReactNode } from 'react';

/**
 * Renders the small markdown subset the AI assistant writes (paragraphs,
 * **bold**, `code`, "- " bullets and "1. " numbered lists) as React
 * elements. Model output is untrusted, so this never uses innerHTML: any
 * other markup simply stays as literal text.
 */

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={i} className="rounded bg-background/60 px-1 font-mono text-xs">{part.slice(1, -1)}</code>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: 'p', lines: [] });
    } else if (BULLET.test(line)) {
      const item = line.replace(BULLET, '');
      if (last?.kind === 'ul') last.items.push(item);
      else blocks.push({ kind: 'ul', items: [item] });
    } else if (NUMBERED.test(line)) {
      const item = line.replace(NUMBERED, '');
      if (last?.kind === 'ol') last.items.push(item);
      else blocks.push({ kind: 'ol', items: [item] });
    } else if (last?.kind === 'p') {
      last.lines.push(line.replace(/^#+\s+/, ''));
    } else {
      blocks.push({ kind: 'p', lines: [line.replace(/^#+\s+/, '')] });
    }
  }
  return blocks.filter(b => (b.kind === 'p' ? b.lines.length > 0 : b.items.length > 0));
}

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {parseBlocks(text).map((block, i) => {
        if (block.kind === 'ul') {
          return <ul key={i} className="list-disc space-y-0.5 pl-5">{block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}</ul>;
        }
        if (block.kind === 'ol') {
          return <ol key={i} className="list-decimal space-y-0.5 pl-5">{block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}</ol>;
        }
        return (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>{j > 0 && <br />}{renderInline(line)}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
