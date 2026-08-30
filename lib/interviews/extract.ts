import "server-only"

import { chatParams } from "@/lib/llm/openai-params"
import { normalizeForMatch, verifyQuote } from "./scout"
import { logUsage } from "@/lib/llm/usage-log"

/**
 * 발췌관(拔萃官) + 역관(譯官) — 인터뷰 카드의 LLM 단 2회 호출.
 *
 * 발췌관은 **요약을 못 한다**: 원문에서 발언을 글자 그대로 오려내게만 시키고,
 * 결과는 verifyQuote(부분문자열 대조)로 기계 검증한다 — 원문에 없는 문장은 폐기.
 * 이 구조 덕에 번역(역관) 입력은 이미 검증된 실제 발언뿐이다.
 *
 * 저작권: 큰따옴표 발언만 가져온다 — 기자의 서술·분석·평가는 프롬프트 층과
 * 대조 층 어느 쪽으로도 통과 못 한다 (드라이 톤 규칙: 인터뷰 번역 OK, 분석 금지).
 */

const MODEL = "gpt-5.6-luna"

interface ExtractedInterview {
  speaker: string | null
  /** 원문 그대로의 발언 (verifyQuote 통과분만) */
  quotes: string[]
}

const EXTRACT_PROMPT = `You extract ONLY direct quoted speech from a football article.

Rules — all mandatory:
- Copy quotes VERBATIM, character for character, from the article text. Do NOT paraphrase, summarize, translate, fix grammar, or merge sentences.
- Only text that the article presents as spoken words of a person (inside quotation marks, or clearly attributed speech).
- NEVER include the journalist's own narration, analysis, or opinion.
- Pick at most 5 quotes, preferring the most substantive ones.
- speaker: the person who said the quotes (romanized name as written in the article). If multiple people speak, pick the main speaker and only their quotes. If unclear, null.

Return JSON: {"speaker": string|null, "quotes": ["...", ...]}`

/** LLM 1회 — 발언 오려내기. 실패 시 null (호출부가 재시도 원장 관리) */
async function extractQuotes(title: string, material: string): Promise<ExtractedInterview | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams(MODEL, { temperature: 0 }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACT_PROMPT },
          { role: "user", content: `Title: ${title}\n\nArticle:\n${material.slice(0, 6000)}` },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    logUsage("interview-extract", MODEL, data)
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      speaker?: unknown
      quotes?: unknown
    }
    const quotes = Array.isArray(parsed.quotes)
      ? parsed.quotes.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      : []
    return {
      speaker: typeof parsed.speaker === "string" ? parsed.speaker : null,
      quotes: quotes.slice(0, 5),
    }
  } catch {
    return null
  }
}

interface TranslatedInterview {
  headline_ko: string
  speaker_ko: string | null
  /** quotes 입력과 같은 길이·같은 순서 */
  quotes_ko: string[]
}

const TRANSLATE_PROMPT = `너는 축구 인터뷰 번역가다. 검증된 영어 발언 목록을 한국어로 옮긴다.

규칙 — 전부 필수:
- 발언 수와 순서를 입력과 정확히 같게 유지한다. 합치거나 빼지 않는다.
- 직역 기조의 자연스러운 한국어. 의역·요약·살 붙이기 금지. 드라이 톤 — 감탄·과장 금지.
- 발언은 기사 인용 관례대로 평서형("~다" 종결)으로 옮긴다. 구어 반말("~야", "~어") 금지.
  예: "No! Everyone gets this wrong!" → "아니다. 모두가 잘못 알고 있다."
- 표기 힌트가 주어지면 인명·팀명은 반드시 그 표기를 쓴다.
- headline_ko: "발언자, 핵심 내용" 형태의 담백한 한 줄 (30자 내외).
- speaker_ko: 발언자의 한국어 표기 (힌트 우선, 없으면 통용 표기, 불확실하면 null).

JSON 반환: {"headline_ko": "...", "speaker_ko": "...", "quotes_ko": ["...", ...]}`

/** LLM 1회 — 번역. quotes_ko 길이가 입력과 다르면 실패로 간주 (fail-closed) */
export async function translateQuotes(
  speaker: string | null,
  quotes: string[],
  notationHints: { en: string; ko: string }[]
): Promise<TranslatedInterview | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || quotes.length === 0) return null
  const hints = notationHints.length
    ? `표기 힌트: ${notationHints.map((h) => `${h.en}=${h.ko}`).join(", ")}\n`
    : ""
  const body = quotes.map((q, i) => `${i + 1}. ${q}`).join("\n")
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams(MODEL, { temperature: 0.2 }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: TRANSLATE_PROMPT },
          { role: "user", content: `${hints}발언자: ${speaker ?? "미상"}\n\n${body}` },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    logUsage("interview-extract", MODEL, data)
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      headline_ko?: unknown
      speaker_ko?: unknown
      quotes_ko?: unknown
    }
    const quotesKo = Array.isArray(parsed.quotes_ko)
      ? parsed.quotes_ko.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      : []
    // 개수 불일치 = 어딘가 합치거나 뺐다 — 전체 실패 (부분 성공은 대응 관계를 못 믿는다)
    if (quotesKo.length !== quotes.length) return null
    if (typeof parsed.headline_ko !== "string" || !parsed.headline_ko.trim()) return null
    return {
      headline_ko: parsed.headline_ko.trim().slice(0, 80),
      speaker_ko: typeof parsed.speaker_ko === "string" ? parsed.speaker_ko.trim() : null,
      quotes_ko: quotesKo,
    }
  } catch {
    return null
  }
}

/** 발췌 → 대조 한 번에: LLM 결과에서 원문 검증 통과분만 남긴다 */
export async function extractVerifiedQuotes(
  title: string,
  material: string
): Promise<{ speaker: string | null; verified: string[]; dropped: number } | null> {
  const ex = await extractQuotes(title, material)
  if (!ex) return null
  const verified: string[] = []
  let dropped = 0
  for (const q of ex.quotes) {
    if (verifyQuote(q, material, title)) verified.push(normalizeForMatch(q))
    else dropped++
  }
  return { speaker: ex.speaker, verified, dropped }
}
