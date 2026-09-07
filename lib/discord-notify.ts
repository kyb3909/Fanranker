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

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gongnori.fan"

/**
 * 상대경로(/admin/…)를 절대 URL 로. 디스코드 임베드의 `url` 은 절대 URL 만 링크가 된다 —
 * 종전엔 발신처 절반이 "/admin/matches" 처럼 넘겨서 제목 클릭이 아무 데도 안 갔다 (2026-09-02).
 */
export function opsUrl(pathOrUrl: string | undefined): string | undefined {
  if (!pathOrUrl) return undefined
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${SITE}${pathOrUrl}`
}

interface DiscordOpsNotice {
  title: string
  description?: string
  level?: Level
  /** 클릭 시 이동할 관리자 링크 — 상대경로(/admin/news-review)면 사이트 도메인을 붙인다 */
  url?: string
  /**
   * 구조화 필드 (2026-09-02 운영자: "뭐가 문제인지 좀 더 구체적으로").
   * 셋 다 선택이지만 **알림은 이 세 질문에 답해야 한다** — 어디서 났나 · 사용자에게 무슨 일이 생기나 ·
   * 지금 뭘 하면 되나. 있으면 `fields` 앞에 고정 순서로 붙는다.
   */
  where?: string
  impact?: string
  action?: string
  /**
   * 처리 화면 바로가기 (2026-09-08 운영자: "관리자 페이지 거기로 이동하게끔").
   *
   * 임베드 제목 링크는 하나뿐이라 알림에 여러 종류가 섞이면 어디로 가야 할지 못 고른다.
   * 여기 넣은 것은 `🔗 바로 가기` 필드에 각각 눌리는 링크로 붙는다. 상대경로면 절대화한다.
   * 같은 곳을 가리키는 항목은 접는다 — 같은 링크가 다섯 번 찍히면 아무도 안 누른다.
   */
  links?: { label: string; path: string }[]
  fields?: { name: string; value: string; inline?: boolean }[]
  /** @everyone / <@&roleId> 등 멘션 (긴급 알림에만 권장) */
  mention?: string
}

/** 바로가기 목록 → 마크다운 링크 한 줄. 중복 경로는 접고, 디스코드 필드 상한을 넘지 않게 자른다 */
export function buildOpsLinks(links: DiscordOpsNotice["links"]): string | null {
  if (!links || links.length === 0) return null
  const seen = new Set<string>()
  const parts: string[] = []
  for (const l of links) {
    const href = opsUrl(l.path)
    if (!href || seen.has(href)) continue
    seen.add(href)
    parts.push(`[${l.label.replace(/[[\]]/g, "").slice(0, 40)}](${href})`)
    if (parts.length >= 6) break
  }
  return parts.length > 0 ? parts.join(" · ") : null
}

/** 임베드 필드 목록 — 구조화 필드(어디·영향·조치)가 먼저, 발신처 필드가 뒤. 디스코드 상한 10개 */
export function buildOpsFields(
  notice: Pick<DiscordOpsNotice, "where" | "impact" | "action" | "links" | "fields">
): { name: string; value: string; inline: boolean }[] {
  const lead: { name: string; value: string; inline: boolean }[] = []
  if (notice.where) lead.push({ name: "📍 어디서", value: notice.where, inline: false })
  if (notice.impact) lead.push({ name: "💥 영향", value: notice.impact, inline: false })
  if (notice.action) lead.push({ name: "🔧 지금 할 일", value: notice.action, inline: false })
  // 조치 바로 아래가 바로가기 — 읽고 나서 누를 자리다
  const links = buildOpsLinks(notice.links)
  if (links) lead.push({ name: "🔗 바로 가기", value: links, inline: false })
  const rest = (notice.fields ?? []).map((f) => ({
    name: f.name,
    value: f.value,
    inline: f.inline ?? false,
  }))
  return [...lead, ...rest].slice(0, 10).map((f) => ({
    name: f.name.slice(0, 240),
    value: (f.value || "-").slice(0, 1000),
    inline: f.inline,
  }))
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
            url: opsUrl(notice.url),
            color: COLORS[notice.level ?? "info"],
            fields: buildOpsFields(notice),
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
