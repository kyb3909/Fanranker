/**
 * 운영 알림 — 디스코드 웹훅으로 직원 채널에 푸시.
 *
 * 한 방향 알림(신고/검수/정산/크롤링 이슈)용. 봇 없이 웹훅 URL 로만 동작.
 * DISCORD_OPS_WEBHOOK_URL 미설정 시 조용히 no-op (개발/미구성 환경 안전).
 * fire-and-forget 성격이지만, 서버리스에서 응답 후 freeze 방지를 위해 await 하고
 * 실패는 삼킨다(알림 실패가 본 작업을 깨면 안 됨).
 */

type Level = "info" | "warn" | "alert" | "success"

const COLORS: Record<Level, number> = {
  info: 0x5865f2, // 블러플 (일반 정보)
  warn: 0xfaa61a, // 주황 (주의)
  alert: 0xed4245, // 빨강 (긴급)
  success: 0x57f287, // 초록 (정상/완료)
}

interface DiscordOpsNotice {
  title: string
  description?: string
  level?: Level
  /** 클릭 시 이동할 관리자 링크 (예: /admin/news-review) */
  url?: string
  fields?: { name: string; value: string; inline?: boolean }[]
  /** @everyone / <@&roleId> 등 멘션 (긴급 알림에만 권장) */
  mention?: string
}

export async function notifyDiscordOps(notice: DiscordOpsNotice): Promise<void> {
  const webhook = process.env.DISCORD_OPS_WEBHOOK_URL
  if (!webhook) return

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        content: notice.mention || undefined,
        embeds: [
          {
            title: notice.title.slice(0, 240),
            description: notice.description?.slice(0, 1800),
            url: notice.url,
            color: COLORS[notice.level ?? "info"],
            fields: notice.fields?.slice(0, 10).map((f) => ({
              name: f.name.slice(0, 240),
              value: (f.value || "-").slice(0, 1000),
              inline: f.inline ?? false,
            })),
            timestamp: new Date().toISOString(),
            footer: { text: "gongnori.fan 운영" },
          },
        ],
      }),
    })
  } catch (e) {
    console.error("Discord 운영 알림 실패:", e)
  }
}
