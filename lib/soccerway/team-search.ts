/**
 * Soccerway 팀 검색 — Livesport 검색 서비스 (실록 단계 2, 2026-08-07 실측)
 *
 * soccerway.com 은 Livesport 플랫폼(projectId 2020 — 페이지 HTML 실측)이고,
 * 검색은 s.livesport.services 가 JSON 으로 응답한다. 팀 해시(id)·슬러그(url)·
 * 국가·성별까지 나온다 — 팀 사전 수확의 정공법. 단 영어 인덱스만이라
 * (한국어 쿼리 0건 실측) 한글 팀명은 로마자 쿼리 변환이 선행돼야 한다.
 *
 * 변환은 선수 표기 루프와 같은 규율: LLM 은 **검색 쿼리 후보만** 제안하고,
 * 채택은 검색 결과 + 경기 페이지 날짜 대조(match-mapping 술어)가 결정한다.
 *
 * (server-only 미사용 — cron 과 scripts/run-match-mapping-shadow.ts 가 함께 쓴다)
 */

import { chatParams } from "@/lib/llm/openai-params"

const SEARCH_BASE = "https://s.livesport.services/api/v2/search/"
const SOCCERWAY_PROJECT_ID = "2020"

export interface SoccerwayTeamCandidate {
  soccerwayTeamId: string
  slug: string
  nameEn: string
  country: string | null
}

interface RawSearchItem {
  id?: string
  url?: string
  name?: string
  type?: { name?: string }
  sport?: { name?: string }
  gender?: { name?: string }
  defaultCountry?: { name?: string } | null
}

/**
 * 유스·리저브 팀 표기 — 후보에서 제외한다.
 *
 * 2026-08-17 실측: "비야레알" 검색이 Villarreal / Villarreal U19 / Villarreal B 를 모두
 * 반환했고, 셋 다 같은 슬러그("villarreal")에 id 만 달랐다. 발견 단계가 이들을 전부
 * 후보로 삼으면 조합이 2건 이상 성립해 **ambiguous → 등재 실패**가 된다 (라싱 산탄데르
 * vs 비야레알 라리가 개막 라운드가 이 이유로 라인업 없이 남았다).
 */
const YOUTH_RESERVE_RE = /\b(U\s?\d{2}|B|II|III|Reserves?|Youth|Academy|Sub\s?\d{2})\b/i

/** 검색 응답 → 남자 축구 1군 팀만 (여자축구 정책 + 유스·리저브 + 선수/대회 결과 제외) */
export function parseTeamSearchResults(raw: unknown): SoccerwayTeamCandidate[] {
  if (!Array.isArray(raw)) return []
  const out: SoccerwayTeamCandidate[] = []
  for (const item of raw as RawSearchItem[]) {
    if (item?.type?.name !== "Team") continue
    if (item?.sport?.name !== "Soccer") continue
    if (item?.gender?.name === "Women") continue
    if (!item.id || !item.url || !item.name) continue
    if (YOUTH_RESERVE_RE.test(item.name)) continue
    if (!/^[A-Za-z0-9]{8}$/.test(item.id)) continue
    out.push({
      soccerwayTeamId: item.id,
      slug: item.url,
      nameEn: item.name,
      country: item.defaultCountry?.name ?? null,
    })
  }
  return out
}

export async function searchSoccerwayTeams(query: string): Promise<SoccerwayTeamCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    "lang-id": "1",
    "project-id": SOCCERWAY_PROJECT_ID,
    "project-type-id": "1",
    "type-ids": "2",
    "sport-ids": "1",
  })
  try {
    const res = await fetch(`${SEARCH_BASE}?${params}`, {
      headers: {
        Accept: "application/json",
        Referer: "https://www.soccerway.com/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    return parseTeamSearchResults(await res.json())
  } catch {
    return []
  }
}

/** betman league_code → 검색 결과 국가 필터 (모르는 리그는 필터 없음) */
export function leagueCountryHint(leagueCode: string | null): string | null {
  if (!leagueCode) return null
  if (/^K리그|^한국/.test(leagueCode)) return "South Korea"
  if (/^J\d/.test(leagueCode)) return "Japan"
  if (leagueCode === "MLS") return "USA"
  if (leagueCode.includes("엘리테")) return "Norway"
  if (leagueCode.includes("라리가")) return "Spain"
  if (leagueCode.includes("분데스")) return "Germany"
  if (leagueCode.includes("세리에")) return "Italy"
  if (leagueCode.includes("EPL") || leagueCode.includes("프리미어")) return "England"
  return null
}

/**
 * 한글 팀명 → 로마자 검색 쿼리 후보 (LLM — 후보 제안만, 채택은 검증이 한다).
 * 실패·키 없음 → 빈 배열 (discovery 생략, 기존 team_unresolved 경로).
 */
export async function proposeSearchQueries(
  nameKr: string,
  leagueCode: string | null
): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams("gpt-4o-mini", { temperature: 0 }),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              '축구 팀의 한글 표기를 받으면 국제 검색용 영문 검색어 후보 1~3개를 짧게 제안하라 (구단 통칭 위주 — 예: "전북 현대모터스"→["jeonbuk"], "요코하마 F마리노스"→["yokohama f. marinos","yokohama marinos"]). JSON만: {"queries":["..."]}',
          },
          {
            role: "user",
            content: `팀명: ${nameKr}${leagueCode ? `\n리그: ${leagueCode}` : ""}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      queries?: unknown[]
    }
    return Array.isArray(parsed.queries)
      ? [...new Set(parsed.queries.map(String).filter((q) => /^[\x20-\x7e]{2,40}$/.test(q)))].slice(
          0,
          3
        )
      : []
  } catch {
    return []
  }
}
