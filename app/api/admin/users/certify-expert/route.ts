import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"

const CertifyExpertSchema = z.object({
  user_id: z.string().min(1),
  revoke: z.boolean().optional().default(false),
})

/**
 * POST /api/admin/users/certify-expert
 *
 * Manually certify a user as an expert (admin only)
 *
 * Body:
 * - user_id: string (required) - User ID to certify
 * - revoke?: boolean - If true, revoke expert status instead of granting
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()

    if (!user) {
      return apiUnauthorized()
    }

    const userId = user.id

    // Check admin permission
    const supabaseCheck = createServiceRoleClient()
    const { data: adminProfile } = await supabaseCheck
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .single()

    if (adminProfile?.role !== "admin") {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
    }

    const supabase = createServiceRoleClient()
    const body = await request.json()
    const parsed = CertifyExpertSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("user_id가 필요합니다.")
    const { user_id, revoke } = parsed.data

    // Check if user exists
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, is_expert")
      .eq("user_id", user_id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 })
    }

    // Update expert status
    const updateData: {
      is_expert: boolean
      expert_certified_at?: string | null
      updated_at: string
    } = {
      is_expert: !revoke,
      updated_at: new Date().toISOString(),
    }

    if (!revoke && !profile.is_expert) {
      // Grant expert status - set certification time
      updateData.expert_certified_at = new Date().toISOString()
    } else if (revoke) {
      // Revoke expert status - clear certification time
      updateData.expert_certified_at = null
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("user_id", user_id)
      .select()
      .single()

    if (updateError) {
      return apiError("전문가 인증 상태 업데이트 중 오류가 발생했습니다.", 500, updateError)
    }

    // Audit log
    const supabaseAudit = createServiceRoleClient()
    await supabaseAudit.from("admin_audit_logs").insert({
      admin_user_id: userId,
      action: revoke ? "revoke_expert" : "certify_expert",
      target_type: "user",
      target_id: user_id,
      details: { revoke: !!revoke },
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    })

    return NextResponse.json({
      success: true,
      message: revoke ? "전문가 인증이 해제되었습니다." : "전문가 인증이 완료되었습니다.",
      profile: updatedProfile,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
