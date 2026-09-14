import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/** No positive cache: an old session must not reactivate a deleted profile. */
export async function accountGuard(
  auth: () => Promise<{ userId: string | null }>,
  req: NextRequest
) {
  if (req.nextUrl.pathname === "/account-deleted") return null
  try {
    const { userId } = await auth()
    if (!userId) return null
    if (req.method === "DELETE" && req.nextUrl.pathname === "/api/profile/me") return null
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error("account-check-config")
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db
      .from("profiles")
      .select("deleted_at")
      .eq("user_id", userId)
      .single()
    if (error && error.code !== "PGRST116") throw new Error("account-check-unavailable")
    if (!data?.deleted_at) return null
    if (req.nextUrl.pathname.startsWith("/api/"))
      return NextResponse.json(
        { error: "탈퇴한 계정입니다." },
        { status: 410, headers: { "Cache-Control": "no-store" } }
      )
    return NextResponse.redirect(new URL("/account-deleted", req.url))
  } catch {
    return NextResponse.json(
      { error: "계정 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}
