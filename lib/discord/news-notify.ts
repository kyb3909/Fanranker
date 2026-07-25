/**
 * 뉴스봇 디스코드 서버 발송 — 유저 대상 (운영 알림 lib/discord-notify.ts 와 채널·env 분리).
 *
 * 채널별 웹훅 env 미설정 시 조용히 no-op — 디스코드 서버 개설 전에도 코드가 먼저 배포 가능.
 * fire-and-forget: 발송 실패가 본 작업(뉴스 발행/크론)을 깨면 안 되므로 에러는 삼킨다.
 * 설계: docs/DISCORD_NEWSBOT_DESIGN.md
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://gongnori.fan"

/** 팀 채널 3개(이벤트 3팀) + 종합 + 떡밥(페르소나 커뮤글 — 여돌/유머). */
export type NewsChannelKey = "arsenal" | "liverpool" | "chelsea" | "football" | "snack"

const CHANNEL_WEBHOOK_ENV: Record<NewsChannelKey, string> = {
  arsenal: "DISCORD_NEWS_WEBHOOK_ARSENAL",
  liverpool: "DISCORD_NEWS_WEBHOOK_LIVERPOOL",
  chelsea: "DISCORD_NEWS_WEBHOOK_CHELSEA",
  football: "DISCORD_NEWS_WEBHOOK_FOOTBALL",
  snack: "DISCORD_NEWS_WEBHOOK_SNACK",
}

/**
 * 팀 키워드 — 뉴스 제목/entities → 채널 라우팅과 경기 매칭(F14)에 공용.
 * 소문자 비교. 문제 소스/오라우팅 발견 시 여기서 즉시 조정.
 */
export const TEAM_KEYWORDS: Record<Exclude<NewsChannelKey, "football" | "snack">, string[]> = {
  arsenal: ["아스날", "아스널", "arsenal", "gunners", "구너"],
  liverpool: ["리버풀", "liverpool", "lfc", "콥"],
  chelsea: ["첼시", "chelsea", "cfc"],
}

/** 티커 source_id → 채널 (data/crawlers/config/sources.json 의 id 기준) */
export const TICKER_SOURCE_CHANNEL: Record<string, NewsChannelKey> = {
  "reddit-gunners": "arsenal",
  "reddit-liverpoolfc": "liverpool",
  "reddit-chelseafc": "chelsea",
}

/**
 * 텍스트 조각들(제목·태그·엔티티명)에서 팀 채널을 정한다. 매칭 실패 시 종합(football).
 * 두 팀 이상 매칭(맞대결 기사 등)이면 종합으로 — 한쪽 팬덤 채널에만 넣지 않는다.
 */
export function resolveNewsChannel(texts: Array<string | null | undefined>): NewsChannelKey {
  const haystack = texts.filter(Boolean).join(" ").toLowerCase()
  if (!haystack) return "football"
  const matched = (Object.keys(TEAM_KEYWORDS) as Array<keyof typeof TEAM_KEYWORDS>).filter((team) =>
    TEAM_KEYWORDS[team].some((kw) => haystack.includes(kw))
  )
  return matched.length === 1 ? matched[0] : "football"
}

/** 사이트 링크에 채널 계측용 UTM 부착 */
export function withDiscordUtm(path: string, medium: string): string {
  const joiner = path.includes("?") ? "&" : "?"
  return `${SITE_URL}${path}${joiner}utm_source=discord&utm_medium=${medium}`
}

interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  thumbnail?: { url: string }
  image?: { url: string }
  fields?: { name: string; value: string; inline?: boolean }[]
  timestamp?: string
  footer?: { text: string }
}

/** 웹훅 저수준 발송 — env 미설정/실패 모두 조용히 무시 */
async function postWebhook(
  webhookUrl: string | undefined,
  body: { content?: string; embeds: DiscordEmbed[] }
): Promise<boolean> {
  if (!webhookUrl) return false
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(body),
    })
    return res.ok
  } catch (e) {
    console.error("Discord 뉴스봇 발송 실패:", e)
    return false
  }
}

const BRAND_COLOR = 0x16a34a // 공놀이 그린
const FOOTER = { text: "gongnori.fan" }

/** 검수 기사 발행 → 팀/종합 채널. 티저(제목+첫 문장)와 사이트 링크만 — 전문 게재 금지. */
export async function notifyNewsPublished(input: {
  channel: NewsChannelKey
  postId: string
  title: string
  /** 본문 첫 문장 등 티저 (없으면 제목만) */
  teaser?: string | null
  imageUrl?: string | null
}): Promise<boolean> {
  const webhookUrl = process.env[CHANNEL_WEBHOOK_ENV[input.channel]]
  // /storage/... 등 상대 경로 이미지는 절대 URL 로 (디스코드는 절대 URL 만 렌더)
  const imageUrl = input.imageUrl?.startsWith("/") ? `${SITE_URL}${input.imageUrl}` : input.imageUrl
  return postWebhook(webhookUrl, {
    embeds: [
      {
        title: input.title.slice(0, 240),
        description: input.teaser?.slice(0, 300) || undefined,
        url: withDiscordUtm(`/post/${input.postId}`, `news_${input.channel}`),
        color: BRAND_COLOR,
        ...(imageUrl ? { image: { url: imageUrl } } : {}),
        timestamp: new Date().toISOString(),
        footer: FOOTER,
      },
    ],
  })
}

/** 데일리 다이제스트 (매일 23:05 KST — 볼 충전 + 새 슬레이트 + 인기 뉴스) */
export async function sendDailyDigest(input: {
  dateLabel: string
  gameLines: string[]
  newsLines: string[]
}): Promise<boolean> {
  const fields: { name: string; value: string }[] = []
  if (input.gameLines.length > 0) {
    fields.push({ name: "오늘의 경기", value: input.gameLines.join("\n").slice(0, 1000) })
  }
  if (input.newsLines.length > 0) {
    fields.push({ name: "인기 뉴스", value: input.newsLines.join("\n").slice(0, 1000) })
  }
  return postWebhook(process.env.DISCORD_DIGEST_WEBHOOK_URL, {
    // @everyone 금지 — 옵트인 역할 멘션만 (예: "<@&123456789>")
    content: process.env.DISCORD_DIGEST_MENTION || undefined,
    embeds: [
      {
        title: `오늘의 공놀이 — ${input.dateLabel}`,
        description: `🏐 볼 10개 충전 완료! 새로 열린 경기에 예측해 보세요.\n[예측하러 가기](${withDiscordUtm("/prediction", "digest")})`,
        color: BRAND_COLOR,
        fields,
        timestamp: new Date().toISOString(),
        footer: FOOTER,
      },
    ],
  })
}
