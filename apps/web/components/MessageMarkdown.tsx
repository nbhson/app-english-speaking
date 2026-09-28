import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { HoverableWord } from './HoverableWord';
import { useAIConfig } from '../context/AIConfigContext';

function splitWords(text: string, config: ReturnType<typeof useAIConfig>, prefix: string) {
  return text.split(/(\s+)/).map((word, idx) => {
    if (word.trim().length === 0) return <span key={`${prefix}-${idx}`}>{word}</span>;
    const m = word.match(/^([\w']+)(.*)$/);
    if (m) {
      const [, mainWord, punctuation] = m;
      return (
        <React.Fragment key={`${prefix}-${idx}`}>
          <HoverableWord word={mainWord} config={config} />
          {punctuation}
        </React.Fragment>
      );
    }
    return <span key={`${prefix}-${idx}`}>{word}</span>;
  });
}

const Wordify: React.FC<{ children: React.ReactNode; idPrefix: string }> = ({ children, idPrefix }) => {
  const config = useAIConfig();
  return (
    <>
      {React.Children.map(children, (child, i) => {
        if (typeof child === 'string' || typeof child === 'number') {
          return <>{splitWords(String(child), config, `${idPrefix}-${i}`)}</>;
        }
        if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
          const inner = (child.props as { children?: React.ReactNode }).children;
          if (typeof inner === 'string' || typeof inner === 'number') {
            return React.cloneElement(
              child as React.ReactElement<{ children?: React.ReactNode }>,
              { key: `${idPrefix}-${i}` } as Record<string, unknown>,
              <>{splitWords(String(inner), config, `${idPrefix}-${i}-w`)}</>,
            );
          }
          return React.cloneElement(
            child as React.ReactElement<{ children?: React.ReactNode }>,
            { key: `${idPrefix}-${i}` } as Record<string, unknown>,
          );
        }
        return child;
      })}
    </>
  );
};

function plainText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((c) => {
      if (typeof c === 'string' || typeof c === 'number') return String(c);
      if (React.isValidElement<{ children?: React.ReactNode }>(c)) {
        return plainText((c.props as { children?: React.ReactNode }).children);
      }
      return '';
    })
    .join('');
}

const TASK_RE = /^(now your turn|your turn|drill|task|practice|over to you)\b/i;

interface Props {
  text: string;
  tone?: 'coach' | 'user';
}

export const MessageMarkdown: React.FC<Props> = ({ text, tone = 'coach' }) => {
  const user = tone === 'user';
  return (
    <div className={user ? 'msg-user' : 'msg-coach'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p({ children }) {
            const raw = plainText(children).trim();
            if (!user && TASK_RE.test(raw)) {
              return (
                <div className="mt-3 rounded-xl border border-amber-300/70 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-[13px] md:text-sm font-medium text-amber-900 dark:text-amber-200 leading-relaxed">
                  <span className="block text-[10px] font-bold uppercase tracking-widest opacity-70 mb-0.5">✍️ Your turn</span>
                  <Wordify idPrefix="task">{children}</Wordify>
                </div>
              );
            }
            return (
              <p className="text-sm md:text-[15px] leading-relaxed mb-2 last:mb-0 break-words">
                <Wordify idPrefix={`p-${raw.slice(0, 8)}`}>{children}</Wordify>
              </p>
            );
          },
          strong({ children }) {
            return (
              <strong className={user ? 'font-bold text-white' : 'font-bold text-slate-900 dark:text-white'}>
                <Wordify idPrefix="s">{children}</Wordify>
              </strong>
            );
          },
          em({ children }) {
            return (
              <em className="italic">
                <Wordify idPrefix="e">{children}</Wordify>
              </em>
            );
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2 space-y-1 marker:text-slate-400">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-2 space-y-1 marker:text-slate-400 marker:font-bold">{children}</ol>;
          },
          li({ children }) {
            return (
              <li className="text-sm md:text-[15px] leading-relaxed break-words">
                <Wordify idPrefix="li">{children}</Wordify>
              </li>
            );
          },
          blockquote({ children }) {
            if (!plainText(children).trim()) return null;
            return (
              <blockquote className="my-2 border-l-[3px] border-blue-400 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-900/20 rounded-r-xl px-3 py-2 text-sm md:text-[15px] italic leading-relaxed [&>p]:mb-1 [&>p]:last:mb-0">
                <Wordify idPrefix="q">{children}</Wordify>
              </blockquote>
            );
          },
          code({ children, className }) {
            const block = (className ?? '').includes('language-');
            if (block) return <code className={className}>{children}</code>;
            return (
              <code
                className={
                  user
                    ? 'font-mono text-[13px] bg-white/20 px-1.5 py-0.5 rounded-md'
                    : 'font-mono text-[13px] bg-slate-200/80 dark:bg-slate-700/70 text-slate-800 dark:text-slate-100 px-1.5 py-0.5 rounded-md'
                }
              >
                {children}
              </code>
            );
          },
          pre({ children }) {
            return (
              <pre className="my-2 bg-slate-900 dark:bg-black/60 text-slate-100 rounded-xl p-3 overflow-x-auto text-[13px] leading-relaxed">
                {children}
              </pre>
            );
          },
          h1({ children }) {
            return (
              <h1 className="text-base md:text-lg font-bold mt-3 mb-1.5 first:mt-0">
                <Wordify idPrefix="h1">{children}</Wordify>
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="text-[15px] md:text-base font-bold mt-3 mb-1.5 first:mt-0">
                <Wordify idPrefix="h2">{children}</Wordify>
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="text-sm md:text-[15px] font-bold mt-2.5 mb-1 first:mt-0">
                <Wordify idPrefix="h3">{children}</Wordify>
              </h3>
            );
          },
          h4({ children }) {
            return (
              <h4 className="text-sm font-bold mt-2 mb-1 first:mt-0">
                <Wordify idPrefix="h4">{children}</Wordify>
              </h4>
            );
          },
          a({ children, href }) {
            return (
              <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 text-blue-600 dark:text-blue-400">
                {children}
              </a>
            );
          },
          hr() {
            return <hr className="my-3 border-slate-200 dark:border-slate-700" />;
          },
          table({ children }) {
            return (
              <div className="my-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-[13px]">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-left font-bold">{children}</th>;
          },
          td({ children }) {
            return <td className="px-2.5 py-1.5 border-t border-slate-100 dark:border-slate-800 align-top">{children}</td>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};
