/**
 * 경기 리포트의 **원문 기사 고르기** — 순수 모듈 (2026-09-01).
 *
 * ## 무엇이 잘못돼 있었나
 * 리포트 원문을 `fsned` 응답의 **맨 앞 기사**로 잡고 있었다. 그런데 그 섹션의 이름은
 * `articlesOnParticipants` — "이 경기의 리포트"가 아니라 **두 팀을 언급한 최신 기사 목록**이다.
 * 맨 앞은 그냥 가장 최근에 발행된 글이라, 실측(2026-08-31 새벽 경기)에서 이렇게 나왔다.
 *
 * - 나폴리-코모 · 칼리아리-인테르 · 모나코-마르세유 **세 경기가 같은 기사 하나**를 받았다
 *   ("Football Tracker: Inter Milan and Monaco claim wins…" — 첼시·선덜랜드까지 섞인
 *   77문단짜리 주말 전체 라운드업).
 * - 맨유-입스위치는 "Team of the Weekend"(주말 베스트 11)를 받았다.
 *
 * 한 경기 리포트를 쓰라고 만든 파이프라인에 **여러 경기가 섞인 문서**가 들어간 것이다.
 * 다른 경기의 사실이 이 경기 리포트로 새는, 환각 가드가 존재하는 바로 그 모양이다.
 * (모나코·맨유는 통과했고 내용도 원문에 근거가 있었지만, 그건 운이 좋았던 것이다.
 *  나폴리·칼리아리는 게이트에 걸려 리포트가 아예 안 나왔다.)
 *
 * ## 고친 방식 — 전용 리포트는 실제로 있다, 0번이 아닐 뿐이었다
 * 같은 목록의 1~6번째에 그 경기 전용 리포트가 멀쩡히 들어 있었다. 판별은 **슬러그**로 한다.
 *
 *   soccer-premier-league-manchester-united-ipswich-report-august-30   ← 맨유-입스위치
 *   soccer-serie-a-cagliari-inter-30-08-2026-report                    ← 칼리아리-인테르
 *   soccer-serie-a-napoli-como-30-08-2026-report                       ← 나폴리-코모
 *   soccer-ligue-1-monaco-marseille-30-08-2026-report                  ← 모나코-마르세유
 *
 * 슬러그에는 **매치 URL과 같은 팀 슬러그**가 그대로 들어간다. 제목 대조였다면
 * "Man Utd" ↔ "Manchester United" 같은 약칭 문제를 별칭 표로 떠받쳐야 했을 텐데,
 * 슬러그끼리 맞추면 그 문제가 아예 없다.
 *
 * 조건 셋을 모두 만족해야 채택한다.
 * 1. 슬러그에 **양 팀 슬러그가 다 있다** — 라운드업("…inter-milan-and-monaco-claim-wins")은
 *    한쪽만 있어 떨어진다.
 * 2. **킥오프 이후 발행** — 프리뷰가 걸리는 걸 막는다. 실측에 있었다:
 *    "who-s-missing-carlos-baleba-injured-ahead-of-man-united-s-clash-with-ipswich"(경기 이틀 전)는
 *    양 팀 이름이 다 들어 있다.
 * 3. 정렬은 `report` 토큰 우선 → 그다음 **가장 먼저 발행된 것**. FT 직후에 붙는 글이
 *    그 경기 리포트이고, 하루 뒤 글은 대개 파생 칼럼이다.
 *
 * ⚠️ 못 고르면 `null` 이다 — 옛 동작(맨 앞 집기)으로 되돌아가지 않는다. 이 파이프라인의
 *    규율은 **틀리는 쪽이 아니라 비는 쪽으로 실패하는 것**이다. 전용 리포트를 안 내는
 *    경기는 리포트가 없는 게 맞다.
 */

export interface ArticleMeta {
  id: string
  /** 기사 슬러그 — 판별의 유일한 근거 */
  slug: string
  title: string
  /** 발행 시각 (ms). 수정 시각(editedAt)이 아니라 최초 발행이어야 한다 */
  publishedAtMs: number
}

/** 슬러그 안전 토큰 — 팀 슬러그는 [a-z0-9-] 이지만 정규식에 넣기 전에 접는다 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 슬러그에 이 토큰이 **하이픈 경계로** 들어 있는가.
 * 포함 관계로 보면 "inter" 가 "international" 을, "como" 가 "comoros" 를 물어온다.
 */
export function hasSlugToken(slug: string, token: string): boolean {
  if (!slug || !token) return false
  return new RegExp(`(^|-)${escapeRe(token)}(-|$)`).test(slug)
}

/**
 * soccerway 매치 URL → 두 팀 슬러그.
 * `https://www.soccerway.com/match/ipswich-thqhB2MB/manchester-united-ppjDR086/`
 *   → `["ipswich", "manchester-united"]`
 *
 * 팀 슬러그 뒤에는 항상 8자 해시가 하이픈으로 붙는다 — 그 마지막 마디만 떼면 된다.
 * (해시를 안 떼면 "manchester-united-ppjdr086" 이 되어 기사 슬러그와 절대 안 맞는다.)
 */
export function teamSlugsFromMatchUrl(url: string): [string, string] | null {
  const m = /\/match\/([^/]+)\/([^/]+)\/?$/.exec(String(url ?? "").trim())
  if (!m) return null
  const strip = (seg: string): string | null => {
    const parts = seg.toLowerCase().split("-")
    if (parts.length < 2) return null
    // 마지막 마디가 8자 해시 — 아니면 URL 모양이 바뀐 것이라 손대지 않는다
    if (!/^[a-z0-9]{8}$/i.test(parts[parts.length - 1])) return null
    const slug = parts.slice(0, -1).join("-")
    return slug.length > 0 ? slug : null
  }
  const a = strip(m[1])
  const b = strip(m[2])
  return a && b ? [a, b] : null
}

/** 슬러그가 "리포트"라고 스스로 말하는가 — `…-report`, `…-match-report-22-08` 둘 다 */
function looksLikeReport(slug: string): boolean {
  return hasSlugToken(slug, "report")
}

/**
 * 이 경기 전용 리포트 기사 고르기. 없으면 null.
 *
 * @param articles fsned 목록에서 메타(nah)까지 받아온 후보들
 * @param teamSlugs 매치 URL에서 뽑은 두 팀 슬러그 (순서 무관)
 * @param kickoffMs 킥오프 (ms) — 이보다 먼저 발행된 글은 프리뷰다
 */
export function pickReportArticle(
  articles: ArticleMeta[],
  teamSlugs: [string, string],
  kickoffMs: number
): ArticleMeta | null {
  const [a, b] = teamSlugs
  if (!a || !b) return null

  const candidates = (articles ?? []).filter(
    (art) =>
      !!art?.slug &&
      Number.isFinite(art.publishedAtMs) &&
      art.publishedAtMs >= kickoffMs &&
      hasSlugToken(art.slug, a) &&
      hasSlugToken(art.slug, b)
  )
  if (candidates.length === 0) return null

  candidates.sort((x, y) => {
    const rx = looksLikeReport(x.slug) ? 0 : 1
    const ry = looksLikeReport(y.slug) ? 0 : 1
    if (rx !== ry) return rx - ry
    return x.publishedAtMs - y.publishedAtMs
  })
  return candidates[0]
}
