import { describe, expect, it } from "vitest"
import { canOpenAdminPath, fallbackPathFor, isVisibleForRole } from "@/lib/admin/route-access"

/**
 * `/admin2` 통합 뒤 권한 경계.
 *
 * 핵심: `/admin` 의 35개 페이지가 전부 레이아웃 하나에 기대고 있어서, editor 를 그냥
 * 들여보내면 환불·정산·사용자 관리까지 열린다. 기본 거부를 계약으로 잠근다.
 */
describe("관리자 경로 접근", () => {
  it("admin 은 모든 경로를 연다", () => {
    for (const p of ["/admin", "/admin/refunds", "/admin/users/abc", "/admin/settlements"]) {
      expect(canOpenAdminPath("admin", p)).toBe(true)
    }
  })

  it("editor 는 통합 전 /admin2 에서 실제로 쓰던 화면만 연다", () => {
    expect(canOpenAdminPath("editor", "/admin")).toBe(true)
    expect(canOpenAdminPath("editor", "/admin/news-review")).toBe(true)
    expect(canOpenAdminPath("editor", "/admin/agg-review")).toBe(true)
  })

  it("editor 는 돈·사용자·신고 화면을 열지 못한다", () => {
    for (const p of [
      "/admin/refunds",
      "/admin/settlements",
      "/admin/tokens",
      "/admin/users",
      "/admin/content/reports",
      "/admin/matches",
      "/admin/board",
    ]) {
      expect(canOpenAdminPath("editor", p)).toBe(false)
    }
  })

  it("허용 경로의 하위는 함께 열리지만 접두사만 같은 남의 경로는 아니다", () => {
    expect(canOpenAdminPath("editor", "/admin/news-review/anything")).toBe(true)
    // "/admin/news-review" 로 시작하지만 다른 화면인 경우를 접두사만으로 통과시키면 안 된다
    expect(canOpenAdminPath("editor", "/admin/news-review-secret")).toBe(false)
  })

  it("경로를 모르면 거부한다 (미들웨어 헤더 유실 시 fail-closed)", () => {
    expect(canOpenAdminPath("editor", null)).toBe(false)
    // admin 은 전권이라 헤더가 없어도 통과 — 넓어지는 방향이 아니다
    expect(canOpenAdminPath("admin", null)).toBe(true)
  })

  it("거부 시 editor 는 자기 홈으로, 홈조차 막히면 사이트 밖으로 보낸다", () => {
    expect(fallbackPathFor("editor", "/admin/refunds")).toBe("/admin")
    expect(fallbackPathFor("editor", null)).toBe("/")
    expect(fallbackPathFor("editor", "/admin")).toBe("/")
  })

  it("사이드바 노출 규칙은 서버 게이트와 같은 판정을 쓴다", () => {
    expect(isVisibleForRole("editor", "/admin/refunds")).toBe(false)
    expect(isVisibleForRole("editor", "/admin/news-review")).toBe(true)
    expect(isVisibleForRole("admin", "/admin/refunds")).toBe(true)
  })
})
