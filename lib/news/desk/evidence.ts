import type { DeskResearch, DeskSource, LessonProposal, DeskArticle } from "./types"
import { SourceSchema } from "./types"

const PRIMARY = new Set([
  "chelseafc.com",
  "manutd.com",
  "mancity.com",
  "arsenal.com",
  "liverpoolfc.com",
  "tottenhamhotspur.com",
  "fcbarcelona.com",
  "realmadrid.com",
  "fcbayern.com",
  "juventus.com",
  "inter.it",
  "acmilan.com",
  "psg.fr",
  "uefa.com",
  "fifa.com",
  "premierleague.com",
  "bundesliga.com",
  "laliga.com",
  "ligue1.com",
])
const MAJOR: Record<string, string> = {
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "reuters.com": "Reuters",
  "apnews.com": "AP",
  "afp.com": "AFP",
  "theguardian.com": "The Guardian",
  "espn.com": "ESPN",
  "cnn.com": "CNN",
  "bloomberg.com": "Bloomberg",
  "ft.com": "Financial Times",
}
const SPECIALIST: Record<string, string> = {
  "nytimes.com": "The Athletic / The New York Times",
  "theathletic.com": "The Athletic",
  "skysports.com": "Sky Sports",
  "kicker.de": "Kicker",
  "lequipe.fr": "L’Équipe",
  "marca.com": "Marca",
  "as.com": "AS",
  "gazzetta.it": "La Gazzetta dello Sport",
  "sportschau.de": "Sportschau",
}
const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "").toLowerCase()
export function sourceIdentity(url: string, text: string) {
  const host = hostOf(url),
    primary = PRIMARY.has(host)
  const wire = /\breuters\b/i.test(text)
    ? "wire:reuters"
    : /\bassociated press\b/i.test(text)
      ? "wire:ap"
      : null
  return {
    source_name: MAJOR[host] ?? SPECIALIST[host] ?? host,
    source_tier: primary ? 1 : MAJOR[host] ? 2 : SPECIALIST[host] ? 3 : 5,
    primary_or_secondary: primary
      ? ("primary" as const)
      : MAJOR[host] || SPECIALIST[host]
        ? ("secondary" as const)
        : ("unverified" as const),
    original_reporting: primary ? true : null,
    origin_group: wire ?? (primary ? host : null),
  }
}
export interface SourceRow {
  id: string
  created_at: string
  urls: { source?: string } | null
  raw: {
    source_text?: string
    original_title?: string
    published_at?: string
    sport?: string
    evidence?: { captured_at?: string }
  } | null
  draft: { title?: string } | null
}
export function snapshotSource(
  row: SourceRow,
  role: "current" | "background" = "current"
): DeskSource | null {
  const text = row.raw?.source_text?.replace(/^\[[^\]]+\]\s*/, "").trim()
  const url = row.urls?.source
  if (
    !url ||
    !/^https?:\/\//i.test(url) ||
    !text ||
    text.length < 300 ||
    row.raw?.sport === "basketball"
  )
    return null
  const published = row.raw?.published_at
  if (!published || !Number.isFinite(Date.parse(published))) return null
  if (/access denied|verify you are human|enable javascript and cookies/i.test(text)) return null
  const parsed = SourceSchema.safeParse({
    id: row.id,
    source_url: url,
    title: row.raw?.original_title ?? row.draft?.title ?? "",
    ...sourceIdentity(url, text),
    published_at: new Date(published).toISOString(),
    updated_at: null,
    author: null,
    role,
    captured_at: row.raw?.evidence?.captured_at ?? row.created_at,
    text: text.slice(0, 24000),
  })
  return parsed.success ? parsed.data : null
}
export const normalizeQuote = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim()
export function validateResearch(research: DeskResearch, sources: DeskSource[]): DeskResearch {
  if (research.rejected) return research
  if (
    !research.facts.length ||
    research.conflicts.length ||
    !research.facts.some((f) =>
      f.evidence.some((e) => sources.some((s) => s.id === e.source_id && s.role === "current"))
    )
  )
    throw Error("핵심 사실이 없거나 출처 간 충돌이 있어 작성할 수 없습니다.")
  const ids = new Set<string>()
  for (const fact of research.facts) {
    if (ids.has(fact.id)) throw Error("사실 목록의 번호가 중복됐습니다.")
    ids.add(fact.id)
    for (const evidence of fact.evidence) {
      const source = sources.find((s) => s.id === evidence.source_id)
      if (!source || !normalizeQuote(source.text).includes(normalizeQuote(evidence.quote)))
        throw Error("사실의 근거 구절을 원문에서 찾지 못했습니다.")
      if (fact.kind === "CONFIRMED" && source.primary_or_secondary !== "primary")
        fact.kind = "REPORTED"
    }
  }
  const current = sources.filter((s) => s.role === "current")
  const confidence = current.every((s) => s.primary_or_secondary === "primary")
    ? "HIGH"
    : current.some((s) => s.source_tier <= 3)
      ? "MEDIUM"
      : "LOW"
  return { ...research, confidence }
}

export const LESSON_INSTRUCTIONS: Record<LessonProposal["category"], string> = {
  fact: "인물·구단·기관·사건의 정체를 해당 기사 원문에서 다시 대조한다. 이전 기사에서 고친 대상이나 값을 새 기사에 복사하지 않는다.",
  number:
    "수치·금액·단위·계약 기간을 해당 원문에서 대조하고 다른 보도의 값을 합치거나 임의로 환산하지 않는다.",
  time: "사건 발생 시각과 보도·수정 시각을 구분하고 독자의 시간대에 맞게 확인된 날짜를 표시한다.",
  naming:
    "동일 인물인지 원어 이름과 문맥으로 확인한 뒤 확정 표기 사전을 따른다. 다른 대상끼리의 교체를 별칭으로 학습하지 않는다.",
  attribution:
    "보도·주장·평가의 주체와 원출처를 문장에 명시한다. 재인용은 독립적인 추가 확인으로 세지 않는다.",
  certainty:
    "검토·협상·합의·공식 발표의 단계를 구분하고 제목과 본문에서 원문보다 강하게 단정하지 않는다.",
  quote:
    "인용의 발언자·대상·조건과 앞선 질문을 원문에서 확인하고 문맥을 바꾸어 직접 인용하지 않는다.",
  context:
    "현재 발언을 이해하는 데 필요한 확인된 배경만 사용한다. 발언자가 설명하지 않은 동기나 원인을 단정하지 않는다.",
  structure:
    "새롭게 확인된 핵심 사실을 제목과 리드에 놓고 필요한 세부 사항·배경 순으로 재구성한다. 불필요한 반복을 줄인다.",
  style:
    "교정 예시의 표현 선택과 정보 밀도를 참고하되 사건·이름·수치를 옮겨 쓰지 않는다. 의미와 확신 수준을 보존해 자연스러운 한국어로 쓴다.",
}
export function anchoredLessons(
  proposals: LessonProposal[],
  before: DeskArticle,
  after: DeskArticle
) {
  return proposals
    .filter((p) => {
      const old = before[p.field],
        next = after[p.field]
      return (
        old !== next &&
        p.wrong !== p.correct &&
        (p.wrong.length > 0 || p.correct.length > 0) &&
        old.includes(p.wrong) &&
        next.includes(p.correct) &&
        !(p.wrong && p.correct && old.includes(p.correct) && next.includes(p.wrong))
      )
    })
    .map((p) => ({
      ...p,
      instruction: LESSON_INSTRUCTIONS[p.category],
      // Values and identity corrections are cases, not global replacements.
      scope: ["fact", "number", "time", "naming"].includes(p.category)
        ? ("case" as const)
        : ("general" as const),
    }))
    .slice(0, 12)
}
