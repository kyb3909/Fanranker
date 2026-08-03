import "server-only"

import type { createServiceRoleClient } from "@/lib/supabase/server"
import { getOrCreateSaga, appendEntry } from "./create"
import { resolveOrigin, classifyTier, type TransferTier } from "./tier"
import { identityKey, normalizePlayerKey } from "./identity"
import { SAGA_WINDOW_KEY } from "./config"
import { extractTransferBatch, type ExtractedTransfer } from "./extract"
import { buildAliasIndex, canonicalizePlayer, type AliasRow } from "./canonical"

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/** 사가 엔트리 공용 업서트 재료 — 검수 큐 발행과 기사 발행 연동이 공유 */
export interface SagaEntryDraft {
  player: string
  playerKr: string | null
  direction: "in" | "out"
  stageSignal: ExtractedTransfer["stage_signal"]
  headline: string
  tier: TransferTier
  origin: { reporter: string | null; outlet: string; url: string }
  occurredAt: string
}

/**
 * 사가 getOrCreate + 엔트리 append. 같은 (사가, cluster_key)에 이미 엔트리가 있으면
 * **에코로 접는다** (D9 — 덮어쓰기 금지, origin 은 먼저 발행된 보도 유지).
 */
export async function upsertSagaEntry(
  supabase: ServiceClient,
  d: SagaEntryDraft
): Promise<{
  sagaId: string
  sagaSlug: string
  sagaTitle: string
  folded: boolean
  entryId: string | null
}> {
  const subject = {
    player_key: normalizePlayerKey(d.player),
    player_name_kr: d.playerKr,
    direction: d.direction,
  }
  const { saga } = await getOrCreateSaga(supabase, {
    type: "transfer",
    title: `${d.playerKr ?? d.player} 이적 사가`,
    subject,
    windowKey: SAGA_WINDOW_KEY,
  })

  const day = new Date(new Date(d.occurredAt).getTime() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)
  const clusterKey = `${normalizePlayerKey(d.player)}:${d.stageSignal ?? "news"}:${day}`

  const { data: existingEntry } = await supabase
    .from("saga_entries")
    .select("id, echoes")
    .eq("saga_id", saga.id)
    .eq("cluster_key", clusterKey)
    .maybeSingle()

  let entryId: string | null = null
  if (existingEntry) {
    const echoes = [
      ...((existingEntry.echoes as { outlet: string; url: string; title: string }[]) ?? []),
      { outlet: d.origin.outlet, url: d.origin.url, title: d.headline },
    ]
    await supabase.from("saga_entries").update({ echoes }).eq("id", existingEntry.id)
    entryId = existingEntry.id
  } else {
    const entry = await appendEntry(supabase, saga.id, "transfer", saga.stage, {
      clusterKey,
      headline: d.headline,
      tier: d.tier,
      stageAfter: d.stageSignal,
      origin: d.origin,
      occurredAt: d.occurredAt,
    })
    entryId = (entry as { id: string } | null)?.id ?? null
  }

  return {
    sagaId: saga.id,
    sagaSlug: saga.slug,
    sagaTitle: saga.title,
    folded: !!existingEntry,
    entryId,
  }
}

/**
 * 발행된 뉴스 기사 → 사가 자동 연동 (2026-08-03 오너 요청 — "기사가 발행되면
 * 그 선수의 사가 위키가 생긴다").
 *
 * HITL 정합성: 기사 발행 자체가 사람 검수를 통과한 순간이므로, 그 기사에서 파생된
 * 사가 엔트리는 무검수 자동 발행이 아니다. 이적 기사가 아니거나 선수를 못 찾으면
 * 조용히 아무것도 안 한다 — 발행 경로를 절대 막지 않는다 (실패 무해).
 */
/**
 * 비이적 기사(인터뷰·경기 반응 등) → 팀 시즌 위키 연대기에 사료로 연결.
 * 제목에 시즌 사가의 팀 별칭이 등장하면 연결 — LLM 없이 텍스트 매칭 (제목은
 * 한국어라 팀명이 그대로 박혀 있다). 첫 매칭 팀 하나만 (post_id 가 PK).
 */
export async function linkArticleToSeasonWiki(
  supabase: ServiceClient,
  article: { postId: string; title: string }
): Promise<string | null> {
  const { data: seasons } = await supabase
    .from("sagas")
    .select("id, slug, subject")
    .eq("saga_type", "season")
    .eq("status", "active")
  for (const s of seasons ?? []) {
    const aliases = ((s.subject as { aliases?: string[] })?.aliases ?? []).filter(Boolean)
    if (aliases.some((a) => article.title.includes(a))) {
      await supabase
        .from("saga_article_links")
        .upsert({ post_id: article.postId, saga_id: s.id }, { onConflict: "post_id" })
      return s.slug as string
    }
  }
  return null
}

export async function linkArticleToSaga(
  supabase: ServiceClient,
  article: { postId: string; title: string; sourceUrl: string | null; occurredAt?: string }
): Promise<{ sagaSlug: string; folded: boolean } | null> {
  try {
    const [ex] = await extractTransferBatch([{ title: article.title }])
    if (!ex?.is_transfer || !ex.player) {
      // 이적 기사가 아니면 시즌 위키 연대기 연결 시도 (인터뷰·경기 반응 사료)
      await linkArticleToSeasonWiki(supabase, article)
      return null
    }

    const { data: aliasRows } = await supabase
      .from("news_alias_dictionary")
      .select("romanized, preferred_ko, surfaces")
      .eq("category", "player")
    const canon = canonicalizePlayer(ex.player, buildAliasIndex((aliasRows ?? []) as AliasRow[]))
    const player = canon.matched ? canon.key : ex.player
    const playerKr = canon.ko ?? ex.player_kr

    const tier = classifyTier({
      category: null,
      original_title: article.title,
      headline_kr: article.title,
      link_url: article.sourceUrl,
      source_id: null,
    })
    const origin = resolveOrigin({
      original_title: article.title,
      author: null,
      link_url: article.sourceUrl,
      external_url: null,
    })

    const result = await upsertSagaEntry(supabase, {
      player,
      playerKr,
      direction: ex.direction,
      stageSignal: ex.stage_signal,
      headline: article.title,
      tier,
      origin: {
        reporter: origin.reporter,
        outlet: origin.outlet,
        url: origin.url ?? `/post/${article.postId}`,
      },
      occurredAt: article.occurredAt ?? new Date().toISOString(),
    })

    // 기사↔사가 연결 원장 — 떡밥 카드가 이 매핑으로 /saga/[slug] 로 직행하고,
    // entry_id 로 타임라인의 해당 엔트리 자리에 기사 본문을 펼친다
    await supabase
      .from("saga_article_links")
      .upsert(
        { post_id: article.postId, saga_id: result.sagaId, entry_id: result.entryId },
        { onConflict: "post_id" }
      )

    return { sagaSlug: result.sagaSlug, folded: result.folded }
  } catch (e) {
    console.error("사가 연동 실패 (발행은 정상):", e)
    return null
  }
}

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

  const src = row.source ?? {}
  const origin = resolveOrigin({
    original_title: row.title,
    author: (src.author as string) ?? null,
    link_url: (src.link_url as string) ?? row.source_url,
    external_url: (src.external_url as string) ?? null,
  })

  const result = await upsertSagaEntry(supabase, {
    player,
    playerKr,
    direction,
    stageSignal,
    headline,
    tier: ex.tier ?? "rumor",
    origin: {
      reporter: origin.reporter,
      outlet: origin.outlet,
      url: origin.url ?? row.source_url,
    },
    occurredAt: row.occurred_at,
  })

  const day = new Date(new Date(row.occurred_at).getTime() + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)
  await supabase
    .from("saga_reservoir")
    .update({
      status: "published",
      saga_hint: identityKey("transfer", {
        player_key: normalizePlayerKey(player),
        direction,
        window_key: SAGA_WINDOW_KEY,
      }),
      cluster_key: `${normalizePlayerKey(player)}:${stageSignal ?? "news"}:${day}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  return { sagaSlug: result.sagaSlug, sagaTitle: result.sagaTitle, folded: result.folded }
}
