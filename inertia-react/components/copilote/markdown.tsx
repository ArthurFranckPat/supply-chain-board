import { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { SourceTag } from '@r/components/copilote/source-tag'

/**
 * Citation tool `[toolName: résumé]` (system_prompt.ts) réécrite en lien
 * markdown `#tool:toolName` AVANT le parsing — remark ignore les crochets
 * seuls (pas de syntaxe lien sans `(url)`), donc c'est le seul point
 * d'accroche pour transformer la citation en chip cliquable après coup.
 */
const SOURCE_TAG_RE = /\[([a-zA-Z][a-zA-Z0-9_]*):\s*([^\]]+)\]/g

function toSourceLinks(text: string): string {
  return text.replace(SOURCE_TAG_RE, (_all, tool: string, detail: string) => `[${tool}: ${detail}](#tool:${tool})`)
}

function makeComponents(onFlash: (tool: string) => void): Components {
  return {
    p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
    strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
    ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
    li: ({ children }) => <li className="pl-0.5">{children}</li>,
    hr: () => <hr className="my-3 border-border/60" />,
    code: ({ children }) => (
      <code className="rounded bg-muted px-1 font-mono text-[0.9em]">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="mb-3 overflow-x-auto rounded-lg bg-secondary p-3 font-mono text-[12px] leading-relaxed last:mb-0">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-3 border-l-2 border-border pl-3 italic text-muted-foreground last:mb-0">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="mb-3 overflow-x-auto last:mb-0">
        <table className="w-full border-collapse text-[13px]">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-b border-border px-2 py-1 text-left font-semibold">{children}</th>
    ),
    td: ({ children }) => <td className="border-b border-border/60 px-2 py-1">{children}</td>,
    a: ({ href, children }) => {
      if (href?.startsWith('#tool:')) {
        const tool = href.slice('#tool:'.length)
        const detail = typeof children === 'string' ? children : undefined
        return <SourceTag tool={tool} detail={detail} onFlash={onFlash} />
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-primary"
        >
          {children}
        </a>
      )
    },
  }
}

/** Rendu markdown de la réponse assistant (gras/listes/code/tableaux) avec
 * les citations tool réécrites en chips cliquables (flash inspecteur). */
export function CopiloteMarkdown(props: { text: string; onFlash: (tool: string) => void }) {
  const components = useMemo(() => makeComponents(props.onFlash), [props.onFlash])

  return (
    <div className="text-[15.5px] leading-[1.7] text-foreground [&_ul]:mt-0 [&_ol]:mt-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {toSourceLinks(props.text)}
      </ReactMarkdown>
    </div>
  )
}
