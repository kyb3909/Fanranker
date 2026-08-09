/**
 * 발행 시점 선수 표기 전방 교정 (2026-08-07)
 *
 * 실사고: '코디 갓포' 기사가 8/6에 발행됨 — 사전에는 갓포→코디 각포가 이미
 * 등재돼 있었지만, 게이트는 "등재 여부"만 보고 통과시켰고 옛 표기를 대표
 * 표기로 바꿔주는 단계가 발행 경로에 없었다. 소급 교정(naming-audit, 8/4 제작)만
 * 있고 전방 교정이 없던 구멍.
 *
 * 설계: **결정론 사전 치환만** 한다 — hangul_alts → preferred_ko. 네이버 실시간
 * 대조는 여기 넣지 않는다 (외부 API 장애가 발행 전체를 세우면 안 됨 — 미등재
 * 이름의 네이버 검증은 소급 naming-audit 몫). 치환 규칙은 naming-audit 과 동일:
 * 긴 표기 먼저 ('코디 갓포'를 먼저, 그 다음 '갓포') — 이중 치환 방지.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchDictionaryRows } from "@/lib/news/dictionary-fetch"

export type NamingPair = [from: string, to: string]

interface DictionaryRow {
  preferred_ko: string
  hangul_alts: string[] | null
}

/**
 * 사전 행 → 치환 쌍. 안전 규칙:
 *  - alt 가 2자 미만이면 제외 (일반 단어 오폭 방지)
 *  - alt 가 다른 항목의 대표 표기와 같으면 제외 (그건 다른 선수다)
 *  - 긴 표기 우선 정렬
 */
export function buildNamingPairs(rows: DictionaryRow[]): NamingPair[] {
  const preferredSet = new Set(rows.map((r) => r.preferred_ko))
  const pairs: NamingPair[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const alt of row.hangul_alts ?? []) {
      const from = alt?.trim()
      if (!from || from.length < 2) continue
      if (from === row.preferred_ko) continue
      if (preferredSet.has(from)) continue
      if (seen.has(from)) continue // 서로 다른 항목이 같은 alt 를 주장 — 첫 항목 승
      seen.add(from)
      pairs.push([from, row.preferred_ko])
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length)
  return pairs
}

export function applyNamingPairs(text: string, pairs: NamingPair[]): string {
  let t = text
  for (const [from, to] of pairs) {
    if (t.includes(from)) t = t.split(from).join(to)
  }
  return t
}

/** TipTap 트리의 text 노드에만 치환 적용 (구조·URL·attrs 는 건드리지 않음) */
export function applyNamingPairsToTipTap(node: unknown, pairs: NamingPair[]): unknown {
  if (Array.isArray(node)) return node.map((n) => applyNamingPairsToTipTap(n, pairs))
  if (!node || typeof node !== "object") return node
  const n = node as Record<string, unknown>
  const out: Record<string, unknown> = { ...n }
  if (typeof n.text === "string") out.text = applyNamingPairs(n.text, pairs)
  if (n.content) out.content = applyNamingPairsToTipTap(n.content, pairs)
  return out
}

/** 교정 대상 = 사람 이름. 구단·매체·대회는 치환하지 않는다(오폭 위험이 이득보다 크다) */
export const NAMING_CATEGORIES = ["player", "coach"] as const
export type NamingCategory = (typeof NAMING_CATEGORIES)[number]

/** 발행 초크포인트용 — 인물 사전에서 치환 쌍 로드 (실패 시 빈 배열: 교정 없이 발행) */
export async function fetchNamingPairs(
  supabase: SupabaseClient<never, never, never> | { from: CallableFunction }
): Promise<NamingPair[]> {
  try {
    // 2026-08-09 실사고: 'Xabi Alonso → 하비 알론소'(정: 사비)가 3건 발행됐다.
    // 사전에는 coach 15건이 정확히 등재돼 있었는데 **읽는 코드가 하나도 없었다** —
    // 여기도, 소급 감사(cron/naming-audit)도, 검사관(quality-gate)도 전부 player 만
    // 봤다. 감독 이름이 4중 방어를 그대로 통과한 이유. 죽은 사전을 살린다.
    // 전량 조회는 반드시 fetchDictionaryRows 로 — 1,000행 무음 절단 방지.
    const data = await fetchDictionaryRows<DictionaryRow>(
      supabase,
      "preferred_ko, hangul_alts",
      NAMING_CATEGORIES
    )
    return buildNamingPairs(data)
  } catch {
    // 사전 조회 실패가 발행을 막으면 안 된다 — 교정 생략이 올바른 강등
    return []
  }
}
