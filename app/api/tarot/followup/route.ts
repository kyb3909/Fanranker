import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { apiBadRequest, apiError, checkRateLimit } from "@/lib/api-error"
import { chatParams } from "@/lib/llm/openai-params"
import { logUsageFailure, logUsageTokens, readUsage, type LlmUsage } from "@/lib/llm/usage-log"
import { CRISIS_MESSAGE, CRISIS_RESOURCES, GAMBLING_MESSAGE, checkSafety } from "@/lib/tarot/safety"
import { SYSTEM_PROMPT } from "@/lib/tarot/prompt"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/tarot/followup — 리딩 후속 질문 (NDJSON 스트림).
 *
 * 리딩이 결과 화면에서 끝나면 대화가 아니라 조회다. 원본 서비스는 카드를 다 뒤집은 뒤
 * 루나에게 계속 물어볼 수 있고, 그게 "아기자기함"의 큰 축이었다.
 *
 * ## 카드를 클라이언트에서 받는 이유 (리딩 라우트와 다른 판단)
 * 리딩에서 카드를 클라가 정하면 **점괘를 조작**할 수 있어서 금지다. 후속은 이미 나온
 * 판을 **놓고 이야기하는** 단계라 조작할 결과 자체가 없다. 세션 저장소를 두지 않는 대신
 * 맥락을 클라가 들고 오게 하되, 길이를 조이고 안전 가드를 다시 통과시킨다.
 * (자유 LLM 채팅으로 유용되지 않게 STRICT 레이트리밋 + 시스템 프롬프트로 주제를 묶는다)
 */

const BodySchema = z.object({
  question: z.string().trim().min(1).max(200),
  reading: z.string().trim().min(1).max(6000),
  cards: z
    .array(
      z.object({
        positionName: z.string().max(40),
        nameKo: z.string().max(40),
        reversed: z.boolean(),
      })
    )
    .min(1)
    .max(10),
  followup: z.string().trim().min(2, "질문을 조금만 더 적어주세요.").max(200),
  /** 직전 문답 — 맥락 유지용, 짧게만 */
  history: z
    .array(z.object({ role: z.enum(["user", "luna"]), text: z.string().max(1500) }))
    .max(6)
    .optional(),
})

export async function POST(request: NextRequest) {
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
  const { question, reading, cards, followup, history } = parsed.data

  const encoder = new TextEncoder()
  const line = (o: unknown) => encoder.encode(JSON.stringify(o) + "\n")

  // 후속 질문도 같은 가드를 통과시킨다 — 첫 질문만 막으면 우회로가 열린다
  const verdict = checkSafety(followup)
  if (verdict === "crisis" || verdict === "gambling") {
    const payload =
      verdict === "crisis"
        ? { type: "blocked", message: CRISIS_MESSAGE, resources: CRISIS_RESOURCES }
        : { type: "blocked", message: GAMBLING_MESSAGE }
    return new NextResponse(JSON.stringify(payload) + "\n", {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return apiError("해석 기능이 잠시 쉬는 중이에요.", 503)

  const board = cards
    .map((c) => `- ${c.positionName}: ${c.nameKo}${c.reversed ? " (역방향)" : ""}`)
    .join("\n")

  const context = [
    `[이미 끝난 리딩]`,
    `처음 질문: ${question}`,
    `뽑힌 카드:`,
    board,
    ``,
    `네가 했던 해석:`,
    reading.slice(0, 6000),
    ``,
    `[지금]`,
    `상담자가 이어서 묻는다. **카드를 새로 뽑지 마라** — 위 판을 그대로 놓고 답한다.`,
    `표정 태그는 붙이지 말고 본문만 쓴다. 2~4문단으로 짧게.`,
    `### 머리말(한 줄·카드별·루나의 한마디)은 쓰지 마라 — 리딩이 아니라 대화다.`,
    `말투 규칙은 그대로 지킨다: 헤지 남발 금지, 부정 대조 금지, 어려운 한자어 금지.`,
  ].join("\n")

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: context },
  ]
  for (const h of history ?? []) {
    messages.push({ role: h.role === "user" ? "user" : "assistant", content: h.text })
  }
  messages.push({ role: "user", content: followup })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            ...chatParams("gpt-5.6-luna", { temperature: 0.85, max_tokens: 700 }),
            stream: true,
            // ⚠️ stream 응답은 본문에 usage 가 없다 — include_usage 를 켜야 **마지막
            //    청크**로 따로 온다. 그 청크는 choices 가 비어 있어서 아래 델타 파싱이
            //    자연히 건너뛴다(기존 동작 그대로).
            stream_options: { include_usage: true },
            messages,
          }),
          signal: AbortSignal.timeout(55000),
        })
        if (!res.ok || !res.body) {
          logUsageFailure("tarot-followup", "gpt-5.6-luna", `http_${res.status}`)
          controller.enqueue(line({ type: "error", message: "루나가 대답을 고르다 멈췄어요." }))
          controller.close()
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ""
        let usage: LlmUsage | null = null
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const chunks = buf.split("\n")
          buf = chunks.pop() ?? ""
          for (const c of chunks) {
            const t = c.trim()
            if (!t.startsWith("data:")) continue
            const payload = t.slice(5).trim()
            if (payload === "[DONE]") continue
            try {
              const j = JSON.parse(payload) as {
                choices?: { delta?: { content?: string } }[]
                usage?: unknown
              }
              if (j.usage) usage = readUsage(j)
              const d = j.choices?.[0]?.delta?.content
              if (d) controller.enqueue(line({ type: "delta", t: d }))
            } catch {
              continue
            }
          }
        }
        if (usage) logUsageTokens("tarot-followup", "gpt-5.6-luna", usage)
        controller.enqueue(line({ type: "done" }))
      } catch (e) {
        console.error("[tarot] followup failed", e)
        controller.enqueue(line({ type: "error", message: "대답이 중간에 끊겼어요." }))
      }
      controller.close()
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
