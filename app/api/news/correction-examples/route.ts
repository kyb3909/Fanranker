import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * GET/POST /api/news/correction-examples  (CRON_SECRET)
 *
 * 뉴스 스캐너 few-shot 학습용 — 검수자가 발행 시 제목을 고친 사례(원본 raw.title ≠
 * 발행본 draft.title)를 최근순으로 반환한다. 스캐너가 이걸 프롬프트에 주입해
 * "이렇게 다듬어진다"를 학습 → 다음 생성부터 같은 표기/스타일을 따르게 한다.
 *
 * 고칠수록 예시가 쌓여 원본 품질이 올라가는 자기개선 루프.
 */
interface ReservoirRow {
  raw: { title?: string } | null
  draft: { title?: string } | null
}

async function handler(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("news_reservoir")
    .select("raw, draft, updated_at")
    .eq("status", "published")
    .filter("source->>type", "eq", "hermes")
    .order("updated_at", { ascending: false })
    .limit(80)

  const examples = ((data as ReservoirRow[]) ?? [])
    .map((r) => ({ from: r.raw?.title?.trim() ?? "", to: r.draft?.title?.trim() ?? "" }))
    .filter((e) => e.from && e.to && e.from !== e.to)
    .slice(0, 12)

  return NextResponse.json({ examples })
}

export const GET = handler
export const POST = handler
