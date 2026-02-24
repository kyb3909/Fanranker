import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient, createAnonClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const createPackageSchema = z.object({
  name: z.string().min(1, "이름은 필수입니다."),
  type: z.string().min(1, "유형은 필수입니다."),
  description: z.string().optional(),
  features: z.array(z.string()).optional(),
  price_gold: z.number().int().positive("가격은 0보다 커야 합니다."),
  delivery_days: z.number().int().positive("작업일은 0보다 커야 합니다."),
  max_revisions: z.number().int().nonnegative().optional(),
  example_images: z.array(z.string()).optional(),
  max_slots: z.number().int().positive().optional(),
})

// GET /api/commissions/packages?artist_id=X&type=Y
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const artistId = searchParams.get("artist_id")
    const type = searchParams.get("type")

    const supabase = createAnonClient()
    let query = supabase
      .from("commission_packages")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })

    if (artistId) query = query.eq("artist_id", artistId)
    if (type) query = query.eq("type", type)

    const { data, error } = await query

    if (error) {
      return apiError("패키지 조회 실패", 500, error)
    }

    return NextResponse.json({ packages: data })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

// POST /api/commissions/packages
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const supabase = createServiceRoleClient()

    // Check if user is artist
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_artist")
      .eq("user_id", user.id)
      .single()

    if (!profile?.is_artist) {
      return NextResponse.json({ error: "작가만 패키지를 생성할 수 있습니다." }, { status: 403 })
    }

    const rawBody = await request.json()
    const parsed = createPackageSchema.safeParse(rawBody)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const {
      name,
      type,
      description,
      features,
      price_gold,
      delivery_days,
      max_revisions,
      example_images,
      max_slots,
    } = parsed.data

    const { data, error } = await supabase
      .from("commission_packages")
      .insert({
        artist_id: user.id,
        name,
        type,
        description: description || "",
        features: features || [],
        price_gold,
        delivery_days,
        max_revisions: max_revisions ?? 2,
        example_images: example_images || [],
        max_slots: max_slots ?? 3,
      })
      .select()
      .single()

    if (error) {
      return apiError("패키지 생성 실패", 500, error)
    }

    return NextResponse.json({ package: data }, { status: 201 })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
