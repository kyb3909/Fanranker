import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { verifyCronSecret } from "@/lib/cron-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { notifyDiscordOps } from "@/lib/discord-notify"

export const dynamic = "force-dynamic"

/**
 * POST /api/news/agent-draft
 *
 * Hermes(뉴스 에이전트) 전용 — r/soccer 이적설 등을 "초안"으로 적재한다.
 * **절대 자동 발행하지 않음.** status='drafted' 로 news_reservoir 에만 넣고,
 * 관리자가 /admin/news-review 에서 검수 후 발행한다 (fail-closed).
 *
 * 인증: CRON_SECRET Bearer 필수.
 * 멱등: dedupe_key 기준 (같은 루머 재호출 시 중복 생성 안 함).
 */
const BodySchema = z.object({
  title: z.string().min(1).max(300),
  /** TipTap doc JSON (Hermes 가 플레이북 형식대로 생성: 요약 문단 + 트윗/영상 embed 노드 + 출처 링크) */
  content: z.unknown(),
  /** 원문 소스 URL (트윗/기사) */
  source_url: z.string().url().optional(),
  /** 원문 재료 텍스트 (기사 발췌/트윗 전문) — 검수자가 원문과 비교하며 고칠 수 있게 보존 */
  source_text: z.string().max(4000).optional(),
  /** 발견 출처 (r/soccer 글 등) */
  origin_url: z.string().url().optional(),
  tags: z.array(z.string()).max(20).optional(),
  /** {credibility, importance} 등 — Hermes 판단 점수 */
  scores: z.record(z.unknown()).optional(),
  /** 중복 방지 키 (예: "soccer:<reddit_post_id>") */
  dedupe_key: z.string().min(1).max(200),
  /** VS 쟁점 제안 (스캐너 2단 판정) — 검수 화면에서 확인 후 발행 시 폴 생성 */
  vs: z
    .object({
      question: z.string().min(1).max(80),
      option_a: z.string().min(1).max(24),
      option_b: z.string().min(1).max(24),
      summary: z.array(z.string().max(80)).length(3),
      confidence: z.number().min(0).max(1),
    })
    .optional(),
})

function slugId(dedupeKey: string): string {
  return (
    "hermes-" +
    dedupeKey
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 120)
  )
}

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문" }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "필드 검증 실패", detail: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const d = parsed.data

  // 본문 sanitize — 허용 노드/마크/임베드만 통과 (저장형 XSS 차단)
  const content = sanitizeTipTapJSON(d.content)
  if (!content) {
    return NextResponse.json(
      { error: "본문(content)이 유효한 TipTap doc 이 아님" },
      { status: 400 }
    )
  }

  const supabase = createServiceRoleClient()
  const id = slugId(d.dedupe_key)
  const now = new Date().toISOString()

  // 멱등: 같은 id(=dedupe) 가 이미 있으면 건너뜀
  const { data: existing } = await supabase
    .from("news_reservoir")
    .select("id, status")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string }>()
  if (existing) {
    return NextResponse.json({ ok: true, id, status: existing.status, deduped: true })
  }

  const { error } = await supabase.from("news_reservoir").insert({
    id,
    source: { type: "hermes", origin_url: d.origin_url ?? null, source_url: d.source_url ?? null },
    urls: { source: d.source_url ?? null, origin: d.origin_url ?? null },
    raw: {
      title: d.title,
      dedupe_key: d.dedupe_key,
      ...(d.source_text ? { source_text: d.source_text } : {}),
    },
    scores: d.scores ?? {},
    dedupe_key: d.dedupe_key,
    status: "drafted",
    draft: { title: d.title, content, tags: d.tags ?? [], ...(d.vs ? { vs: d.vs } : {}) },
    audit: { created_by: "hermes-agent", created_at: now },
  })
  if (error) {
    return NextResponse.json({ error: "적재 실패", detail: error.message }, { status: 500 })
  }

  // 운영 알림 — 새 검수 대기 기사 (디스코드 웹훅 미설정 시 no-op)
  await notifyDiscordOps({
    level: "info",
    title: "🆕 새 검수 기사 대기",
    description: d.title,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://gongnori.fan"}/admin/news-review`,
    fields: d.source_url ? [{ name: "원문", value: d.source_url }] : undefined,
  })

  return NextResponse.json({ ok: true, id, status: "drafted" }, { status: 201 })
}
