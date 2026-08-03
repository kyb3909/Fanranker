import "server-only"

/**
 * 선수 표기 검증 — "한국 언론이 실제로 뭐라 쓰는가"가 정답 (2026-08-04 운영자:
 * "기사가 문제가 아냐, 표기법이 문제거든").
 *
 * 구조: LLM 은 표기 **후보**만 낸다 (지어내기 방지) → 각 후보를 네이버 뉴스
 * 검색량으로 검증 → 압도적 다수 표기만 채택. 근거 없는 표기는 절대 등재하지
 * 않는다 (fail-closed — 애매하면 사람 검수).
 */

import { pickWinner, type SpellingVerdict } from "./pick"

export type { SpellingVerdict }

export interface SpellingProposal {
  /** 영문 표준 표기 (사전 romanized 키용) */
  romanized: string | null
  /** 한글 표기 후보 2~4개 */
  candidates: string[]
}

/** LLM — 표기 후보 제안 (확정이 아니라 후보. 검증은 네이버가 한다). 영문·한글 입력 겸용 */
export async function proposeCandidates(name: string, context?: string): Promise<SpellingProposal> {
  const empty: SpellingProposal = { romanized: null, candidates: [] }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return empty
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `축구 선수 이름(영문 또는 한글)을 받으면:
- romanized: 그 선수의 영문 풀네임 표준 표기
- candidates: 한국 언론에서 쓰일 법한 한글 표기 후보 2~4개 (입력이 한글이면 그 표기도 후보에 포함).
  원어 발음(포르투갈어/스페인어/프랑스어 등)을 고려한 변형 포함, 풀네임으로.
JSON만: {"romanized": "...", "candidates": ["표기1", "표기2"]}`,
          },
          {
            role: "user",
            content: `이름: ${name}${context ? `\n맥락: ${context}` : ""}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return empty
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      romanized?: unknown
      candidates?: unknown[]
    }
    return {
      romanized:
        typeof parsed.romanized === "string" && /^[A-Za-z .'-]+$/.test(parsed.romanized.trim())
          ? parsed.romanized.trim()
          : null,
      candidates: Array.isArray(parsed.candidates)
        ? [...new Set(parsed.candidates.map(String).filter((c) => /[가-힣]/.test(c)))].slice(0, 4)
        : [],
    }
  } catch {
    return empty
  }
}

/** 네이버 뉴스 검색 총 건수 — 표기의 실사용 근거 */
export async function naverNewsCount(query: string): Promise<number | null> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?${new URLSearchParams({
        query: `"${query}"`,
        display: "1",
      })}`,
      {
        headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { total?: number }
    return typeof data.total === "number" ? data.total : null
  } catch {
    return null
  }
}

/** 전체 파이프: 후보 제안 → 네이버 검증 → 승자 판정 */
export async function verifySpelling(
  name: string,
  context?: string
): Promise<SpellingVerdict & { romanized: string | null }> {
  const { romanized, candidates } = await proposeCandidates(name, context)
  if (candidates.length === 0) {
    return { winner: null, counts: [], reason: "후보 생성 실패 — 사람 검수", romanized }
  }
  const counts: { candidate: string; total: number }[] = []
  for (const c of candidates) {
    const total = await naverNewsCount(c)
    if (total === null) {
      return { winner: null, counts, reason: "네이버 API 미가동 — 사람 검수", romanized }
    }
    counts.push({ candidate: c, total })
    await new Promise((r) => setTimeout(r, 150)) // API 예의
  }
  return { ...pickWinner(counts), romanized }
}
