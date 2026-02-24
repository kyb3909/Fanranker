import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const updatePackageSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  description: z.string().optional(),
  features: z.array(z.string()).optional(),
  price_gold: z.number().int().positive("가격은 0보다 커야 합니다.").optional(),
  delivery_days: z.number().int().positive("작업일은 0보다 커야 합니다.").optional(),
  max_revisions: z.number().int().nonnegative().optional(),
  example_images: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  max_slots: z.number().int().positive().optional(),
  sort_order: z.number().int().nonnegative().optional(),
})

// PATCH /api/commissions/packages/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id } = await params
    const supabase = createServiceRoleClient()

    // Verify ownership
    const { data: pkg } = await supabase
      .from("commission_packages")
      .select("artist_id")
      .eq("id", id)
      .single()

    if (!pkg) return NextResponse.json({ error: "패키지를 찾을 수 없습니다." }, { status: 404 })
    if (pkg.artist_id !== user.id)
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })

    const rawBody = await request.json()
    const parsed = updatePackageSchema.safeParse(rawBody)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) updates[key] = value
    }

    if (Object.keys(updates).length === 0) {
      return apiBadRequest("수정할 항목이 없습니다.")
    }

    const { data, error } = await supabase
      .from("commission_packages")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return apiError("패키지 수정 실패", 500, error)
    }

    return NextResponse.json({ package: data })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
