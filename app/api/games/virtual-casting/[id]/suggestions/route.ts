import { currentUser } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

// POST: Add actor suggestion to a casting
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const { id: castingId } = await params
    const supabase = createServiceRoleClient()
    const body = await req.json()
    const { actor_name, reason } = body

    if (!actor_name?.trim()) {
      return NextResponse.json({ error: "배우 이름이 필요합니다." }, { status: 400 })
    }

    // Verify casting exists
    const { data: casting } = await supabase
      .from("virtual_castings")
      .select("id")
      .eq("id", castingId)
      .eq("is_active", true)
      .single()

    if (!casting) {
      return NextResponse.json({ error: "캐스팅을 찾을 수 없습니다." }, { status: 404 })
    }

    // Insert suggestion
    const { data: suggestion, error } = await supabase
      .from("virtual_casting_suggestions")
      .insert({
        casting_id: castingId,
        user_id: user.id,
        actor_name: actor_name.trim(),
        reason: reason?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "이미 같은 배우를 추천했습니다." }, { status: 409 })
      }
      return NextResponse.json({ error: "추천 등록에 실패했습니다." }, { status: 500 })
    }

    // Increment suggestion count
    const { error: rpcError } = await supabase.rpc("increment_field", {
      table_name: "virtual_castings",
      field_name: "suggestion_count",
      row_id: castingId,
    })

    if (rpcError) {
      // Fallback: manual increment
      await supabase
        .from("virtual_castings")
        .update({ suggestion_count: (casting as unknown as { suggestion_count: number }).suggestion_count + 1 })
        .eq("id", castingId)
    }

    return NextResponse.json({ suggestion }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 })
  }
}
