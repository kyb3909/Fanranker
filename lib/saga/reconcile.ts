import "server-only"

import type { createServiceRoleClient } from "@/lib/supabase/server"
import { buildAliasIndex, canonicalizePlayer, type AliasRow } from "./canonical"
import { buildNamingPairs, applyNamingPairs } from "@/lib/news/notation/rules"

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/**
 * 사가 표기 동기화 — **선수 사전이 정본이다** (2026-08-30 운영자: "선수 모든 이름은
 * 선수 사전에 등록된 이름 기준으로 정리").
 *
 * 사가 제목·subject.player_name_kr 은 생성 순간의 표기로 얼어붙는다. 운영자가 나중에
 * 사전을 고치면(가크포→각포) 사가는 옛 표기를 계속 문다 — 이 러너가 주기적으로
 * 사전 기준으로 되돌린다. saga-extract cron 끝에 붙어 15분 주기로 돈다.
 *
 * 건드리는 것: sagas.title(생성기가 만든 "{이름} 이적 사가" 꼴일 때만 — 손으로 고친
 * 제목은 보존), subject.player_name_kr, 앵커 post 제목, saga_entries.headline 의
 * 옛 한글 표기(hangul_alts→preferred_ko, 뉴스 발행과 같은 buildNamingPairs 규칙).
 *
 * 건드리지 않는 것: **identity(player_key·identity_key·slug)**. 키 이관은 UNIQUE
 * 충돌·링크 파손 위험이 커서 여기서 안 한다 — 새 유입의 키 정규화는
 * canonicalizePlayer 의 성씨 승격이 맡는다.
 *
 * ⚠️ 사전은 **player 한정** — 감독을 섞으면 안 된다 (lib/news/notation 의 사가 제외
 * 원칙과 같은 이유. 이 파일은 그 원칙 안에서 순수 함수만 빌려 쓴다).
 */

export interface ReconcileSummary {
  scanned: number
  subjectsUpdated: number
  titlesRenamed: number
  headlinesFixed: number
}

export async function reconcileSagaNames(supabase: ServiceClient): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = {
    scanned: 0,
    subjectsUpdated: 0,
    titlesRenamed: 0,
    headlinesFixed: 0,
  }

  const { data: aliasRows } = await supabase
    .from("news_alias_dictionary")
    .select("romanized, preferred_ko, surfaces, hangul_alts")
    .eq("category", "player")
  const rows = ((aliasRows ?? []) as (AliasRow & { hangul_alts: string[] | null })[]).filter(
    (r) => r.romanized && r.preferred_ko
  )
  if (rows.length === 0) return summary

  const index = buildAliasIndex(rows)

  // ── ① 사가 제목·subject 한글 표기 ──
  const { data: sagas } = await supabase
    .from("sagas")
    .select("id, title, subject, anchor_post_id")
    .eq("saga_type", "transfer")
    .limit(2000)
  for (const s of sagas ?? []) {
    const subj = (s.subject ?? {}) as Record<string, unknown> & {
      player_key?: string
      player_name_kr?: string | null
    }
    const key = String(subj.player_key ?? "")
    if (!key) continue
    summary.scanned++
    const canon = canonicalizePlayer(key, index)
    if (!canon.matched || !canon.ko) continue
    const oldKo = subj.player_name_kr ?? null
    if (canon.ko === oldKo) continue

    // 생성기 제목("{옛 표기} 이적 사가")일 때만 갈아끼운다 — 손 제목은 보존
    const generatedOldTitle = `${oldKo ?? key} 이적 사가`
    const newTitle = `${canon.ko} 이적 사가`
    const patch: Record<string, unknown> = {
      subject: { ...subj, player_name_kr: canon.ko },
      updated_at: new Date().toISOString(),
    }
    const renameTitle = s.title === generatedOldTitle && s.title !== newTitle
    if (renameTitle) patch.title = newTitle
    const { error } = await supabase.from("sagas").update(patch).eq("id", s.id)
    if (error) continue
    summary.subjectsUpdated++
    if (renameTitle) {
      summary.titlesRenamed++
      if (s.anchor_post_id) {
        // 앵커 post 도 같은 생성기 제목일 때만 — 같지 않으면 남이 손댄 것
        await supabase
          .from("posts")
          .update({ title: newTitle })
          .eq("id", s.anchor_post_id)
          .eq("title", s.title)
      }
    }
  }

  // ── ② 엔트리 헤드라인의 옛 한글 표기 (가크포→각포) ──
  // 뉴스 발행과 같은 치환 규칙(buildNamingPairs — 길이 변형 가드 포함)을 쓴다.
  const pairs = buildNamingPairs(
    rows.map((r) => ({ preferred_ko: r.preferred_ko, hangul_alts: r.hangul_alts }))
  )
  if (pairs.length > 0) {
    const { data: entries } = await supabase.from("saga_entries").select("id, headline").limit(2000)
    for (const e of entries ?? []) {
      const headline = String(e.headline ?? "")
      if (!headline) continue
      const fixed = applyNamingPairs(headline, pairs)
      if (fixed !== headline) {
        const { error } = await supabase
          .from("saga_entries")
          .update({ headline: fixed })
          .eq("id", e.id)
        if (!error) summary.headlinesFixed++
      }
    }
  }

  return summary
}
