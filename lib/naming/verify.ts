import "server-only"

/**
 * 선수 표기 검증 — "한국 언론이 실제로 뭐라 쓰는가"가 정답 (2026-08-04 운영자:
 * "기사가 문제가 아냐, 표기법이 문제거든").
 *
 * 구조: LLM 은 표기 **후보**만 낸다 (지어내기 방지) → 각 후보를 네이버 뉴스
 * 검색량으로 검증 → 압도적 다수 표기만 채택. 근거 없는 표기는 절대 등재하지
 * 않는다 (fail-closed — 애매하면 사람 검수).
 */

import { extractClubName, pickWinner, type SpellingVerdict } from "./pick"
import { naverNewsCount } from "./naver"
import { chatParams } from "@/lib/llm/openai-params"
import { logUsage, logUsageFailure } from "@/lib/llm/usage-log"

interface SpellingProposal {
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
        ...chatParams("gpt-5.6-luna", { temperature: 0.3 }),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `축구 인물 이름(영문 또는 한글)을 받으면:
- romanized: 그 인물의 영문 풀네임 표준 표기
- candidates: 한국 언론에서 쓰일 법한 한글 표기 후보 3~6개.

⚠️ **입력 표기는 틀렸을 가능성이 높다** (오표기를 검증하려고 부르는 함수다).
입력을 후보에 넣되, **그것과 비슷하지만 다른 표기를 반드시 함께 내라.** 후보 목록에
정답이 없으면 검증 자체가 무의미해진다 — 실제 사고: '카릭'을 받아 [카릭, 마이클 카릭,
미하엘 카릭]만 냈고 정답 '캐릭'이 빠져 오표기가 확정됐다.
특히 다음 혼동 축을 의도적으로 벌려라: ㅏ↔ㅐ(카/캐, 라/래) · ㅓ↔ㅔ(버/베) ·
ㅗ↔ㅜ(오/우) · 어두 자음(사/샤/자/하 — Xabi=사비, Javi=하비) · 스↔즈.
입력이 성씨만이면 성씨 단독 후보와 풀네임 후보를 **둘 다** 낸다.
JSON만: {"romanized": "...", "candidates": ["표기1", "표기2", "표기3"]}`,
          },
          {
            role: "user",
            content: `이름: ${name}${context ? `\n맥락: ${context}` : ""}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) {
      logUsageFailure("naming-verify", "gpt-5.6-luna", `http_${res.status}`)
      return empty
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    logUsage("naming-verify", "gpt-5.6-luna", data)
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
        ? [...new Set(parsed.candidates.map(String).filter((c) => /[가-힣]/.test(c)))].slice(0, 6)
        : [],
    }
  } catch {
    return empty
  }
}

export { naverNewsCount } from "./naver"

/** 전체 파이프: 후보 제안 → 네이버 검증 → 승자 판정 */
export async function verifySpelling(
  name: string,
  context?: string
): Promise<SpellingVerdict & { romanized: string | null }> {
  const { romanized, candidates } = await proposeCandidates(name, context)
  if (candidates.length === 0) {
    return { winner: null, counts: [], reason: "후보 생성 실패 — 사람 검수", romanized }
  }
  // 맥락에서 구단명을 뽑아 질의를 좁힌다 — 없으면 기존대로 이름 단독 (fail-open)
  const scope = extractClubName(context)
  const counts: { candidate: string; total: number }[] = []
  for (const c of candidates) {
    const total = await naverNewsCount(c, scope)
    if (total === null) {
      return { winner: null, counts, reason: "네이버 API 미가동 — 사람 검수", romanized }
    }
    counts.push({ candidate: c, total })
    await new Promise((r) => setTimeout(r, 150)) // API 예의
  }
  const verdict = pickWinner(counts)
  return {
    ...verdict,
    // 근거에 어느 맥락으로 셌는지 남긴다 — 나중에 판정을 재검토하려면 필요하다
    reason: scope ? `${verdict.reason} (${scope} 한정)` : verdict.reason,
    romanized,
  }
}
