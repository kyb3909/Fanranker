import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized, checkRateLimit } from "@/lib/api-error"

/** Retired unused endpoint. Prediction submission owns atomic spending and retry keys. */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited
    if (!(await currentUser())) return apiUnauthorized()
    return NextResponse.json(
      { error: "이 토큰 사용 경로는 종료되었습니다. 승부예측 화면에서 제출해주세요." },
      { status: 410, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}
