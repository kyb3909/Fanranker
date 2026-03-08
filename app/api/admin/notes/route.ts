import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { data, error } = await supabase
      .from("admin_notes")
      .select("*")
      .order("updated_at", { ascending: false })

    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ notes: data ?? [] })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { title, content } = await request.json()

    const { data, error } = await supabase
      .from("admin_notes")
      .insert({ title: title || "새 메모", content: content || "" })
      .select("*")
      .single()

    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ note: data }, { status: 201 })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { id, title, content } = await request.json()
    if (!id) return apiError("id 필요", 400)

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (title !== undefined) updateData.title = title
    if (content !== undefined) updateData.content = content

    const { error } = await supabase.from("admin_notes").update(updateData).eq("id", id)
    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { id } = await request.json()
    if (!id) return apiError("id 필요", 400)

    const { error } = await supabase.from("admin_notes").delete().eq("id", id)
    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
