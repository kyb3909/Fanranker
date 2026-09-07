/**
 * 관리자 경로별 접근 범위 — **순수 모듈** (2026-09-08).
 *
 * ## 왜 필요해졌나
 * `/admin2` 를 `/admin` 으로 합치면서 생긴 문제다. `/admin2` 레이아웃은 `requireStaff`
 * (admin + editor)라 검수 담당이 뉴스·커뮤글 검수에 들어올 수 있었고, `/admin` 레이아웃은
 * `requireAdmin`(전권)이라 못 들어온다. 통합하면서 `/admin` 을 그냥 staff 로 열면
 * **환불·정산·사용자 관리까지 한꺼번에 열린다** — 모든 `/admin` 페이지가 자체 권한 검사
 * 없이 레이아웃 하나에 기대고 있기 때문이다(35개 페이지 전수 확인).
 *
 * 그래서 기본은 **거부**다. editor 가 종전에 실제로 도달할 수 있던 화면만 여기 적는다.
 * 목록을 늘리는 것은 권한을 넓히는 일이므로 운영자 판단이 필요하다.
 *
 * ⚠️ 이 모듈은 **메뉴 노출용이 아니라 게이트용**이다. 각 API 는 여전히 자기 권한 검사를
 *    따로 한다(`requireAdminApi` / `requireStaffApi`). 화면 게이트 하나에 기대지 않는다.
 *
 * ⚠️ `moderator` 는 관리자 패널 역할이 아니다(`lib/admin/roles.ts`). 여기서 다루지 않는다.
 */

export type PanelRole = "admin" | "editor"

/**
 * editor 가 열 수 있는 경로.
 *
 * 근거: 통합 전 `/admin2` 가 editor 에게 실제로 내주던 화면이 이것뿐이었다
 * (`/admin2` 작업대, `/admin2/news` → 뉴스 검수, `/admin2/agg` → 커뮤글 검수).
 * `/admin2/reports` 는 admin 이 아니면 되돌려보냈다.
 *
 * ⚠️ **`/admin` 은 정확일치만이다.** 하위까지 허용하면 `/admin/refunds` 를 비롯한
 *    35개 화면이 전부 통과한다 — 접두사 하나로 권한이 통째로 열리는 자리다.
 */
const EDITOR_EXACT: readonly string[] = ["/admin"]
const EDITOR_SUBTREE: readonly string[] = ["/admin/news-review", "/admin/agg-review"]

/** 경로가 허용 항목과 같거나 그 하위인가. `/admin/news-review-secret` 같은 접두사 사칭은 막는다 */
function inSubtree(pathname: string, allowed: string): boolean {
  return pathname === allowed || pathname.startsWith(`${allowed}/`)
}

/**
 * 이 역할이 이 경로를 열 수 있는가.
 *
 * `pathname` 이 null 이면(미들웨어 헤더 유실 등) **거부한다** — 어느 화면인지 모르는 채로
 * 통과시키면 그 순간 전체가 열린다. admin 은 어차피 전권이라 영향이 없다.
 */
export function canOpenAdminPath(role: PanelRole, pathname: string | null): boolean {
  if (role === "admin") return true
  if (!pathname) return false
  if (EDITOR_EXACT.includes(pathname)) return true
  return EDITOR_SUBTREE.some((allowed) => inSubtree(pathname, allowed))
}

/** 거부됐을 때 보낼 곳. editor 는 자기 홈으로, 그마저 막히면 사이트 밖으로 */
export function fallbackPathFor(role: PanelRole, pathname: string | null): string {
  if (role === "editor" && pathname && pathname !== "/admin") return "/admin"
  return "/"
}

/** 사이드바에서 이 역할에게 보여줄 항목인가 — 게이트와 같은 규칙을 쓴다 */
export function isVisibleForRole(role: PanelRole, href: string): boolean {
  return canOpenAdminPath(role, href)
}
