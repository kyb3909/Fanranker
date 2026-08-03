import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifySpelling } from "@/lib/naming/verify"
import { normalizePlayerKey, isSamePlayerKey } from "@/lib/saga/identity"
import { buildAliasIndex, canonicalizePlayer, type AliasRow } from "@/lib/saga/canonical"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * 표기 사서(司書) 에이전트 (매일 밤) — "기사가 문제가 아냐, 표기법이 문제거든"
 * (2026-08-04 운영자).
 *
 * 미등재 선수명을 세 곳에서 모아 → LLM 이 표기 후보 제안 → **네이버 뉴스 검색량**
 * 으로 검증(한국 언론 실사용이 정답) → 압도적 다수 표기만 사전 자동 등재:
 *   A. 자동발행 검사관이 "사전 미등재 선수명"으로 강등시킨 기사들
 *   B. 사가 검수 큐에서 한글 표기가 비어 있는 항목 (등재되면 큐에도 채워줌)
 *   C. 영문 제목으로 남은 사가 문서 (등재되면 제목·앵커까지 한글화)
 *
 * fail-closed: 검색량 부족·표기 경합·API 미가동이면 등재하지 않는다 — 사람 몫으로.
 * 등재 근거(후보별 검색량)는 사전 notes 에 남는다.
 */

const DAILY_NAME_CAP = 10

interface Fix {
  name: string
  result: string
}

async function cronGet(request: Request) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  {
    const supabase = createServiceRoleClient()
    const fixes: Fix[] = []

    // ── 기존 사전 로드 (중복 등재 방지) — 성(姓) 폴백까지 포함한 정식 매칭 사용
    // (1차 가동 실사고: 'Henderson'이 '조던 헨더슨' 등재를 못 보고 중복 등재됨)
    const { data: dict } = await supabase
      .from("news_alias_dictionary")
      .select("romanized, preferred_ko, surfaces, hangul_alts")
      .eq("category", "player")
    const aliasIndex = buildAliasIndex((dict ?? []) as AliasRow[])
    const knownKeys = new Set((dict ?? []).map((d) => normalizePlayerKey(d.romanized)))
    const knownKo = new Set(
      (dict ?? [])
        .flatMap((d) => [d.preferred_ko, ...(d.hangul_alts ?? [])])
        .map((s) => s.replace(/\s+/g, ""))
    )
    const isKnown = (name: string) =>
      /[가-힣]/.test(name)
        ? knownKo.has(name.replace(/\s+/g, ""))
        : canonicalizePlayer(name, aliasIndex).matched

    // ── 수집: 미등재 이름 후보 ──
    const targets = new Map<string, { context?: string }>() // key = 원 표기

    // A. 검사관 강등 사유의 한글 이름
    const { data: gatedRows } = await supabase
      .from("news_reservoir")
      .select("draft, decision")
      .eq("status", "drafted")
      .limit(50)
    for (const row of gatedRows ?? []) {
      const gate = (row.decision as { auto_gate?: { reasons?: string[] } } | null)?.auto_gate
      for (const reason of gate?.reasons ?? []) {
        const m = reason.match(/사전 미등재 선수명: (.+)$/)
        if (!m) continue
        for (const raw of m[1].split(",")) {
          const nameKr = raw.trim()
          if (nameKr && !knownKo.has(nameKr.replace(/\s+/g, ""))) {
            targets.set(nameKr, { context: (row.draft as { title?: string })?.title })
          }
        }
      }
    }

    // B. 사가 검수 큐 — 한글 표기 빈 항목
    const { data: queueRows } = await supabase
      .from("saga_reservoir")
      .select("id, title, extracted")
      .eq("status", "queued")
      .limit(50)
    for (const row of queueRows ?? []) {
      const ex = row.extracted as { player?: string | null; player_kr?: string | null } | null
      if (ex?.player && !ex.player_kr && !isKnown(ex.player)) {
        targets.set(ex.player, { context: row.title as string })
      }
    }

    // C. 영문 제목 사가
    const { data: engSagas } = await supabase
      .from("sagas")
      .select("id, title, subject, anchor_post_id")
      .eq("saga_type", "transfer")
      .eq("status", "active")
    const englishTitled = (engSagas ?? []).filter((s) => !/[가-힣]/.test(s.title as string))
    for (const s of englishTitled) {
      const key = (s.subject as { player_key?: string })?.player_key
      if (key) targets.set(key, { context: s.title as string })
    }

    // ── 검증·등재 (일일 상한) ──
    let registered = 0
    for (const [name, { context }] of [...targets].slice(0, DAILY_NAME_CAP)) {
      const v = await verifySpelling(name, context)
      if (!v.winner || !v.romanized) {
        fixes.push({ name, result: `보류 (${v.reason})` })
        continue
      }
      const romanKey = normalizePlayerKey(v.romanized)
      if (knownKeys.has(romanKey)) {
        fixes.push({ name, result: `이미 등재 (${v.romanized})` })
        continue
      }
      const evidence = v.counts.map((c) => `${c.candidate} ${c.total}건`).join(", ")
      const { error } = await supabase.from("news_alias_dictionary").insert({
        id: `player_auto_${romanKey.replace(/-/g, "_")}`.slice(0, 60),
        category: "player",
        preferred_ko: v.winner,
        romanized: v.romanized,
        surfaces: [...new Set([romanKey.replace(/-/g, " "), v.winner, name])],
        confidence: 0.7,
        notes: `사서 에이전트 자동 등재 — 네이버 근거: ${evidence}`,
      })
      if (error) {
        fixes.push({ name, result: `등재 실패: ${error.message}` })
        continue
      }
      knownKeys.add(romanKey)
      knownKo.add(v.winner.replace(/\s+/g, ""))
      registered++
      fixes.push({ name, result: `등재 → ${v.winner} (${evidence})` })

      // B 후속: 검수 큐의 빈 한글 표기 채움
      for (const row of queueRows ?? []) {
        const ex = row.extracted as Record<string, unknown> | null
        if (ex?.player && isSamePlayerKey(normalizePlayerKey(String(ex.player)), romanKey)) {
          await supabase
            .from("saga_reservoir")
            .update({ extracted: { ...ex, player_kr: v.winner } })
            .eq("id", row.id)
        }
      }

      // C 후속: 영문 제목 사가 한글화 (제목·subject·앵커 포스트)
      for (const s of englishTitled) {
        const subj = s.subject as Record<string, unknown>
        const sKey = normalizePlayerKey(String(subj.player_key ?? ""))
        if (isSamePlayerKey(sKey, romanKey)) {
          const newTitle = `${v.winner} 이적 사가`
          await supabase
            .from("sagas")
            .update({
              title: newTitle,
              subject: { ...subj, player_name_kr: v.winner },
              updated_at: new Date().toISOString(),
            })
            .eq("id", s.id)
          await supabase.from("posts").update({ title: newTitle }).eq("id", s.anchor_post_id)
          fixes.push({ name, result: `사가 제목 한글화 → ${newTitle}` })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      candidates: targets.size,
      processed: Math.min(targets.size, DAILY_NAME_CAP),
      registered,
      fixes,
    })
  }
}

export const GET = withCronLog("naming-librarian", cronGet)
