import * as React from "react"

type Renderers = Record<string, (chunks: React.ReactNode) => React.ReactNode>

/**
 * Render a Paraglide message containing inline markup tags, e.g.
 * `"Tìm <accent>đối thủ</accent> phù hợp."`. Each `<tag>…</tag>` is handed to
 * the matching renderer; a self-closing `<br></br>` with no renderer becomes a
 * line break. Tags don't nest.
 */
export function rich(message: string, renderers: Renderers = {}) {
  const parts: React.ReactNode[] = []
  const pattern = /<(\w+)>(.*?)<\/\1>/g
  let last = 0
  for (const match of message.matchAll(pattern)) {
    const [whole, tag, inner] = match
    if (match.index > last) parts.push(message.slice(last, match.index))
    const render = renderers[tag]
    const node = render ? render(inner) : tag === "br" ? <br /> : inner
    parts.push(<React.Fragment key={match.index}>{node}</React.Fragment>)
    last = match.index + whole.length
  }
  if (last < message.length) parts.push(message.slice(last))
  return parts
}
