import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { apiBadRequest, apiError, checkRateLimit } from "@/lib/api-error"
import { chatParams } from "@/lib/llm/openai-params"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { CARD_MEANINGS } from "@/lib/tarot/cards"
import { drawCards } from "@/lib/tarot/draw"
import { findFixtureLine } from "@/lib/tarot/fixture"
import { getSpread, isSpreadId } from "@/lib/tarot/spreads"
import { buildUserPrompt, splitExpressionTag, SYSTEM_PROMPT } from "@/lib/tarot/prompt"
import { CRISIS_MESSAGE, CRISIS_RESOURCES, GAMBLING_MESSAGE, checkSafety } from "@/lib/tarot/safety"
import {
  DEFAULT_EXPRESSION,
  inferExpression,
  parseExpression,
  type Expression,
} from "@/lib/tarot/expression"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/tarot/reading — 축구 타로 리딩 (비로그인 가능).
 *
 * ## 설계 (타로 서비스 D:/Projects/tarot 의 규약을 따름)
 * - **카드는 서버가 뽑는다.** 클라이언트가 보낸 카드 값은 받지 않는다 — 받는 순간
 *   유저가 원하는 결과를 만들 수 있고 "점"이 아니라 장난감이 된다.
 * - 카드 의미는 코드(cards.ts)에서 프롬프트로 주입 — 모델의 의미 창작 차단.
 * - 안전 가드는 서버 사전 필터 + 프롬프트 규칙 **이중 방어**.
 *
 * ## 이 사이트에만 있는 제약
 * 도박 유도 질문("토토 뭐 찍어?")은 카드로 답하지 않는다. 무료 포인트 예측 서비스가
 * 사행성 조언을 하는 화면이 되면 카카오 심사 소명(약관 제6조의2)과 정면으로 부딪힌다.
 * 오락 목적 고지는 화면(app/tarot)에 상시 노출한다.
 */

const BodySchema = z.object({
  question: z.string().trim().min(2, "질문을 조금만 더 적어주세요.").max(200),
  spreadId: z.string().refine(isSpreadId, "알 수 없는 스프레드입니다."),
})

/** 응답 카드 — 클라이언트 표시용 (의미는 해석에 이미 녹아 있으므로 최소만) */
interface ReadingCard {
  position: number
  positionName: string
  arcana: number
  nameKo: string
  name: string
  reversed: boolean
  image: string
}

export async function POST(request: NextRequest) {
  try {
    // 리딩 1회가 LLM 호출 1회다 — 표준(60/분)보다 빡빡하게
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message ?? "잘못된 입력입니다.")
    }
    const { question, spreadId } = parsed.data

    // ── 안전 가드 (카드를 뽑기 전에) ──
    const verdict = checkSafety(question)
    if (verdict === "crisis") {
      return NextResponse.json({
        blocked: "crisis",
        message: CRISIS_MESSAGE,
        resources: CRISIS_RESOURCES,
        expression: "worried" satisfies Expression,
      })
    }
    if (verdict === "gambling") {
      return NextResponse.json({
        blocked: "gambling",
        message: GAMBLING_MESSAGE,
        expression: "tilt" satisfies Expression,
      })
    }

    // ── 무대 배경 (내부 경기 일정 — 전력 정보 없음, 실패해도 리딩은 성립) ──
    let fixtureLine: string | undefined
    try {
      fixtureLine =
        (await findFixtureLine(createServiceRoleClient(), question, new Date())) ?? undefined
    } catch {
      // fail-open: 배경 없이 진행
    }

    // ── 카드 추출 (서버 확정) ──
    const spread = getSpread(spreadId)
    const drawn = drawCards(spreadId)
    const cards: ReadingCard[] = drawn.map((c) => {
      const m = CARD_MEANINGS.find((x) => x.arcana === c.arcanaNumber)!
      return {
        position: c.position,
        positionName: spread.positions[c.position]?.name ?? "",
        arcana: c.arcanaNumber,
        nameKo: m.nameKo,
        name: m.name,
        reversed: c.reversed,
        image: `/tarot/cards/${c.arcanaNumber}.webp`,
      }
    })

    // ── 해석 (LLM) ──
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return apiError("해석 기능이 잠시 쉬는 중이에요.", 503)

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        // chatParams 필수 — 모델 세대별 파라미터 차이를 여기서 흡수한다(lib/llm/openai-params)
        ...chatParams("gpt-4o", { temperature: 0.85, max_tokens: 1400 }),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt({ question, spreadId, cards: drawn, fixtureLine }),
          },
        ],
      }),
      signal: AbortSignal.timeout(50000),
    })
    if (!res.ok) {
      console.error("[tarot] LLM HTTP", res.status, (await res.text()).slice(0, 200))
      return apiError("카드는 뽑혔는데 루나가 말을 고르다 멈췄어요. 다시 시도해주세요.", 502)
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) {
      return apiError("해석을 받지 못했어요. 다시 시도해주세요.", 502)
    }

    // 표정: 모델 태그 우선, 없으면 판 구성으로 코드가 결정 (형식을 어겨도 항상 정해진다)
    const [tag, body] = splitExpressionTag(content)
    const expression = parseExpression(tag) ?? inferExpression(drawn) ?? DEFAULT_EXPRESSION

    return NextResponse.json({
      question,
      spread: { id: spread.id, name: spread.name },
      cards,
      reading: body,
      expression,
    })
  } catch (e) {
    return apiError("리딩에 실패했어요. 잠시 후 다시 시도해주세요.", 500, e)
  }
}
