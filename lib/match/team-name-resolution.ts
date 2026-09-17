export interface TeamNameRow {
  id: string
  nameKr: string
  aliases: string[]
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s&·．.\-_'"()]/g, "")
    .trim()

/** Shared by runtime and label repair. Ambiguous exact names must not choose the first row. */
export function resolveTeamName(dict: TeamNameRow[], team: string): string | null {
  const src = team.trim()
  if (!src) return null
  const exact = dict.filter((d) => d.nameKr === src || d.aliases.includes(src))
  if (exact.length) return exact.length === 1 ? exact[0].id : null
  const a = norm(src)
  if (a.length < 3) return null
  const hits = dict.filter((d) => {
    const b = norm(d.nameKr)
    return b.length >= 3 && (a.includes(b) || b.includes(a))
  })
  return hits.length === 1 ? hits[0].id : null
}
