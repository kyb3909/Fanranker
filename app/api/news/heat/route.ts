import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { z } from "zod"

export const dynamic = "force-dynamic"

/**
 * POST /api/news/heat — 레딧 화력 실측치 수신 (VPS 스캐너 → 15분 주기)
 *
 * 왜: 홈 히어로(Top Story)를 "레딧에서 실제로 불타오른 것" 순으로 세우기 위해.
 * 스캐너는 글이 갓 올라왔을 때 수집하므로 수집 시점 점수는 낮다 — 화력은
 * 나중에 오르는 값이라 주기적 재측정이 필요하고, 레딧 API 는 Vercel(해외 DC IP)
 * 에서 차단되므로 VPS 가 재고 이 엔드포인트로 밀어넣는다.
 *
 * 인증: CRON_SECRET Bearer (agent-draft 와 동일).
 * 저장: news_reservoir.raw.heat = { score, comments, at } (dedupe_key 매칭).
 */
const BodySchema = z.object({
  items: z
    .array(
      z.object({
        dedupe_key: z.string().min(1).max(120), // 예: "reddit:1v9y587"
        score: z.number().int().min(0),
        comments: z.number().int().min(0),
      })
    )
    .min(1)
    .max(200),
})

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "items 형식이 잘못됐습니다." }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()
  let updated = 0

  // 최근 발행분만 대상 — 히어로 후보 범위(48h)와 정합. 오래된 글 화력은 안 쓴다.
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString()

  for (const item of parsed.data.items) {
    // raw 병합은 read-modify-write — 대상이 회당 최대 수십 건이라 충분하다.
    const { data: rows } = await supabase
      .from("news_reservoir")
      .select("id, raw")
      .eq("status", "published")
      .gte("created_at", cutoff)
      .filter("raw->>dedupe_key", "eq", item.dedupe_key)
      .limit(1)
    const row = rows?.[0]
    if (!row) continue

    const raw = (row.raw ?? {}) as Record<string, unknown>
    const { error } = await supabase
      .from("news_reservoir")
      .update({
        raw: { ...raw, heat: { score: item.score, comments: item.comments, at: now } },
      })
      .eq("id", row.id)
    if (!error) updated++
  }

  return NextResponse.json({ ok: true, updated })
}
