import "server-only"

import type { createServiceRoleClient } from "@/lib/supabase/server"
import { getOrCreateSaga, appendEntry } from "./create"
import { resolveOrigin, type TransferTier } from "./tier"
import { identityKey, normalizePlayerKey } from "./identity"
import { SAGA_WINDOW_KEY } from "./config"
import type { ExtractedTransfer } from "./extract"

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/**
 * 검수 승인 → 사가 발행 (W3). /api/admin2/saga 의 publish 액션 본체.
 *
 * - 검수자 수정값(edits)이 추출값을 덮는다.
 * - 같은 (사가, cluster_key)에 이미 엔트리가 있으면 **에코로 접는다** (D9 —
 *   덮어쓰기 금지, origin 은 먼저 발행된 보도 유지).
 * - reservoir 행은 'published' 로 마감 (멱등: 이미 처리된 행은 호출부에서 걸러짐).
 */

export interface ReservoirPublishRow {
  id: string
  source_url: string
  source: Record<string, unknown> | null
  title: string
  headline_kr: string | null
  extracted: (ExtractedTransfer & { tier?: TransferTier }) | null
  occurred_at: string
}

export interface PublishEdits {
  player?: string
  player_kr?: string | null
  direction?: "in" | "out"
  stage_signal?: ExtractedTransfer["stage_signal"]
  headline_ko?: string
}

export async function publishReservoirItem(
  supabase: ServiceClient,
  row: ReservoirPublishRow,
  edits: PublishEdits = {}
): Promise<{ sagaSlug: string; sagaTitle: string; folded: boolean }> {
  const ex = row.extracted
  if (!ex) throw new Error("추출 결과가 없는 항목입니다.")

  const player = edits.player ?? ex.player
  if (!player) throw new Error("선수명이 비어 있습니다.")
  const playerKr = edits.player_kr !== undefined ? edits.player_kr : ex.player_kr
  const direction = edits.direction ?? ex.direction
  const stageSignal = edits.stage_signal !== undefined ? edits.stage_signal : ex.stage_signal
  const headline = edits.headline_ko ?? ex.headline_ko ?? row.headline_kr ?? row.title
  const tier: TransferTier = ex.tier ?? "rumor"

  const subject = {
    player_key: normalizePlayerKey(player),
    player_name_kr: playerKr,
    direction,
  }
  const { saga } = await getOrCreateSaga(supabase, {
    type: "transfer",
    title: `${playerKr ?? player} 이적 사가`,
    subject,
    windowKey: SAGA_WINDOW_KEY,
  })

  // 검수자가 선수/방향을 고쳤을 수 있으므로 cluster_key 는 발행 시점에 재계산
  const day = new Date(new Date(row.occurred_at).getTime() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)
  const clusterKey = `${normalizePlayerKey(player)}:${stageSignal ?? "news"}:${day}`

  const src = row.source ?? {}
  const origin = resolveOrigin({
    original_title: row.title,
    author: (src.author as string) ?? null,
    link_url: (src.link_url as string) ?? row.source_url,
    external_url: (src.external_url as string) ?? null,
  })

  const { data: existingEntry } = await supabase
    .from("saga_entries")
    .select("id, echoes")
    .eq("saga_id", saga.id)
    .eq("cluster_key", clusterKey)
    .maybeSingle()

  if (existingEntry) {
    const echoes = [
      ...((existingEntry.echoes as { outlet: string; url: string; title: string }[]) ?? []),
      { outlet: origin.outlet, url: origin.url ?? row.source_url, title: row.title },
    ]
    await supabase.from("saga_entries").update({ echoes }).eq("id", existingEntry.id)
  } else {
    await appendEntry(supabase, saga.id, "transfer", saga.stage, {
      clusterKey,
      headline,
      tier,
      stageAfter: stageSignal,
      origin: {
        reporter: origin.reporter,
        outlet: origin.outlet,
        url: origin.url ?? row.source_url,
      },
      occurredAt: row.occurred_at,
    })
  }

  await supabase
    .from("saga_reservoir")
    .update({
      status: "published",
      saga_hint: identityKey("transfer", { ...subject, window_key: SAGA_WINDOW_KEY }),
      cluster_key: clusterKey,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  return { sagaSlug: saga.slug, sagaTitle: saga.title, folded: !!existingEntry }
}
