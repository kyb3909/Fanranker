import { NextRequest, NextResponse } from "next/server"
import { requireStaffApi } from "@/lib/admin/roles"
import {
  importLiveArticle,
  listLiveArticles,
  LiveArticleSchema,
} from "@/lib/news/desk/live-articles"

export const dynamic = "force-dynamic"
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
export async function GET(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  try {
    return json({
      items: await listLiveArticles(
        auth.supabase,
        (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200)
      ),
      limit: 80,
    })
  } catch {
    return json({ error: "현재 기사 목록을 불러오지 못했습니다." }, 503)
  }
}
export async function POST(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const body = LiveArticleSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) return json({ error: "데스킹할 기사를 선택해 주세요." }, 400)
  try {
    return json(await importLiveArticle(auth.supabase, body.data, auth.userId))
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "기사를 불러오지 못했습니다." },
      503
    )
  }
}
