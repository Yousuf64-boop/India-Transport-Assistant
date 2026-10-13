import type { ReactNode } from 'react';

/** Renders **bold** inline without ever using dangerouslySetInnerHTML (XSS-safe by construction). */
function renderInline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function MessageText({ text }: { text: string }) {
  return (
    <div className="space-y-1 leading-relaxed">
      {text.split('\n').map((line, i) =>
        line.trim() === '' ? (
          <div key={i} className="h-2" />
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(line)}
          </p>
        ),
      )}
    </div>
  );
}
