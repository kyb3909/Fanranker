import { currentUser } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const submitAnswerSchema = z.object({
  quiz_id: z.string().min(1, "퀴즈 ID가 필요합니다."),
  selected_answer: z.number({ required_error: "답변이 필요합니다." }),
  time_taken_ms: z.number().optional(),
})

// GET: Fetch quiz questions (random set)
export async function GET(req: NextRequest) {
  try {
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(req.url)
    const category = searchParams.get("category")
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 20)

    let query = supabase
      .from("movie_quizzes")
      .select(
        "id, category, difficulty, question, image_url, choices, movie_title, movie_year, points"
      )
      .eq("is_active", true)

    if (category && category !== "all") {
      query = query.eq("category", category)
    }

    const { data: quizzes, error } = await query.limit(limit)

    if (error) {
      return NextResponse.json({ error: "퀴즈를 불러올 수 없습니다." }, { status: 500 })
    }

    // Shuffle
    const shuffled = quizzes.sort(() => Math.random() - 0.5)

    // Check which ones user already answered
    const user = await currentUser()
    let answeredIds: string[] = []
    if (user) {
      const { data: results } = await supabase
        .from("movie_quiz_results")
        .select("quiz_id")
        .eq("user_id", user.id)

      answeredIds = (results || []).map((r: { quiz_id: string }) => r.quiz_id)
    }

    const quizzesWithStatus = shuffled.map((q: Record<string, unknown>) => ({
      ...q,
      already_answered: answeredIds.includes(q.id as string),
    }))

    return NextResponse.json({ quizzes: quizzesWithStatus })
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 })
  }
}

// POST: Submit answer
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const body = await req.json()
    const parsed = submitAnswerSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "퀴즈 ID와 답변이 필요합니다.")
    }
    const { quiz_id, selected_answer, time_taken_ms } = parsed.data

    // Check if already answered
    const { data: existing } = await supabase
      .from("movie_quiz_results")
      .select("id")
      .eq("user_id", user.id)
      .eq("quiz_id", quiz_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: "이미 답변한 퀴즈입니다." }, { status: 409 })
    }

    // Get quiz and check answer
    const { data: quiz, error: quizError } = await supabase
      .from("movie_quizzes")
      .select("correct_answer, points, explanation, movie_title")
      .eq("id", quiz_id)
      .single()

    if (quizError || !quiz) {
      return NextResponse.json({ error: "퀴즈를 찾을 수 없습니다." }, { status: 404 })
    }

    const isCorrect = quiz.correct_answer === selected_answer
    const pointsEarned = isCorrect ? quiz.points : 0

    // Save result
    const { error: insertError } = await supabase.from("movie_quiz_results").insert({
      user_id: user.id,
      quiz_id,
      selected_answer,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      time_taken_ms: time_taken_ms || null,
    })

    if (insertError) {
      return NextResponse.json({ error: "결과 저장에 실패했습니다." }, { status: 500 })
    }

    return NextResponse.json({
      is_correct: isCorrect,
      correct_answer: quiz.correct_answer,
      points_earned: pointsEarned,
      explanation: quiz.explanation,
      movie_title: quiz.movie_title,
    })
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 })
  }
}
