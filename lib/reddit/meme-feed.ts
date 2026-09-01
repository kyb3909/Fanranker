/**
 * 레딧 밈 피드 파싱·선별 — **순수 모듈** (2026-09-01).
 *
 * ## 왜 이 소스인가 (운영자 확정)
 * r/soccercirclejerk 의 이미지 밈. 실제 예시가 판단 근거였다 — "The unbeaten Premier
 * League Giants after Matchday 2" 는 군인들 사이에 광대가 서 있는 템플릿에 첼시·맨시티·
 * 헐시티·아스날 엠블럼을 군인으로, 리버풀을 광대로 붙인 그림이다 (다들 2승 무패인데
 * 리버풀만 2무 무패라서).
 *
 * **엠블럼은 언어를 안 탄다** — 이게 이 소스를 쓸 수 있게 만드는 핵심이다. 이 서브레딧
 * 글의 상당수는 텍스트 반어("펩 이제 끝났다" = 펩 찬양)라 번역하면 뜻이 뒤집히지만,
 * 이미지 밈은 그림만으로 농담이 성립해서 우리는 제목만 옮기면 된다.
 *
 * ## 그래서 선별 규칙
 * - **이미지가 있어야 한다.** 없으면 텍스트 반어일 확률이 높다 — 받지 않는다.
 * - 제목에 차단어(정치·사건사고)가 있으면 버린다. 밈이라도 소재가 그쪽이면 안 된다.
 * - 최근 것만. 밈은 시의성이 전부다.
 *
 * ⚠️ **댓글은 절대 가져오지 않는다.** 실제 예시의 댓글에 카라거 침 뱉기 사건이 실명으로
 *    오갔다 — 실존 인물의 논란을 우리가 옮기면 명예훼손 영역이다. 이미지와 제목까지만.
 *
 * ⚠️ 레딧은 **IP 당 요율 제한**이 세다 (실측: `hot/.rss` 200, 같은 순간 `.rss`·
 *    `top/.rss` 는 429). 429 는 고장이 아니라 정상 상태다 — 호출부가 실패로 세면 안 된다.
 */

export interface RedditMemeEntry {
  /** 레딧 글 id (t3_xxxx 또는 permalink 말단) — 중복 판정 키 */
  id: string
  title: string
  /** 원문 글 주소 — 출처 표기와 중복 판정에 쓴다 */
  permalink: string
  /** 원본 이미지 (i.redd.it). 없으면 이미지 글이 아니다 */
  imageUrl: string | null
  author: string | null
  updatedAtMs: number | null
}

function decodeEntities(s: string): string {
  // RSS 안에 HTML 이 두 번 이스케이프돼 들어온다 (&amp;quot; → &quot; → ")
  let out = s
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&#32;/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
  }
  return out
}

function pick(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml)
  return m ? m[1].trim() : null
}

/** 레딧 Atom 피드 → 엔트리. 모양이 어긋난 항목은 조용히 건너뛴다 (fail-open) */
export function parseRedditMemeFeed(xml: string): RedditMemeEntry[] {
  const out: RedditMemeEntry[] = []
  for (const raw of String(xml ?? "")
    .split("<entry>")
    .slice(1)) {
    const block = raw.split("</entry>")[0]
    const title = decodeEntities(pick(block, "title") ?? "").trim()
    if (!title) continue

    const contentRaw = pick(block, "content") ?? ""
    const content = decodeEntities(contentRaw)

    // permalink — content 안의 comments 링크가 가장 확실하다
    const permalink =
      /href="(https:\/\/www\.reddit\.com\/r\/[^"]*?\/comments\/[^"]+?)"/.exec(content)?.[1] ??
      pick(block, "id") ??
      ""
    if (!permalink.includes("/comments/")) continue

    // 이미지 글만 — i.redd.it 직링이 있으면 이미지 본체가 있는 글이다
    const imageUrl = /href="(https:\/\/i\.redd\.it\/[^"]+)"/.exec(content)?.[1] ?? null

    const idFromLink = /\/comments\/([a-z0-9]+)\//i.exec(permalink)?.[1]
    const updated = pick(block, "updated") ?? pick(block, "published")
    const ts = updated ? Date.parse(updated) : NaN

    out.push({
      id: idFromLink ?? permalink,
      title,
      permalink: permalink.split("?")[0],
      imageUrl,
      author: /<name>([^<]+)<\/name>/.exec(block)?.[1]?.trim() ?? null,
      updatedAtMs: Number.isFinite(ts) ? ts : null,
    })
  }
  return out
}

export interface PickOptions {
  /** 소문자 차단어 — 단어 경계로 본다 (정치·사건사고) */
  blockedWords: string[]
  /** 이미 담아둔 permalink — 다시 가져오지 않는다 */
  seenPermalinks: Set<string>
  nowMs: number
  /** 이보다 오래된 글은 버린다 (밈은 시의성이 전부) */
  maxAgeMs: number
  limit: number
}

/** 제목에 차단어가 단어 경계로 들어 있는가 */
export function hasBlockedWord(title: string, blockedWords: string[]): boolean {
  const t = String(title ?? "").toLowerCase()
  return (blockedWords ?? []).some((w) => {
    const word = String(w ?? "")
      .toLowerCase()
      .trim()
    if (!word) return false
    return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t)
  })
}

/** 발행 후보 — 이미지 있고, 안 걸리고, 새 것이고, 아직 안 담은 것 */
export function pickMemeCandidates(
  entries: RedditMemeEntry[],
  opts: PickOptions
): RedditMemeEntry[] {
  const out: RedditMemeEntry[] = []
  for (const e of entries ?? []) {
    if (!e.imageUrl) continue // 텍스트 반어 글 — 번역하면 뜻이 뒤집힌다
    if (opts.seenPermalinks.has(e.permalink)) continue
    if (hasBlockedWord(e.title, opts.blockedWords)) continue
    // 시각을 못 읽은 항목은 통과시킨다 — 피드 모양 변화로 물량이 0 이 되는 게 더 나쁘다
    if (e.updatedAtMs != null && opts.nowMs - e.updatedAtMs > opts.maxAgeMs) continue
    out.push(e)
    if (out.length >= opts.limit) break
  }
  return out
}
