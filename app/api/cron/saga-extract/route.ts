import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import {
  extractTransferBatch,
  buildTeamEvidenceIndex,
  type ExtractedTransfer,
} from "@/lib/saga/extract"
import { classifyTier } from "@/lib/saga/tier"
import { identityKey, normalizePlayerKey, transferClusterKey } from "@/lib/saga/identity"
import {
  buildAliasIndex,
  canonicalizePlayer,
  isGroundedInSource,
  recoverPlayerFromSource,
  type AliasRow,
} from "@/lib/saga/canonical"
import { SAGA_WINDOW_KEY } from "@/lib/saga/config"
import { publishReservoirItem } from "@/lib/saga/publish"
import { reconcileSagaNames } from "@/lib/saga/reconcile"
import { syncSquadNamesToNews } from "@/lib/dictionary/sync-news"
import { isWomensFootball } from "@/lib/news/quality-gate"
import { judgeClubConsistency } from "@/lib/saga/consistency"
import { notifyDiscordOps } from "@/lib/discord-notify"

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
/** 잠긴 unknown_player 재평가 상한 (run 당) — LLM 없이 사전 대조만이라 저렴 */
const RETRY_LIMIT = 15

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

    // ── 스쿼드 사전(정본) → 뉴스 사전 자동 동기화 (2026-08-30 운영자: 무승인 확정) ──
    // 스쿼드에서 이미 검수된 이름(name_kr)이 뉴스 사전에 없어서 사가가 못 보던 구멍
    // (실측: 커티스 존스 6건·엔조 페르난데스 5건이 미등재 보류). 없는 것만 넣는
    // 멱등 동기화라 매 회차 돌려도 안전하고, **사전 로드 전에** 돌아야 같은 회차의
    // 재평가 루프가 방금 확정된 선수의 보류 기사를 바로 살린다.
    // 실패는 본 작업을 막지 않는다 — 다음 회차가 다시 시도한다.
    const dictSync = await syncSquadNamesToNews(supabase, { apply: true }).catch((e) => {
      console.error("[saga-extract] 스쿼드→뉴스 사전 동기화 실패", e)
      return null
    })

    const { data: aliasRows } = await supabase
      .from("news_alias_dictionary")
      .select("romanized, preferred_ko, surfaces")
      .eq("category", "player")
    const aliasIndex = buildAliasIndex((aliasRows ?? []) as AliasRow[])

    // ── 클럽 증거 대조용 팀 표기 색인 ──
    // 두 사전을 합친다: team_dictionary 는 팀 수(310)를, 뉴스 표기 사전 team 항목은
    // 약칭(psg·lfc·ol·om)을 준다 — 실측상 둘 다 있어야 한다(한쪽만 쓰면 42, 둘 다 29).
    // ⚠️ category='team' 만 읽는다. 사가가 표기 모듈에서 빠져 있는 이유는 인물(선수/감독)
    //    오염이고, 여기서 쓰는 건 치환이 아니라 **원제목 증거 대조**라 그 축에 안 걸린다.
    // 실패해도 본 작업을 막지 않는다 — 색인이 없으면 종전 하드코딩 별칭으로 동작한다.
    const [teamDictResult, teamAliasResult] = await Promise.all([
      supabase.from("team_dictionary").select("name_en, name_kr, short_kr, aliases_kr"),
      supabase
        .from("news_alias_dictionary")
        .select("romanized, preferred_ko, surfaces")
        .eq("category", "team"),
    ])
    if (teamDictResult.error)
      console.error("[saga-extract] 팀 사전 로드 실패", teamDictResult.error)
    if (teamAliasResult.error)
      console.error("[saga-extract] 팀 표기 로드 실패", teamAliasResult.error)
    const teamIndex = buildTeamEvidenceIndex([
      ...(teamDictResult.data ?? []).map((t) => [
        t.name_en,
        t.name_kr,
        t.short_kr,
        ...(t.aliases_kr ?? []),
      ]),
      ...(teamAliasResult.data ?? []).map((t) => [
        t.romanized,
        t.preferred_ko,
        ...(t.surfaces ?? []),
      ]),
    ])

    let queued = 0
    let autoPublished = 0
    let discarded = 0
    let failed = 0
    let autoHeld = 0

    const pendingRows = pending ?? []
    for (let i = 0; i < pendingRows.length; i += BATCH) {
      const chunk = pendingRows.slice(i, i + BATCH)
      const results = await extractTransferBatch(
        chunk.map((r) => ({ title: r.title, headlineKr: r.headline_kr })),
        { teamIndex }
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

        // ⚠️ 아래 근거 검증이 문자열을 전제한다 — 여기서 좁혀둔다
        const rawPlayer = ex.player ?? ""
        const canon = canonicalizePlayer(rawPlayer, aliasIndex)
        if (canon.matched) {
          ex.player = canon.key
          if (canon.ko) ex.player_kr = canon.ko
        } else if (!isGroundedInSource(rawPlayer, row.title)) {
          /**
           * ⚠️ **사전에도 없고 원문에도 없는 이름은 신원이 될 수 없다** (2026-08-25 실사고).
           *
           * "Tottenham sign Savinho from Man City" 에서 추출기가 `fabinho` 를 냈고,
           * 그 문자열이 그대로 기본키가 돼 같은 이적이 두 사가로 갈렸다.
           * 프롬프트로는 확률을 낮출 뿐 못 막는다 — 여기서 결정적으로 잘라낸다.
           */
          const recovered = recoverPlayerFromSource(row.title, aliasIndex)
          if (recovered) {
            console.warn(
              `[saga-extract] 지어낸 선수명 복구: "${rawPlayer}" → "${recovered.key}" (원문: ${row.title})`
            )
            ex.player = recovered.key
            ex.player_kr = recovered.ko ?? ex.player_kr
          } else {
            // 복구도 못 하면 **사가를 만들지 않는다.** 근거 없는 신원으로 문서를 여는
            // 것보다 재료를 남겨두는 편이 낫다 (unknown_player 재평가가 나중에 집는다).
            console.warn(
              `[saga-extract] 근거 없는 선수명 — 보류: "${rawPlayer}" (원문: ${row.title})`
            )
            await supabase
              .from("saga_reservoir")
              .update({ status: "unknown_player", updated_at: new Date().toISOString() })
              .eq("id", row.id)
            autoHeld++
            continue
          }
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
        const clusterKey = transferClusterKey(ex.player, ex.stage_signal, row.occurred_at)

        const headlineKo = ex.headline_ko ?? row.headline_kr

        // ── 시계열 클럽 일관성 (환각 방지 L3 — 디오망데 실사고 2026-08-07) ──
        // 오피셜/완료 신호인데 최근 7일 같은 선수 언급들의 지배 클럽과 전혀 다르면
        // 자동 발행을 막고 검수로 (자동 수정 금지 — 진짜 하이재킹일 수 있다) + 운영 알림.
        let clubConflict: { dominant: string | null } | null = null
        if ((tier === "official" || ex.stage_signal === "done") && ex.clubs.length > 0) {
          const { data: priorRows } = await supabase
            .from("saga_reservoir")
            .select("extracted")
            .neq("id", row.id)
            .gte("occurred_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
            .filter("extracted->>player", "not.is", null)
            .limit(400)
          const playerKey = normalizePlayerKey(ex.player)
          const priorClubs = ((priorRows ?? []) as { extracted: Record<string, unknown> | null }[])
            .map((p) => p.extracted)
            .filter(
              (e): e is Record<string, unknown> =>
                !!e &&
                typeof e.player === "string" &&
                normalizePlayerKey(e.player as string) === playerKey &&
                Array.isArray(e.clubs)
            )
            .map((e) => e.clubs as string[])
          const verdict = judgeClubConsistency(ex.clubs, priorClubs)
          if (verdict.conflict) {
            clubConflict = { dominant: verdict.dominant }
            notifyDiscordOps({
              title: `오피셜 클럽 모순 의심 — ${ex.player_kr ?? ex.player}`,
              description: `이번 표기 [${ex.clubs.join(", ")}] vs 최근 7일 지배 클럽 "${verdict.dominant}". 자동 발행 보류 — 검수 필요.\n${row.title.slice(0, 140)}`,
              level: "warn",
              url: "/admin2/saga",
            }).catch(() => {})
          }
        }

        const autoHoldReasons = [
          ...(!canon.matched ? ["unknown_player"] : []),
          ...((ex.confidence ?? 0) < AUTO_PUBLISH_MIN_CONFIDENCE ? ["low_confidence"] : []),
          ...(!headlineKo ? ["no_korean_headline"] : []),
          ...(isWomensFootball(row.title, row.headline_kr, row.source_url)
            ? ["womens_football"]
            : []),
          ...(clubConflict ? ["club_conflict"] : []),
        ]

        const { error: queueError } = await supabase
          .from("saga_reservoir")
          .update({
            status: "queued",
            extracted: { ...ex, tier, ...(clubConflict ? { club_conflict: clubConflict } : {}) },
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

    // ── 잠긴 unknown_player 자가 재평가 (2026-08-07, 디오망데 사가 실사고) ──
    // 사전에 선수가 등재되는 순간, auto_hold:unknown_player 로 큐에 잠긴 행이 다음
    // 회차에 스스로 살아난다 (뉴스 브레이킹 레인 P0-2 와 같은 원리). extracted 가
    // 영속돼 있어 LLM 재호출 없이 사전 대조만 다시 한다. unknown_player 외의 보류
    // 사유(club_conflict 등)가 함께 남은 행은 사전 등재로 풀 수 없으므로 건드리지
    // 않고, 여전히 미등재인 행도 무기록으로 지나간다 (다음 회차 재시도).
    let retried = 0
    let revived = 0
    {
      const { data: held } = await supabase
        .from("saga_reservoir")
        .select("id, source_url, source, title, headline_kr, occurred_at, extracted, error")
        .eq("status", "queued")
        .like("error", "auto_hold:%unknown_player%")
        .order("occurred_at", { ascending: true })
        .limit(RETRY_LIMIT)

      for (const row of held ?? []) {
        const ex = (row.extracted ?? null) as ExtractedTransfer | null
        if (!ex?.player) continue
        retried++

        const canon = canonicalizePlayer(ex.player, aliasIndex)
        if (!canon.matched) continue

        const holdReasons = String(row.error ?? "")
          .replace(/^auto_hold:/, "")
          .split(",")
          .filter(Boolean)
        if (holdReasons.some((r) => r !== "unknown_player")) continue

        // 추출 시점과 같은 자동 발행 조건 재검사 (사전 매칭 외)
        if ((ex.confidence ?? 0) < AUTO_PUBLISH_MIN_CONFIDENCE) continue
        if (!(ex.headline_ko ?? row.headline_kr)) continue
        if (isWomensFootball(row.title, row.headline_kr, row.source_url)) continue

        try {
          await publishReservoirItem(
            supabase,
            {
              id: row.id,
              source_url: row.source_url,
              source: (row.source ?? null) as Record<string, unknown> | null,
              title: row.title,
              headline_kr: row.headline_kr,
              extracted: ex,
              occurred_at: row.occurred_at,
            },
            { player: canon.key, ...(canon.ko ? { player_kr: canon.ko } : {}) }
          )
          revived++
        } catch (e) {
          failed++
          const message = e instanceof Error ? e.message : String(e)
          await supabase
            .from("saga_reservoir")
            .update({
              error: `auto_publish_failed:${message}`.slice(0, 500),
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
          console.error("[saga-extract] 재평가 발행 실패", row.id, message)
        }
      }
    }

    // ── 동성이인 보호에 걸린 행 자가 재평가 (2026-08-30 각포 실사고) ──
    // 성씨-only 보도("gakpo")가 클럽 맥락 부재로 막혔던 행도, canonicalizePlayer 의
    // 성씨 승격(사전에 그 성의 풀네임이 유일하면 풀네임으로)이 키를 풀네임으로
    // 바꿔주면 다음 회차에 스스로 살아난다. 승격이 안 되는 행(진짜 동성이인)은
    // 키가 그대로라 재시도해도 같은 에러 — 무한 재시도 방지로 승격된 행만 재시도.
    {
      const { data: held } = await supabase
        .from("saga_reservoir")
        .select("id, source_url, source, title, headline_kr, occurred_at, extracted")
        .eq("status", "queued")
        .like("error", "auto_publish_failed:동성이인%")
        .order("occurred_at", { ascending: true })
        .limit(RETRY_LIMIT)

      for (const row of held ?? []) {
        const ex = (row.extracted ?? null) as ExtractedTransfer | null
        if (!ex?.player) continue
        const canon = canonicalizePlayer(ex.player, aliasIndex)
        // 승격으로 키가 실제로 바뀐 행만 — 안 바뀌었으면 결과도 같다
        if (!canon.matched || canon.key === normalizePlayerKey(ex.player)) continue
        retried++
        try {
          await publishReservoirItem(
            supabase,
            {
              id: row.id,
              source_url: row.source_url,
              source: (row.source ?? null) as Record<string, unknown> | null,
              title: row.title,
              headline_kr: row.headline_kr,
              extracted: ex,
              occurred_at: row.occurred_at,
            },
            { player: canon.key, ...(canon.ko ? { player_kr: canon.ko } : {}) }
          )
          revived++
        } catch (e) {
          console.error("[saga-extract] 동성이인 재평가 실패", row.id, e)
        }
      }
    }

    // ── 표기 동기화 — 사전(정본)을 사가 제목·헤드라인에 반영 (2026-08-30 운영자) ──
    // 실패해도 추출·발행 결과는 그대로 반환한다 — 본 작업을 막지 않는다.
    const reconcile = await reconcileSagaNames(supabase).catch((e) => {
      console.error("[saga-extract] 표기 동기화 실패", e)
      return null
    })

    return NextResponse.json({
      ok: true,
      processed: pendingRows.length,
      queued,
      autoPublished,
      autoHeld,
      discarded,
      failed,
      retried,
      revived,
      reconcile,
      dictSync: dictSync
        ? { inserted: dictSync.inserted, conflicts: dictSync.conflicts.length }
        : null,
    })
  }
}

export const GET = withCronLog("saga-extract", cronGet)
