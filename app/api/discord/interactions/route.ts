import { NextRequest, NextResponse } from "next/server"
import { verifyDiscordSignature } from "@/lib/discord/verify-interaction"

/**
 * POST /api/discord/interactions — 디스코드 버튼 인터랙션 수신 엔드포인트.
 *
 * #공지의 역할 선택 버튼(role:{roleId})을 누르면 여기로 서명된 POST 가 온다.
 * 해당 역할을 토글(있으면 제거, 없으면 부여)하고 본인에게만 보이는(ephemeral) 확인 응답.
 * 설계: docs/DISCORD_NEWSBOT_DESIGN.md (온보딩 대체 — 전체 잠금 서버라 네이티브 온보딩 불가)
 *
 * 필요 env: DISCORD_APP_PUBLIC_KEY(서명검증), DISCORD_BOT_TOKEN(역할 부여).
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const GUILD_ID = "1528110979425239231"

// 부여 가능한 역할 화이트리스트 (공개 ID — 임의 역할 부여 차단)
const ROLE_LABELS: Record<string, string> = {
  "1528407977785036941": "아스날",
  "1528407979399970937": "리버풀",
  "1528407981438537758": "첼시",
  "1528407983598473226": "축구팬",
  "1528407985657872556": "데일리알림",
}

// 디스코드 인터랙션/응답 타입
const PING = 1
const MESSAGE_COMPONENT = 3
const PONG = 1
const CHANNEL_MESSAGE = 4
const EPHEMERAL = 64

interface Interaction {
  type: number
  data?: { custom_id?: string }
  member?: { user?: { id?: string }; roles?: string[] }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const valid = verifyDiscordSignature({
    rawBody,
    signature: req.headers.get("x-signature-ed25519"),
    timestamp: req.headers.get("x-signature-timestamp"),
    hexPublicKey: process.env.DISCORD_APP_PUBLIC_KEY ?? "",
  })
  if (!valid) {
    return new NextResponse("invalid request signature", { status: 401 })
  }

  let body: Interaction
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new NextResponse("bad json", { status: 400 })
  }

  // 디스코드 엔드포인트 검증 핑
  if (body.type === PING) {
    return NextResponse.json({ type: PONG })
  }

  if (body.type === MESSAGE_COMPONENT) {
    const reply = (content: string) =>
      NextResponse.json({ type: CHANNEL_MESSAGE, data: { content, flags: EPHEMERAL } })

    const customId = body.data?.custom_id ?? ""
    const roleId = customId.startsWith("role:") ? customId.slice(5) : ""
    const label = ROLE_LABELS[roleId]
    const userId = body.member?.user?.id
    if (!label || !userId) {
      return reply("알 수 없는 요청이에요.")
    }

    const token = process.env.DISCORD_BOT_TOKEN
    if (!token) {
      return reply("설정이 아직 완료되지 않았어요. 잠시 후 다시 시도해 주세요.")
    }

    const hasRole = (body.member?.roles ?? []).includes(roleId)
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`,
      { method: hasRole ? "DELETE" : "PUT", headers: { Authorization: `Bot ${token}` } }
    )
    if (!res.ok) {
      return reply("처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.")
    }
    const isDaily = roleId === "1528407985657872556"
    if (hasRole) {
      return reply(`🔕 '${label}' 알림을 껐어요.`)
    }
    return reply(
      isDaily
        ? "🔔 매일 알림을 켰어요! 매일 밤 오늘의 경기와 볼 충전 소식을 보내드려요."
        : `🔔 '${label}' 소식 알림을 켰어요!`
    )
  }

  return NextResponse.json({
    type: CHANNEL_MESSAGE,
    data: { content: "지원하지 않는 요청이에요.", flags: EPHEMERAL },
  })
}
