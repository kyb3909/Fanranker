import { NextRequest, NextResponse } from "next/server"
import { parseLimit } from "@/lib/api/parse-limit"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseLimit(searchParams, { def: 30, max: 100 })
    const search = searchParams.get("search") || ""
    const role = searchParams.get("role") || ""
    const offset = (page - 1) * limit

    let query = supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url, role, is_expert, is_artist, created_at, updated_at", {
        count: "exact",
      })

    if (search) query = query.ilike("nickname", `%${search}%`)
    if (role) query = query.eq("role", role)

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ users: data ?? [], total: count ?? 0, page, limit })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
