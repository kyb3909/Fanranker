/**
 * 사가 W1 검증용 시드 — 오늘 티커에 실재하는 이적 뉴스 2건으로 첫 사가를 만든다.
 * (지어낸 떡밥이 아니라 실제 보도 기반 — 프로덕션 DB 에 남아도 되는 진짜 첫 콘텐츠)
 *
 * 실행: pnpm exec tsx scripts/saga-seed-sample.ts
 * 멱등: identity_key·cluster_key upsert 라 재실행해도 중복 없음.
 *
 * lib/saga/create.ts(server-only)는 tsx CLI 에서 못 쓴다 — 순수 모듈(identity)만 쓰고
 * insert 는 직접 한다 (스크립트 관례: scripts/backfill-unsettled-results.ts).
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { identityKey, baseSlug } from "../lib/saga/identity"

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE env 누락")
  return createClient(url, key, { auth: { persistSession: false } })
}

const SAGA_BOT = "user_saga_bot"

interface SeedSaga {
  title: string
  subject: Record<string, unknown>
  summary: string
  entry: {
    clusterKey: string
    headline: string
    summary: string
    tier: "official" | "tier1" | "rumor"
    stageAfter: string
    outlet: string
    url: string
    occurredAt: string
  }
  close?: { outcome: string }
}

const SEEDS: SeedSaga[] = [
  {
    title: "오시멘(IN) — 토트넘",
    subject: {
      player_key: "victor osimhen",
      player_name_kr: "빅터 오시멘",
      direction: "in",
      club_slug: "tottenham",
    },
    summary: "토트넘이 갈라타사라이의 빅터 오시멘 영입을 추진 중입니다. 첫 제안은 거절당했습니다.",
    entry: {
      clusterKey: "goal:osimhen-bid-rejected:2026-08-03",
      headline: "갈라타사라이, 토트넘의 6,000만 유로 제안 거절",
      summary:
        "Goal.com에 따르면 갈라타사라이가 토트넘의 빅터 오시멘 영입 제안(6,000만 유로)을 거절했습니다.",
      tier: "rumor",
      stageAfter: "bid",
      outlet: "Goal.com",
      url: "https://www.goal.com/",
      occurredAt: "2026-08-03T09:00:00+09:00",
    },
  },
  {
    title: "콜로 무아니(IN) — 유벤투스",
    subject: {
      player_key: "randal kolo muani",
      player_name_kr: "랑달 콜로 무아니",
      direction: "in",
      club_slug: "juventus",
    },
    summary: "유벤투스가 PSG의 랑달 콜로 무아니 완전 영입을 공식 발표했습니다.",
    entry: {
      clusterKey: "psg:kolo-muani-official:2026-08-02",
      headline: "유벤투스, 콜로 무아니 완전 영입 공식 발표",
      summary: "PSG 구단 발표로 랑달 콜로 무아니의 유벤투스 완전 이적이 확정됐습니다.",
      tier: "official",
      stageAfter: "done",
      outlet: "PSG 공식",
      url: "https://en.psg.fr/",
      occurredAt: "2026-08-02T17:00:00+09:00",
    },
    close: { outcome: "done" },
  },
]

async function main() {
  const supabase = createServiceClient()
  const windowKey = "2026-summer"

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", "saga")
    .single()
  if (!category) throw new Error("saga 카테고리 없음 — 마이그 20260804 확인")

  for (const seed of SEEDS) {
    const subject = { ...seed.subject, window_key: windowKey }
    const key = identityKey("transfer", subject)

    let { data: saga } = await supabase
      .from("sagas")
      .select("id, slug, stage")
      .eq("identity_key", key)
      .maybeSingle()

    if (!saga) {
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .insert({
          user_id: SAGA_BOT,
          category_id: category.id,
          community_slug: "saga",
          title: seed.title,
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
      if (postErr || !post) throw new Error(`앵커 실패: ${postErr?.message}`)

      const { data: created, error } = await supabase
        .from("sagas")
        .insert({
          saga_type: "transfer",
          slug: baseSlug("transfer", subject),
          title: seed.title,
          identity_key: key,
          subject: seed.subject,
          window_key: windowKey,
          summary: seed.summary,
          anchor_post_id: post.id,
        })
        .select("id, slug, stage")
        .single()
      if (error || !created) throw new Error(`사가 실패: ${error?.message}`)
      saga = created
      console.log(`생성: /saga/${saga.slug}`)
    } else {
      console.log(`존재: /saga/${saga.slug}`)
    }

    const e = seed.entry
    await supabase.from("saga_entries").upsert(
      {
        saga_id: saga.id,
        cluster_key: e.clusterKey,
        headline: e.headline,
        summary: e.summary,
        tier: e.tier,
        stage_after: e.stageAfter,
        origin: { reporter: null, outlet: e.outlet, url: e.url, published_at: e.occurredAt },
        echoes: [],
        occurred_at: e.occurredAt,
      },
      { onConflict: "saga_id,cluster_key" }
    )

    const { count } = await supabase
      .from("saga_entries")
      .select("id", { count: "exact", head: true })
      .eq("saga_id", saga.id)

    await supabase
      .from("sagas")
      .update({
        stage: e.stageAfter,
        entry_count: count ?? 0,
        last_event_at: e.occurredAt,
        ...(e.stageAfter === "done" ? { is_confirmed: true } : {}),
        ...(seed.close
          ? { status: "closed", outcome: seed.close.outcome, closed_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", saga.id)
    console.log(`  엔트리 upsert (${e.stageAfter})${seed.close ? " + 종결" : ""}`)
  }

  console.log("\n확인: http://localhost:3002/saga")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
