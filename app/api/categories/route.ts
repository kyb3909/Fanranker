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
  res.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400")
  return res
}
