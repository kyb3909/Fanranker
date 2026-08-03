import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { extractTransferBatch } from "@/lib/saga/extract"
import { classifyTier } from "@/lib/saga/tier"
import { identityKey, normalizePlayerKey } from "@/lib/saga/identity"
import { buildAliasIndex, canonicalizePlayer, type AliasRow } from "@/lib/saga/canonical"
import { SAGA_WINDOW_KEY } from "@/lib/saga/config"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * 사가 추출 cron (W2) — reservoir 'ingested' → LLM 추출 → 정규화 → 'queued'.
 *
 * 상태 전이:
 *   비이적/선수 미식별 → 'discarded' (error 에 사유)
 *   추출 성공        → 'queued' + extracted/saga_hint/cluster_key (검수 화면 재료)
 * 배치 실패는 상태를 건드리지 않는다 — 다음 회차가 재시도.
 * 발행 없음 — HITL 검수(/admin2/saga, W3)가 유일한 발행 경로.
 */

const BATCH = 20
const MAX_ROWS = 40 // 60s 안에 LLM 2콜

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
    let discarded = 0
    let failed = 0

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
          continue
        }

        if (!ex.is_transfer || !ex.player) {
          await supabase
            .from("saga_reservoir")
            .update({
              status: "discarded",
              error: !ex.is_transfer ? "not_transfer" : "no_player",
              extracted: ex,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
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

        await supabase
          .from("saga_reservoir")
          .update({
            status: "queued",
            extracted: { ...ex, tier },
            saga_hint: hint,
            cluster_key: clusterKey,
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
        queued++
      }
    }

    return NextResponse.json({ ok: true, processed: pending.length, queued, discarded, failed })
  }
}

export const GET = withCronLog("saga-extract", cronGet)
