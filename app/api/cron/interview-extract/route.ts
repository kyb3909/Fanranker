import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { extractVerifiedQuotes, translateQuotes } from "@/lib/interviews/extract"
import { findNotationViolations, loadNotationSafe } from "@/lib/news/notation"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/** run 당 처리 상한 (LLM 비용 가드 — 카드 1장 = 호출 2회) */
const MAX_PER_RUN = 5
/** 실행 실패(LLM 불능 등) 재시도 상한 — 초과 시 dead_letter */
const MAX_ATTEMPTS = 3

/**
 * GET /api/cron/interview-extract — 발췌관 + 역관 (인터뷰 발췌 조직 2단계)
 *
 * pending 카드를 집어 ① 발언을 원문 그대로 오려내고(LLM) ② 원문 부분문자열
 * 대조로 검증한 뒤(기계 — 탈락분은 폐기) ③ 한국어로 옮긴다(LLM, 표기 사전 힌트).
 * 산출 status:
 *   ready       — 검수 대기 (/admin/interviews 에서 승인 → 시즌 사가 발행)
 *   skipped     — 판정상 카드 불가 (검증 통과 발언 0건 등) — 재시도 없음
 *   pending 잔류 — 실행 실패 (LLM 오류) — attempt_count 로 재시도, 초과 시 dead_letter
 * 판정 실패와 실행 실패를 절대 같은 값으로 합치지 않는다 (재시도 표준).
 */
async function handler(req: NextRequest) {
  const denied = verifyCronSecret(req)
  if (denied) return denied

  const supabase = createServiceRoleClient()
  const { data: cards, error } = await supabase
    .from("interview_cards")
    .select("id, source_title, material, attempt_count")
    .eq("status", "pending")
    .lt("attempt_count", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // 표기 사전 — 번역 힌트 + 사후 오표기 검사 (실패해도 발행을 막지 않는 로더)
  const notation = await loadNotationSafe(supabase)

  let ready = 0
  let skipped = 0
  let failed = 0
  for (const card of cards ?? []) {
    const bump = async (patch: Record<string, unknown>) =>
      supabase
        .from("interview_cards")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", card.id)

    try {
      // ── 발췌 + 기계 대조 ──
      const ex = await extractVerifiedQuotes(card.source_title, card.material)
      if (!ex) throw new Error("extract_llm_failed")

      if (ex.verified.length === 0) {
        // 판정: 원문 검증을 통과한 발언이 없다 — 카드 불가 (재시도 무의미)
        await bump({ status: "skipped", hold_reason: `no_verified_quote(dropped=${ex.dropped})` })
        skipped++
        continue
      }

      // ── 번역 (표기 힌트: 원문에 등장하는 사전 등재 인명) ──
      const hay = `${card.source_title}\n${card.material}`.toLowerCase()
      const hints = notation.entries
        .filter((e) => e.romanized && hay.includes(e.romanized.toLowerCase()))
        .slice(0, 8)
        .map((e) => ({ en: e.romanized as string, ko: e.preferred_ko }))
      const tr = await translateQuotes(ex.speaker, ex.verified, hints)
      if (!tr) throw new Error("translate_llm_failed")

      // ── 표기 사후 검사 — 오표기가 살아 있으면 검수 사유로 표시 (발행은 사람이 판단) ──
      const koText = `${tr.headline_ko}\n${tr.quotes_ko.join("\n")}`
      const violations = findNotationViolations(koText, notation.entries)

      await bump({
        status: "ready",
        speaker: tr.speaker_ko ?? ex.speaker,
        quotes: ex.verified.map((en, i) => ({ en, ko: tr.quotes_ko[i] })),
        headline_ko: tr.headline_ko,
        hold_reason: violations.length
          ? `notation:${violations.map((v) => `${v.alt}→${v.preferred}`).join(",")}`
          : null,
        error: null,
      })
      ready++
    } catch (e) {
      // 실행 실패 — 재시도 원장
      const message = e instanceof Error ? e.message : String(e)
      const attempts = (card.attempt_count ?? 0) + 1
      await bump({
        attempt_count: attempts,
        error: message.slice(0, 300),
        ...(attempts >= MAX_ATTEMPTS ? { status: "dead_letter" } : {}),
      })
      failed++
    }
  }

  return NextResponse.json({ ok: true, picked: (cards ?? []).length, ready, skipped, failed })
}

export const GET = withCronLog("interview-extract", handler)
