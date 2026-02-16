import { currentUser } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

// GET: List castings
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(req.url)
    const sort = searchParams.get("sort") || "latest"
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)

    let query = supabase
      .from("virtual_castings")
      .select("*")
      .eq("is_active", true)

    if (sort === "popular") {
      query = query.order("vote_count", { ascending: false })
    } else {
      query = query.order("created_at", { ascending: false })
    }

    const { data: castings, error } = await query.limit(limit)

    if (error) {
      return NextResponse.json({ error: "캐스팅 목록을 불러올 수 없습니다." }, { status: 500 })
    }

    // Fetch top suggestions for each casting
    const castingIds = (castings || []).map((c: { id: string }) => c.id)

    let suggestions: Record<string, unknown>[] = []
    if (castingIds.length > 0) {
      const { data } = await supabase
        .from("virtual_casting_suggestions")
        .select("*")
        .in("casting_id", castingIds)
        .order("vote_count", { ascending: false })

      suggestions = data || []
    }

    // Group suggestions by casting
    const suggestionsMap: Record<string, Record<string, unknown>[]> = {}
    for (const s of suggestions) {
      const cid = s.casting_id as string
      if (!suggestionsMap[cid]) suggestionsMap[cid] = []
      suggestionsMap[cid].push(s)
    }

    const castingsWithSuggestions = (castings || []).map((c: Record<string, unknown>) => ({
      ...c,
      suggestions: (suggestionsMap[c.id as string] || []).slice(0, 5),
    }))

    return NextResponse.json({ castings: castingsWithSuggestions })
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 })
  }
}

// POST: Create a new casting
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const body = await req.json()
    const { movie_title, role_name, role_description, original_actor, image_url } = body

    if (!movie_title?.trim() || !role_name?.trim()) {
      return NextResponse.json({ error: "영화 제목과 배역 이름이 필요합니다." }, { status: 400 })
    }

    const { data: casting, error } = await supabase
      .from("virtual_castings")
      .insert({
        created_by: user.id,
        movie_title: movie_title.trim(),
        role_name: role_name.trim(),
        role_description: role_description?.trim() || null,
        original_actor: original_actor?.trim() || null,
        image_url: image_url?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "캐스팅 등록에 실패했습니다." }, { status: 500 })
    }

    return NextResponse.json({ casting }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 })
  }
}
