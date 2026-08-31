import type { ReactNode } from 'react'

function parseInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={index}
          className="rounded bg-background/60 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

export function formatHelpContent(content: string): ReactNode {
  const lines = content.split('\n')
  const nodes: ReactNode[] = []
  let listItems: ReactNode[] = []
  let listType: 'ol' | 'ul' | null = null

  const flushList = () => {
    if (!listItems.length || !listType) return
    const Tag = listType
    nodes.push(
      <Tag key={`list-${nodes.length}`} className="my-1.5 list-inside space-y-0.5 pl-1">
        {listItems}
      </Tag>,
    )
    listItems = []
    listType = null
  }

  for (const line of lines) {
    const numbered = line.match(/^(\d+)\.\s+(.+)/)
    const bulleted = line.match(/^[-*]\s+(.+)/)

    if (numbered) {
      if (listType !== 'ol') {
        flushList()
        listType = 'ol'
      }
      listItems.push(<li key={listItems.length}>{parseInline(numbered[2])}</li>)
      continue
    }

    if (bulleted) {
      if (listType !== 'ul') {
        flushList()
        listType = 'ul'
      }
      listItems.push(<li key={listItems.length}>{parseInline(bulleted[1])}</li>)
      continue
    }

    flushList()

    if (!line.trim()) {
      nodes.push(<br key={`br-${nodes.length}`} />)
      continue
    }

    nodes.push(
      <p key={`p-${nodes.length}`} className={nodes.length ? 'mt-1.5' : undefined}>
        {parseInline(line)}
      </p>,
    )
  }

  flushList()
  return <>{nodes}</>
}
