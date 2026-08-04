import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { extractTransferBatch } from "@/lib/saga/extract"
import { classifyTier } from "@/lib/saga/tier"
import { identityKey, normalizePlayerKey } from "@/lib/saga/identity"
import { buildAliasIndex, canonicalizePlayer, type AliasRow } from "@/lib/saga/canonical"
import { SAGA_WINDOW_KEY } from "@/lib/saga/config"
import { publishReservoirItem } from "@/lib/saga/publish"
import { isWomensFootball } from "@/lib/news/quality-gate"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * 사가 추출 cron (W2) — reservoir 'ingested' → LLM 추출 → 정규화 → 'queued'.
 *
 * 상태 전이:
 *   비이적/선수 미식별 → 'discarded' (error 에 사유)
 *   추출 성공        → 'queued' → **자동 발행 시도** (2026-08-04 운영자: "사가는
 *                      자동으로 생성이 되어야 해")
 * 배치 실패는 상태를 건드리지 않는다 — 다음 회차가 재시도.
 *
 * 자동 발행 조건 (전부 충족해야 — 하나라도 아니면 큐에 남아 사람 검수):
 *   1. 사전 등재 선수 (canonicalizePlayer 매칭) — 미등재는 새 사가 오식별 위험
 *   2. 추출 확신도 ≥ 0.7
 *   3. 한국어 헤드라인 존재 (headline_ko 또는 headline_kr)
 *   4. 여자 축구 아님 (제목·헤드라인·URL 검사)
 * 멱등성은 upsertSagaEntry 의 cluster_key UNIQUE 가 보장 (중복 = 에코 접힘).
 */

const BATCH = 20
const MAX_ROWS = 40 // 60s 안에 LLM 2콜
const AUTO_PUBLISH_MIN_CONFIDENCE = 0.7

function kstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

async function cronGet(request: Request) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  {
    const supabase = createServiceRoleClient()

    const { data: pending } = await supabase
      .from("saga_reservoir")
      .select("id, source_url, source, title, headline_kr, occurred_at")
      .eq("status", "ingested")
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS)
    if (!pending?.length) return NextResponse.json({ ok: true, processed: 0 })

    const { data: aliasRows } = await supabase
      .from("news_alias_dictionary")
      .select("romanized, preferred_ko, surfaces")
      .eq("category", "player")
    const aliasIndex = buildAliasIndex((aliasRows ?? []) as AliasRow[])

    let queued = 0
    let autoPublished = 0
    let discarded = 0
    let failed = 0
    let autoHeld = 0

    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH)
      const results = await extractTransferBatch(
        chunk.map((r) => ({ title: r.title, headlineKr: r.headline_kr }))
      )

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j]
        const ex = results[j]
        if (!ex) {
          failed++ // 배치 에러 — 상태 유지, 다음 회차 재시도
          const { error: logError } = await supabase
            .from("saga_reservoir")
            .update({ error: "extract_failed", updated_at: new Date().toISOString() })
            .eq("id", row.id)
          if (logError) console.error("[saga-extract] 추출 실패 기록 실패", row.id, logError)
          continue
        }

        if (!ex.is_transfer || !ex.player) {
          const { error: discardError } = await supabase
            .from("saga_reservoir")
            .update({
              status: "discarded",
              error: !ex.is_transfer ? "not_transfer" : "no_player",
              extracted: ex,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
          if (discardError) {
            failed++
            console.error("[saga-extract] discard 상태 기록 실패", row.id, discardError)
            continue
          }
          discarded++
          continue
        }

        const canon = canonicalizePlayer(ex.player, aliasIndex)
        if (canon.matched) {
          ex.player = canon.key
          if (canon.ko) ex.player_kr = canon.ko
        }

        const src = (row.source ?? {}) as Record<string, unknown>
        const tier = classifyTier({
          category: (src.category as string) ?? null,
          original_title: row.title,
          headline_kr: row.headline_kr,
          link_url: (src.link_url as string) ?? row.source_url,
          source_id: (src.source_id as string) ?? null,
        })

        const hint = identityKey("transfer", {
          player_key: ex.player,
          direction: ex.direction,
          window_key: SAGA_WINDOW_KEY,
        })
        const clusterKey = `${normalizePlayerKey(ex.player)}:${ex.stage_signal ?? "news"}:${kstDay(row.occurred_at)}`

        const headlineKo = ex.headline_ko ?? row.headline_kr
        const autoHoldReasons = [
          ...(!canon.matched ? ["unknown_player"] : []),
          ...((ex.confidence ?? 0) < AUTO_PUBLISH_MIN_CONFIDENCE ? ["low_confidence"] : []),
          ...(!headlineKo ? ["no_korean_headline"] : []),
          ...(isWomensFootball(row.title, row.headline_kr, row.source_url)
            ? ["womens_football"]
            : []),
        ]

        const { error: queueError } = await supabase
          .from("saga_reservoir")
          .update({
            status: "queued",
            extracted: { ...ex, tier },
            saga_hint: hint,
            cluster_key: clusterKey,
            error: autoHoldReasons.length > 0 ? `auto_hold:${autoHoldReasons.join(",")}` : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        if (queueError) {
          failed++
          console.error("[saga-extract] queued 상태 기록 실패", row.id, queueError)
          continue
        }
        queued++

        // ── 자동 발행 (2026-08-04) — 조건 미달은 큐에 남아 통합 검수 화면으로
        const autoEligible = autoHoldReasons.length === 0
        if (autoEligible) {
          try {
            await publishReservoirItem(supabase, {
              id: row.id,
              source_url: row.source_url,
              source: (row.source ?? null) as Record<string, unknown> | null,
              title: row.title,
              headline_kr: row.headline_kr,
              extracted: { ...ex, tier },
              occurred_at: row.occurred_at,
            })
            autoPublished++
          } catch (e) {
            // 발행 실패(빈 키 가드·동일인 충돌 등)는 큐에 남긴다 — 사람 검수 폴백
            failed++
            const message = e instanceof Error ? e.message : String(e)
            const { error: logError } = await supabase
              .from("saga_reservoir")
              .update({
                error: `auto_publish_failed:${message}`.slice(0, 500),
                updated_at: new Date().toISOString(),
              })
              .eq("id", row.id)
            console.error("[saga-extract] 자동 발행 실패", row.id, message, logError ?? "")
          }
        } else {
          autoHeld++
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processed: pending.length,
      queued,
      autoPublished,
      autoHeld,
      discarded,
      failed,
    })
  }
}

export const GET = withCronLog("saga-extract", cronGet)
