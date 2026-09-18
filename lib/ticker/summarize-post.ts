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

kind = "news" 일 때 — 요약:
- 논문의 초록(abstract)처럼 자연스럽게 이어지는 한 단락, 2~3문장. 번호·목록 없음. 전체 120~180자. 각 문장은 "~다."로 끝난다.
- 무슨 일인지 → 근거·배경 → 남은 쟁점이나 다음 일정 순.
- **우리 주장이 아니라 매체의 보도를 전하는 문체(전문체)로 쓴다.** 첫 문장에서 출처 매체를 한 번 귀속시키고("[출처 매체]에 따르면 …" 또는 "[출처 매체]는 …고 보도했다"), 나머지 문장도 "~로 전해졌다", "~로 알려졌다", "~고 보도됐다"처럼 단정하지 않는다. 사실처럼 단정하는 문장("~했다"로 끝나는 우리 서술)은 쓰지 않는다.
- 예외: 출처가 구단·리그·연맹의 공식 발표(오피셜)면 "구단은 …라고 발표했다"처럼 발표 주체를 밝히고 단정형을 써도 된다.
- 기사 본문에 있는 사실만 쓴다. 본문에 없는 이름·숫자·평가를 덧붙이지 않는다. 추측·전망·감상 금지.

kind = "interview" 일 때 — 상황 한 줄 + 발언:
- lede: 독자가 발언을 이해할 바탕을 한 문장으로. 누가(직함·소속), 어떤 자리에서(기자회견·인터뷰·SNS 등), 무엇에 대해 말했는지 — 그리고 그 말이 나온 배경(왜 지금 이 질문이 나왔는지)을 본문에 있으면 덧붙인다. **반드시 출처 매체를 문장 안에 넣는다**: "[출처 매체]에 따르면 …" / "[출처 매체]와의 인터뷰에서 …" / "[출처 매체]가 전한 기자회견에서 …". 출처가 구단·리그면 "구단 홈페이지 인터뷰에서 …"처럼 쓴다. 60~120자. 본문에 없는 사실은 넣지 않는다.
- quotes: 그 사람이 실제로 한 말을 **본문의 큰따옴표 안 문장을 글자 그대로** 고른다. 핵심 발언 2~4개(발언이 풍부하면 5개까지). 발언은 **그 자체로 뜻이 통하는 완결된 문장**만 고른다 — "가능성은 있다", "상당히 비현실적" 같은 토막 어구는 앞뒤 문장을 포함해 한 덩어리로 고르거나 버린다. 발언 하나는 15자 이상.
- 각 발언의 context 는 그 말이 **무엇에 대한 대답인지 독자가 바로 알 수 있는 짧은 절**로 쓴다(12~30자). 본문에 질문이 있으면 "~라는 질문에", "~를 묻자" 꼴, 없으면 "~에 대해" 꼴. 명사 두세 개짜리 라벨("부상 관리", "팀 분위기")은 쓰지 않는다. 예: "대표팀 제외 통보를 어떻게 받아들였느냐는 질문에", "첼시 첫 골의 의미에 대해".
- "~라고 말했다" 같은 기자 서술, 해설, 평가는 quotes 에 넣지 않는다. 발언은 요약·의역·합치기·어미 바꾸기 금지. 본문에 없는 말은 만들지 않는다.

출처 매체명은 넣지 않는다(따로 표시된다).

JSON으로만 답한다:
{"kind":"news","sentences":["문장1","문장2","문장3"]}
또는
{"kind":"interview","lede":"상황 한 문장","quotes":[{"context":"무엇에 대한 대답인지","quote":"발언 그대로"}, ...]}`

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

/** 출처 표시명 — 글의 source_name, 없으면 제목의 [매체] 프리픽스 */
export function summarySourceName(title: string, sourceName: string | null): string | null {
  if (sourceName?.trim()) return sourceName.trim()
  return stripSourcePrefix(title).source
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
            content: `출처 매체: ${summarySourceName(input.title, input.sourceName) ?? "미상"}\n제목: ${title}\n\n본문:\n${text.slice(0, 6000)}`,
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
  let parsed: { kind?: unknown; sentences?: unknown; quotes?: unknown; lede?: unknown }
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
    if (lede.length < 20 || lede.length > 200 || /[“”"]/.test(lede)) {
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
    lines = [lede, ...quoteLines]
  } else {
    lines = Array.isArray(parsed.sentences)
      ? parsed.sentences
          .filter((l): l is string => typeof l === "string")
          .map((l) => l.replace(/\s+/g, " ").trim())
          .filter((l) => l.length >= 8 && l.length <= 220)
          .slice(0, 3)
      : []
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
    sourceName: summarySourceName(input.title, input.sourceName),
    model: SUMMARY_MODEL,
    // ⚠️ 저장소(summary-store)가 같은 식으로 다시 계산해 비교한다 — 프리픽스 뗀 제목 기준.
    contentHash: summaryContentHash(title, text),
  }
}
