import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { identityKey, baseSlug, isSamePlayerKey, normalizePlayerKey } from "./identity"
import { confirmationPatch, gatedStageSignal, nextStage, type SagaType } from "./stages"

/**
 * 사가 생성·성장의 서버 전용 진입점 (Phase A W1).
 *
 * 생성 = 앵커 posts 행(숨김 'saga' 보드, 작성자 user_saga_bot) → sagas 행.
 * 앵커가 필수인 이유: comments.post_id NOT NULL + 트리거 3종(댓글수·프로필 카운트·
 * flair 점수)이 post 전제라, 앵커를 만들면 댓글·알림·팬점수가 전부 공짜다 (P0 오딧).
 *
 * append = saga_entries upsert(cluster_key 멱등) + last_event_at 범프 + stage 전이.
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export const SAGA_BOT_USER_ID = "user_saga_bot"
const SAGA_BOARD_SLUG = "saga"

export interface CreateSagaInput {
  type: SagaType
  title: string
  subject: Record<string, unknown>
  windowKey: string
  summary?: string
}

export interface AppendEntryInput {
  clusterKey: string
  headline: string
  summary?: string
  tier: "official" | "tier1" | "rumor"
  stageAfter?: string | null
  origin: { reporter?: string | null; outlet: string; url: string; published_at?: string | null }
  echoes?: { outlet: string; url: string; title: string }[]
  occurredAt?: string
}

/** identity_key 로 조회, 없으면 앵커 포스트와 함께 생성 (멱등) */
export async function getOrCreateSaga(supabase: ServiceClient, input: CreateSagaInput) {
  const key = identityKey(input.type, { ...input.subject, window_key: input.windowKey })

  const { data: existing } = await supabase
    .from("sagas")
    .select("*")
    .eq("identity_key", key)
    .maybeSingle()
  if (existing) return { saga: existing, created: false as const }

  // 동일인 가드 (2026-08-04 운영자: "조던 헨더슨과 헨더슨이 다른 사가면 안 돼",
  // "기존에 저 선수 사가가 있으면 거기로 가야 해" — 포럼의 선수당 스레드 1개 원칙) —
  // 같은 윈도우의 열린 사가 중 성이 같고 이름이 부분집합인 선수가 있으면 새로 만들지
  // 않고 그 문서에 쌓는다. **방향(in/out)이 달라도 같은 선수면 같은 문서다**
  // (래시퍼드 out/in 분열 실사고 — 나간다는 소식과 어디로 간다는 소식은 한 드라마).
  if (input.type === "transfer") {
    const newPlayerKey = normalizePlayerKey(String(input.subject.player_key ?? ""))
    // 빈 선수 키가 "-in-2026s" 유령 사가를 만든 실사고 (2026-08-04) — 생성 자체를 거부
    if (!newPlayerKey) throw new Error("saga create rejected: empty player key")
    const { data: candidates } = await supabase
      .from("sagas")
      .select("*")
      .eq("saga_type", "transfer")
      .eq("window_key", input.windowKey)
      .eq("status", "active")
    const same = (candidates ?? []).filter((c) => {
      const subj = c.subject as { player_key?: string }
      return isSamePlayerKey(normalizePlayerKey(String(subj.player_key ?? "")), newPlayerKey)
    })
    if (same.length === 1) return { saga: same[0], created: false as const }
    if (same.length > 1) {
      // 후보끼리도 전부 동일인이면(과거 방향 분열 잔재) 최근 활동 문서로 —
      // 동일인이 아닌 후보가 섞였으면(동성이인, 예: Jordan/Dean Henderson) 병합 포기
      const keys = same.map((c) =>
        normalizePlayerKey(String((c.subject as { player_key?: string }).player_key ?? ""))
      )
      const allSame = keys.every((k) => isSamePlayerKey(k, keys[0]))
      if (allSame) {
        const pick = [...same].sort(
          (a, b) => new Date(b.last_event_at).getTime() - new Date(a.last_event_at).getTime()
        )[0]
        return { saga: pick, created: false as const }
      }
    }
  }

  // 앵커 보드의 category_id 조회 (마이그 20260804 가 시드)
  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", SAGA_BOARD_SLUG)
    .single()
  if (!category) throw new Error("saga 카테고리가 없습니다 — 마이그레이션 20260804 확인")

  // 앵커 포스트 — 본문은 안내 한 줄 (실 내용은 /saga/[slug] 가 렌더).
  // /post/[id] 접근 시 사가로 redirect 하므로 사용자가 이 본문을 볼 일은 없다.
  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({
      user_id: SAGA_BOT_USER_ID,
      category_id: category.id,
      community_slug: SAGA_BOARD_SLUG,
      title: input.title,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "이 글은 사가 문서의 토론 앵커입니다." }],
          },
        ],
      },
    })
    .select("id")
    .single()
  if (postErr || !post) throw new Error(`앵커 포스트 생성 실패: ${postErr?.message}`)

  // slug 충돌 시 suffix — identity 는 unique 라 실제 충돌은 동명이인 정도
  const slug = baseSlug(input.type, { ...input.subject, window_key: input.windowKey })
  let finalSlug = slug
  for (let i = 2; i <= 5; i++) {
    const { data: taken } = await supabase
      .from("sagas")
      .select("id")
      .eq("slug", finalSlug)
      .maybeSingle()
    if (!taken) break
    finalSlug = `${slug}-${i}`
  }

  const { data: saga, error } = await supabase
    .from("sagas")
    .insert({
      saga_type: input.type,
      slug: finalSlug,
      title: input.title,
      identity_key: key,
      subject: input.subject,
      window_key: input.windowKey,
      summary: input.summary ?? null,
      anchor_post_id: post.id,
    })
    .select("*")
    .single()
  if (error || !saga) throw new Error(`사가 생성 실패: ${error?.message}`)
  return { saga, created: true as const }
}

/** 연표에 엔트리 추가 (cluster_key 멱등) + 범프 + stage 전이 */
export async function appendEntry(
  supabase: ServiceClient,
  sagaId: string,
  sagaType: SagaType,
  currentStage: string,
  input: AppendEntryInput
) {
  const occurredAt = input.occurredAt ?? new Date().toISOString()

  const { data: entry, error } = await supabase
    .from("saga_entries")
    .upsert(
      {
        saga_id: sagaId,
        cluster_key: input.clusterKey,
        headline: input.headline,
        summary: input.summary ?? null,
        tier: input.tier,
        stage_after: input.stageAfter ?? null,
        origin: input.origin,
        echoes: input.echoes ?? [],
        occurred_at: occurredAt,
      },
      { onConflict: "saga_id,cluster_key", ignoreDuplicates: false }
    )
    .select("id")
    .single()
  if (error) throw new Error(`엔트리 추가 실패: ${error.message}`)

  // 오피셜 단계 게이트: official 티어가 아닌 완료 주장은 단계를 못 움직인다.
  // 엔트리의 stage_after 에는 원 신호가 남는다 — "이 보도가 완료라고 주장했다"는 기록.
  const effectiveSignal = gatedStageSignal(input.stageAfter ?? null, input.tier)
  const stage = nextStage(sagaType, currentStage, effectiveSignal)
  const { count } = await supabase
    .from("saga_entries")
    .select("id", { count: "exact", head: true })
    .eq("saga_id", sagaId)

  const { error: sagaUpdateError } = await supabase
    .from("sagas")
    .update({
      stage,
      entry_count: count ?? 0,
      last_event_at: occurredAt,
      updated_at: new Date().toISOString(),
      // D7 노출 전이 — 오피셜 완료에서만 열리고, 후퇴 신호에 다시 잠긴다 (stages.ts 규칙).
      // 게이트 통과 신호 기준: 루머의 done 주장은 null 로 강등돼 노출 상태도 못 건드린다.
      ...confirmationPatch(effectiveSignal, input.tier),
    })
    .eq("id", sagaId)
  if (sagaUpdateError) throw new Error(`사가 상태 갱신 실패: ${sagaUpdateError.message}`)

  return entry
}
