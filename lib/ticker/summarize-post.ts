import "server-only"
import { createHash } from "node:crypto"
import { chatParams } from "@/lib/llm/openai-params"
import { logUsage, logUsageFailure } from "@/lib/llm/usage-log"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import { stripSourcePrefix } from "@/lib/feed/source-rules"

/**
 * 떡밥 글 → 세 줄 요약 (2026-09-18 운영자 요청).
 *
 * "출처, 무슨 내용인지. 인터뷰라면 무슨 얘기를 했는지만" — 기사면 사실 관계 세 줄,
 * 인터뷰면 발언 요지 세 줄. 입력은 **우리 글 본문**(이미 한국어·드라이 톤·출처 귀속이
 * 끝난 텍스트)이라 번역이 아니라 압축이다. 본문에 없는 말은 만들지 않는다 —
 * 결과 줄은 본문의 고유명사·숫자 밖으로 나가면 버린다(아래 groundedLines).
 *
 * 모달 댓글은 여기 없다. 요약은 posts 옆의 부속물이고 토론은 posts 의 comments 그대로다.
 */

export const SUMMARY_MODEL = "gpt-5.6-luna"

export interface SummaryInput {
  postId: string
  title: string
  content: unknown
  sourceUrl: string | null
  sourceName: string | null
}

export interface PostSummary {
  postId: string
  kind: "news" | "interview"
  lines: string[]
  sourceName: string | null
  model: string
  contentHash: string
}

const PROMPT = `너는 한국 축구 커뮤니티의 데스크다. 아래 한국어 기사(이미 번역·정리된 우리 글)를 읽고 독자가 10초 안에 파악할 세 줄 요약을 만든다.

먼저 종류를 정한다.
- 본문이 특정 인물의 발언(인터뷰·기자회견·SNS)이 중심이면 kind = "interview".
- 그 밖(상황을 전하는 단신·보도)은 kind = "news".

공통 — source: 출처 표시명. 출처 매체명에 본문이 밝힌 채널을 붙인다(예: "엘버스베르크 공식 X 계정", "첼시 구단 홈페이지", "BBC", "가제타 델로 스포르트"). 주어진 출처 매체명은 그대로 포함해야 한다. 출처는 요약 위에 따로 표시되므로 **요약 문장 안에는 매체명이나 "~에 따르면"을 넣지 않는다.**

kind = "news" 일 때 — 요약:
- 논문의 초록(abstract)처럼 자연스럽게 이어지는 한 단락. 본문이 짧은 공지·단신이면 2문장, 내용이 넉넉하면 3문장. 번호·목록 없음. 전체 100~180자. 각 문장은 "~다."로 끝난다.
- 첫 문장은 무슨 일인지(누가·무엇을), 다음은 근거·배경, 마지막은 본문에 명시된 다음 일정(날짜·상대·절차)만.
- 보도 내용을 그대로 서술한다. "~로 전해졌다", "~로 알려졌다", "~고 보도됐다"는 본문이 그렇게 흐린 표현을 쓴 대목에만, 단락 전체에 많아야 한 번. 본문이 "전망이다", "가능성이 있다"라고 쓴 것은 그 표현 그대로 옮긴다.
- 우리 목소리를 넣지 않는다: 본문에 없는 평가·전망·해석 금지. "쟁점으로 남았다", "주목된다", "관심이 쏠린다" 같은 억지 마무리 문장 금지. 본문에 없는 이름·숫자를 덧붙이지 않는다.
- 기사 자체를 언급하지 않는다: "발췌문에는", "본문에는", "기사는 …을 다뤘다" 같은 메타 서술 금지.

kind = "interview" 일 때 — 상황 한 줄 + 발언:
- lede: 독자가 발언을 이해할 바탕을 한 문장으로. 누가(직함·소속), 어떤 자리에서(기자회견·인터뷰·팟캐스트·SNS 등), 무엇에 대해 말했는지 — 그리고 그 말이 나온 배경(왜 지금 이 질문이 나왔는지)을 본문에 있으면 덧붙인다. 매체명은 넣지 않는다. 50~120자.
- quotes: 그 사람이 실제로 한 말을 **본문의 큰따옴표 안 문장을 글자 그대로** 고른다. 핵심 발언 2~4개(발언이 풍부하면 5개까지). 발언은 **그 자체로 뜻이 통하는 완결된 문장**만 고른다 — "가능성은 있다", "상당히 비현실적" 같은 토막 어구는 앞뒤 문장을 포함해 한 덩어리로 고르거나 버린다. 발언 하나는 15자 이상.
- 각 발언의 context 는 그 말이 **무엇에 대한 대답인지 독자가 바로 알 수 있는 짧은 절**로 쓴다(12~30자). 본문에 질문이 있으면 "~라는 질문에", "~를 묻자" 꼴, 없으면 "~에 대해" 꼴. 명사 두세 개짜리 라벨("부상 관리", "팀 분위기")은 쓰지 않는다.
- "~라고 말했다" 같은 기자 서술, 해설, 평가는 quotes 에 넣지 않는다. 발언은 요약·의역·합치기·어미 바꾸기 금지. 본문에 없는 말은 만들지 않는다.

JSON으로만 답한다:
{"kind":"news","source":"출처 표시명","sentences":["문장1","문장2","문장3"]}
또는
{"kind":"interview","source":"출처 표시명","lede":"상황 한 문장","quotes":[{"context":"무엇에 대한 대답인지","quote":"발언 그대로"}, ...]}`

/**
 * 모델이 붙인 출처 표시명("엘버스베르크 공식 X 계정")은 아는 매체명을 품고 있을 때만 받는다.
 * 매체명을 바꿔치기하면 아는 이름으로 되돌린다 — 출처는 귀속의 전부라 창작을 허용하지 않는다.
 */
export function resolveSourceLabel(label: unknown, known: string | null): string | null {
  const l = typeof label === "string" ? label.replace(/\s+/g, " ").trim().slice(0, 40) : ""
  if (!known) return l || null
  const norm = (x: string) => x.toLowerCase().replace(/\s/g, "")
  return l && norm(l).includes(norm(known)) ? l : known
}

/** 단신 요약에서 우리 목소리·메타 서술이 새는 표현 — 걸리면 그 요약을 버린다 */
const NEWS_BANNED = /쟁점으로 남|주목된다|관심이 쏠|발췌문|본문에는|본문에 |기사에는|기사는 /

/** 인용문 대조용 정규화 — 공백·따옴표·문장부호 차이는 눈감고 글자만 본다 */
function normalizeQuote(s: string): string {
  return s.replace(/[\s"“”'‘’…·.,!?~\-–—()]/g, "")
}

/** 발언이 본문에 실재하는가 (연속 부분문자열). 없는 말은 버린다 — fail-closed */
export function quoteInText(quote: string, text: string): boolean {
  const q = normalizeQuote(quote)
  return q.length >= 6 && normalizeQuote(text).includes(q)
}

/**
 * 인터뷰 줄의 큰따옴표 발언이 전부 본문에 있어야 하고, 발언이 하나는 있어야 한다.
 * 모델이 문장을 매끄럽게 하려고 발언을 고쳐 쓰면 여기서 걸린다.
 */
export function quotesGrounded(lines: string[], text: string): boolean {
  const quotes = lines.flatMap((l) => [...l.matchAll(/[“"]([^”"]{6,})[”"]/g)].map((m) => m[1]))
  return quotes.length > 0 && quotes.every((q) => quoteInText(q, text))
}

/** 인터뷰 저장 줄: `맥락 — “발언”` (맥락 없으면 `“발언”`). 화면은 이 모양 그대로 한 줄씩 그린다 */
export function joinQuoteLine(context: string, quote: string): string {
  return context ? `${context} — “${quote}”` : `“${quote}”`
}

export function summaryContentHash(title: string, text: string): string {
  return createHash("sha256").update(`${title}\n${text}`).digest("hex")
}

export function postPlainText(content: unknown): string {
  if (!content || typeof content !== "object") return ""
  try {
    return extractTextFromTipTapJSON(content as Parameters<typeof extractTextFromTipTapJSON>[0])
      .replace(/\s+/g, " ")
      .trim()
  } catch {
    return ""
  }
}

/** 출처 표시명 — 글의 source_name, 없으면 제목의 [매체] 프리픽스, 그것도 없으면 원문 링크의 도메인 */
export function summarySourceName(
  title: string,
  sourceName: string | null,
  sourceUrl?: string | null
): string | null {
  if (sourceName?.trim()) return sourceName.trim()
  const fromTitle = stripSourcePrefix(title).source
  if (fromTitle) return fromTitle
  try {
    return sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : null
  } catch {
    return null
  }
}

/**
 * 접지 검사: 줄에 나온 숫자와 4자 이상 한글 고유명사 덩어리가 본문(또는 제목)에 실재해야 한다.
 * 모델이 붙인 이름·숫자를 걸러내는 최소 장치 — 걸리면 그 요약 전체를 버린다(fail-closed).
 */
export function groundedLines(lines: string[], title: string, text: string): boolean {
  const hay = `${title} ${text}`
  for (const line of lines) {
    for (const num of line.match(/\d+(?:[.,]\d+)?/g) ?? []) {
      if (!hay.includes(num)) return false
    }
  }
  return true
}

export async function summarizePost(input: SummaryInput): Promise<PostSummary | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const text = postPlainText(input.content)
  if (text.length < 80) return null
  const { title } = stripSourcePrefix(input.title)
  const startedAt = Date.now()
  let data: { choices?: { message?: { content?: string } }[] }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams(SUMMARY_MODEL, { temperature: 0, max_tokens: 1400 }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT },
          {
            role: "user",
            content: `출처 매체: ${summarySourceName(input.title, input.sourceName, input.sourceUrl) ?? "미상"}\n제목: ${title}\n\n본문:\n${text.slice(0, 6000)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) {
      if (process.env.SUMMARY_DEBUG === "1")
        console.error(
          "[summary-debug] http",
          res.status,
          input.postId,
          (await res.text()).slice(0, 300)
        )
      logUsageFailure("ticker-summary", SUMMARY_MODEL, `http_${res.status}`, Date.now() - startedAt)
      return null
    }
    data = await res.json()
    logUsage("ticker-summary", SUMMARY_MODEL, data, Date.now() - startedAt)
  } catch {
    logUsageFailure("ticker-summary", SUMMARY_MODEL, "network", Date.now() - startedAt)
    return null
  }
  let parsed: {
    kind?: unknown
    sentences?: unknown
    quotes?: unknown
    lede?: unknown
    source?: unknown
  }
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}")
  } catch {
    if (process.env.SUMMARY_DEBUG === "1")
      console.error(
        "[summary-debug] bad-json",
        input.postId,
        JSON.stringify(data.choices?.[0]).slice(0, 300)
      )
    return null
  }
  const kind = parsed.kind === "interview" ? "interview" : "news"
  const debug = process.env.SUMMARY_DEBUG === "1"
  // news: lines = 단락을 이루는 문장들(화면은 공백으로 이어 한 단락).
  // interview: lines[0] = 상황 한 줄(lede, 따옴표 없음), 이후 발언 하나씩 `맥락 — “발언”`.
  let lines: string[]
  if (kind === "interview") {
    const lede = String(parsed.lede ?? "")
      .replace(/\s+/g, " ")
      .trim()
    const ledeClean = lede.replace(
      /^[^.。]{1,30}?(에 따르면|와의 인터뷰에서|과의 인터뷰에서),?\s*/,
      ""
    )
    if (ledeClean.length < 20 || ledeClean.length > 200 || /[“”"]/.test(ledeClean)) {
      if (debug) console.error("[summary-debug] bad-lede", input.postId, lede)
      return null
    }
    const quotes = Array.isArray(parsed.quotes) ? parsed.quotes : []
    const quoteLines = quotes
      .map((q) => {
        if (!q || typeof q !== "object") return null
        const quote = String((q as { quote?: unknown }).quote ?? "")
          .replace(/\s+/g, " ")
          .replace(/^["“”']+|["“”']+$/g, "")
          .trim()
        const context = String((q as { context?: unknown }).context ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80)
        if (quote.length < 12 || quote.length > 300) return null
        if (!quoteInText(quote, text)) {
          if (debug) console.error("[summary-debug] quote-dropped", input.postId, quote)
          return null
        }
        return joinQuoteLine(context, quote)
      })
      .filter((l): l is string => !!l)
      .slice(0, 5)
    lines = [ledeClean, ...quoteLines]
  } else {
    lines = Array.isArray(parsed.sentences)
      ? parsed.sentences
          .filter((l): l is string => typeof l === "string")
          .map((l) => l.replace(/\s+/g, " ").trim())
          .filter((l) => l.length >= 8 && l.length <= 220)
          .slice(0, 3)
      : []
    // 출처는 위에 따로 표시된다 — 문장 머리의 "[매체]에 따르면"은 떼고, 흐림 어미 남발이면 버린다.
    if (lines[0]) lines[0] = lines[0].replace(/^[^.。]{1,30}?(에 따르면|보도에 따르면),?\s*/, "")
    const hedges = lines.join(" ").match(/전해졌다|알려졌다|보도됐다|보도했다/g)?.length ?? 0
    if (hedges > 1 || lines.some((l) => NEWS_BANNED.test(l))) {
      if (debug) console.error("[summary-debug] news-voice", input.postId, JSON.stringify(lines))
      return null
    }
  }
  if (lines.length < 2) {
    if (debug) console.error("[summary-debug] too-few-lines", input.postId, JSON.stringify(parsed))
    return null
  }
  if (!groundedLines(lines, title, text)) {
    if (debug)
      console.error("[summary-debug] number-not-in-text", input.postId, JSON.stringify(lines))
    return null
  }
  if (kind === "interview" && !quotesGrounded(lines, text)) {
    if (debug)
      console.error("[summary-debug] quote-not-in-text", input.postId, JSON.stringify(lines))
    return null
  }
  return {
    postId: input.postId,
    kind,
    lines,
    sourceName: resolveSourceLabel(
      parsed.source,
      summarySourceName(input.title, input.sourceName, input.sourceUrl)
    ),
    model: SUMMARY_MODEL,
    // ⚠️ 저장소(summary-store)가 같은 식으로 다시 계산해 비교한다 — 프리픽스 뗀 제목 기준.
    contentHash: summaryContentHash(title, text),
  }
}
