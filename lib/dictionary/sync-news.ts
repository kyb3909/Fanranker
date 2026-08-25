import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * 스쿼드 사전 → 뉴스 사전 단방향 동기화 (2026-08-25).
 *
 * ## 왜 필요한가
 * 이 프로젝트에는 사람 이름 사전이 **둘**이다:
 *   `team_squads`            — 라인업·스탯·매치센터가 읽는다
 *   `news_alias_dictionary`  — 기사 작성이 읽는다
 * 어드민에서 스쿼드 이름을 고쳐도 **기사에는 반영되지 않는다.** 운영자 요구
 * ("기사·판타지·승부예측·스탯·라인업 모든 부분에 활용")를 지금 구조가 못 지킨다.
 *
 * ## ⚠️ 덮어쓰지 않는다 — 자동 병합이 위험한 이유
 * 실측(2026-08-25): 양쪽에 다 있는 1,122명 중 **25명의 표기가 다르다.** 그리고
 * **어느 쪽도 일관되게 옳지 않다**:
 *     Rashford      스쿼드 래시포드   / 뉴스 래시퍼드    → 스쿼드가 매체 관행
 *     Douglas Luiz  스쿼드 도글라스   / 뉴스 더글라스    → 뉴스가 매체 관행
 * 게다가 뉴스 쪽 confidence 0.95 짜리들이 정작 `notes` 가 **null** 이다 —
 * 네이버 건수 근거가 붙은 항목도 있지만(0.7 대) 높은 점수가 근거를 뜻하지 않는다.
 *
 * 그래서 **없는 것만 넣고, 있는 것은 건드리지 않는다.** 충돌은 운영자에게 보여
 * 사람이 고르게 한다 — 표기 정본은 운영자 확정이다.
 *
 * ⚠️ 뉴스 파이프라인은 fail-closed 다. 표기 검증이 막히면 **에러 없이 발행이 멈춘다.**
 *    그래서 이 동기화는 뉴스 코드를 건드리지 않고 **데이터만** 흘려보낸다.
 */

/**
 * 표기 충돌 해결 — 어느 쪽 표기로 통일할지 **사람이 고른 결과**를 반영한다.
 *
 * ⚠️ 이 함수가 여기 있는 이유: 라우트에서 `news_alias_dictionary` 를 직접 만지면
 *    "표기 사전은 문이 하나다" 아키텍처 가드에 걸린다. 그 규칙은 옳다 —
 *    사전 접근이 7개 경로로 갈라져 하루에 표기 사고가 다섯 번 났던 적이 있다.
 *    사전을 만지는 코드는 이 모듈 하나에 모은다.
 */
export async function resolveNotationConflict(
  supabase: SupabaseClient,
  opts: { romanized: string; winner: "squad" | "news"; newsId: string; value: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { romanized, winner, newsId, value } = opts
  if (!/^[가-힣·\s-]{2,20}$/.test(value))
    return { ok: false, message: `한글명 형식이 아닙니다: ${value}` }

  if (winner === "squad") {
    // 스쿼드 표기를 정본으로 → 뉴스 사전을 맞춘다
    const { error } = await supabase
      .from("news_alias_dictionary")
      .update({
        preferred_ko: value,
        notes: "운영자 확정 — 스쿼드 사전과 통일 (표기 충돌 해결)",
        updated_at: new Date().toISOString(),
      })
      .eq("id", newsId)
    if (error) return { ok: false, message: error.message }
  } else {
    // 뉴스 표기를 정본으로 → 스쿼드를 맞춘다 (로마자가 같은 행 전부)
    const { error } = await supabase
      .from("team_squads")
      .update({ name_kr: value, status: "confirmed", updated_at: new Date().toISOString() })
      .eq("name_en", romanized)
    if (error) return { ok: false, message: error.message }
  }
  return { ok: true }
}

/** 대조 키 — 양쪽의 로마자를 같은 규칙으로 눕힌다 */
export function romanKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** 뉴스 사전 id 규칙 — 기존 항목이 `player_auto_<slug>` 라 같은 문법을 따른다 */
function newsId(nameEn: string): string {
  const slug = romanKey(nameEn).replace(/ /g, "_")
  return `player_squad_${slug}`
}

export interface SyncResult {
  /** 뉴스 사전에 새로 넣은 수 */
  inserted: number
  /** 이미 있어서 건너뛴 수 */
  existing: number
  /** 표기가 서로 다른 것 — 사람이 골라야 한다 */
  conflicts: { romanized: string; squad: string; news: string; newsId: string }[]
}

/**
 * 확정된(`confirmed`) 스쿼드 이름만 뉴스 사전으로 흘려보낸다.
 *
 * ⚠️ `proposed` 는 보내지 않는다 — 검수 안 된 추정치가 기사 표기가 되면
 *    [[project-dictionary-poisoning]] 이 그대로 재현된다.
 */
export async function syncSquadNamesToNews(
  supabase: SupabaseClient,
  opts: { apply?: boolean } = {}
): Promise<SyncResult> {
  const squads: { name_en: string; name_kr: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("team_squads")
      .select("name_en, name_kr")
      .eq("status", "confirmed")
      .not("name_kr", "is", null)
      .range(from, from + 999)
    squads.push(...((data ?? []) as { name_en: string; name_kr: string }[]))
    if (!data || data.length < 1000) break
  }

  const news: { id: string; romanized: string; preferred_ko: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("news_alias_dictionary")
      .select("id, romanized, preferred_ko")
      .eq("category", "player")
      .range(from, from + 999)
    news.push(...((data ?? []) as { id: string; romanized: string; preferred_ko: string }[]))
    if (!data || data.length < 1000) break
  }
  const newsByKey = new Map(news.map((n) => [romanKey(n.romanized), n]))

  const out: SyncResult = { inserted: 0, existing: 0, conflicts: [] }
  const seen = new Set<string>()

  for (const s of squads) {
    const key = romanKey(s.name_en)
    if (!key || seen.has(key)) continue
    seen.add(key)

    const hit = newsByKey.get(key)
    if (hit) {
      out.existing++
      if (hit.preferred_ko !== s.name_kr) {
        out.conflicts.push({
          romanized: s.name_en,
          squad: s.name_kr,
          news: hit.preferred_ko,
          newsId: hit.id,
        })
      }
      continue
    }

    if (opts.apply) {
      const { error } = await supabase.from("news_alias_dictionary").insert({
        id: newsId(s.name_en),
        category: "player",
        preferred_ko: s.name_kr,
        romanized: s.name_en,
        // surfaces = 기사에서 이 사람을 가리킬 수 있는 표면형. 기존 항목과 같은 문법
        surfaces: [key, s.name_kr],
        hangul_alts: [],
        confidence: 0.8,
        notes: "스쿼드 사전 동기화 — 운영자가 검수 화면에서 확정한 표기",
      })
      if (error) continue
    }
    out.inserted++
  }

  return out
}
