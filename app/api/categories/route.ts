import { NextResponse } from "next/server"
import { createServerAnonClient } from "@/lib/supabase"
import { apiError } from "@/lib/api-error"

export async function GET() {
  const supabase = createServerAnonClient()

  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, icon, sort_order, description, parent_slug")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })

  if (error) {
    return apiError("카테고리를 불러오지 못했습니다.", 500, error)
  }

  const res = NextResponse.json({ categories: data })
  // 어드민에서 채널 추가/토글 시 1분 내 반영되어야 하므로 짧게.
  // 어드민 boards 라우트(PATCH/POST)에서 revalidatePath 호출로 즉시 무효화도 병행.
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
  return res
}
