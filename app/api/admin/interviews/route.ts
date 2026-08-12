import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { appendEntry } from "@/lib/saga/create"

export const dynamic = "force-dynamic"

/**
 * /api/admin/interviews — 인터뷰 카드 검수 (발췌 조직 최종 단계, HITL)
 *
 * GET  : ready 카드 목록 (검수 대기)
 * POST : { id, action: "approve" | "reject", headline_ko?, quotes_ko?: string[] }
 *        approve → 팀 시즌 사가 연대기에 엔트리로 발행 (cluster_key = interview:{id} 멱등)
 *        reject  → status=rejected (기록 보존)
 *
 * 자동 발행은 없다 — 검증(원문 대조·표기)은 기계가 했지만 게재는 사람이 결정한다.
 */

export async function GET() {
  const auth = await requireAdminApi()
  if (isErrorResponse(auth)) return auth

  const { data: cards, error } = await auth.supabase
    .from("interview_cards")
    .select(
      "id, team_id, subreddit, source_url, source_title, speaker, quotes, headline_ko, hold_reason, occurred_at, created_at"
    )
    .eq("status", "ready")
    .order("occurred_at", { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 관측용 카운트 (파이프라인이 살아 있는지 한눈에)
  const { data: statusRows } = await auth.supabase.from("interview_cards").select("status")
  const counts: Record<string, number> = {}
  for (const r of statusRows ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1

  return NextResponse.json({ cards: cards ?? [], counts })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi()
  if (isErrorResponse(auth)) return auth
  const supabase = auth.supabase

  const body = (await req.json().catch(() => null)) as {
    id?: string
    action?: string
    headline_ko?: string
    quotes_ko?: string[]
  } | null
  if (!body?.id || !["approve", "reject"].includes(body.action ?? "")) {
    return NextResponse.json(
      { error: "id 와 action(approve|reject)이 필요합니다." },
      { status: 400 }
    )
  }

  const { data: card } = await supabase
    .from("interview_cards")
    .select("*")
    .eq("id", body.id)
    .eq("status", "ready")
    .maybeSingle()
  if (!card) {
    return NextResponse.json({ error: "ready 상태의 카드를 찾을 수 없습니다." }, { status: 404 })
  }

  if (body.action === "reject") {
    await supabase
      .from("interview_cards")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", card.id)
    return NextResponse.json({ ok: true, status: "rejected" })
  }

  // ── approve — 팀 시즌 사가로 발행 ──
  const { data: saga } = await supabase
    .from("sagas")
    .select("id, stage, slug, title")
    .eq("saga_type", "season")
    .eq("status", "active")
    .filter("subject->>team_id", "eq", card.team_id)
    .maybeSingle()
  if (!saga) {
    return NextResponse.json(
      { error: `팀 "${card.team_id}" 의 활성 시즌 사가가 없습니다.` },
      { status: 409 }
    )
  }

  // 검수자 수정 반영 (수정 없으면 카드 값 그대로)
  const headline = (body.headline_ko ?? card.headline_ko ?? "").trim()
  const storedQuotes = (card.quotes ?? []) as { en: string; ko: string }[]
  const quotesKo =
    body.quotes_ko && body.quotes_ko.length === storedQuotes.length
      ? body.quotes_ko
      : storedQuotes.map((q) => q.ko)
  if (!headline || quotesKo.length === 0) {
    return NextResponse.json({ error: "헤드라인과 발언이 필요합니다." }, { status: 400 })
  }

  const speaker = (card.speaker as string | null)?.trim() || null
  const summary = quotesKo
    .map((q) => `“${q.trim().replace(/^["“]|["”]$/g, "")}”${speaker ? ` — ${speaker}` : ""}`)
    .join("\n\n")
  const outlet = card.source_url
    ? new URL(card.source_url).hostname.replace(/^www\./, "")
    : "reddit"

  const entry = await appendEntry(supabase, saga.id as string, "season", saga.stage as string, {
    clusterKey: `interview:${card.id}`,
    headline: `[인터뷰] ${headline}`,
    summary,
    tier: "tier1",
    stageAfter: null,
    origin: { outlet, url: card.source_url ?? "", reporter: speaker },
    occurredAt: card.occurred_at as string,
  })

  await supabase
    .from("interview_cards")
    .update({
      status: "published",
      headline_ko: headline,
      saga_id: saga.id,
      entry_id: entry?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", card.id)

  return NextResponse.json({ ok: true, status: "published", saga_slug: saga.slug })
}
