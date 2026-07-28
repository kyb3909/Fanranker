import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

/**
 * usePostCardActions — **실제 훅을 renderHook 으로 렌더해서** 검증한다.
 * (기존 파일은 로직 복사본만 검증하는 미러였다 — test-gaps.md P4 잔여분)
 *
 * 지키는 계약:
 *   1. 비로그인 투표/북마크 → openSignIn, 네트워크 미호출, 상태 불변
 *   2. 낙관적 투표: 클릭 즉시 카운트 반영 → 서버 값으로 확정, 실패 시 원복
 *   3. 투표 전환(up→down)은 ±2, 재클릭은 해제
 *   4. 삭제는 confirm 취소 시 아무것도 안 함, 성공 시 홈 이동+refresh
 *   5. 북마크 상태 체크는 1회만 (bookmarkChecked 캐시)
 */

const routerMock = { push: vi.fn(), refresh: vi.fn() }
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}))

const authState = { isSignedIn: true }
const openSignInMock = vi.fn()
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn }),
  useClerk: () => ({ openSignIn: openSignInMock }),
}))

const toastMock = vi.fn()
vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}))

const toggleBlockMock = vi.fn()
vi.mock("@/hooks/use-blocked-users", () => ({
  useBlockedUsers: () => ({ toggleBlock: toggleBlockMock }),
}))

import { usePostCardActions } from "@/hooks/use-post-card-actions"

function setup(over: Partial<Parameters<typeof usePostCardActions>[0]> = {}) {
  return renderHook(() =>
    usePostCardActions({
      postId: "post-1",
      author: "몽몽이",
      authorId: "author-1",
      upvotes: 10,
      isUpvoted: false,
      ...over,
    })
  )
}

const okJson = (body: unknown) => ({ ok: true, json: async () => body })

describe("usePostCardActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.isSignedIn = true
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true)
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("투표", () => {
    it("비로그인 → openSignIn, 네트워크 미호출, 카운트 불변", async () => {
      authState.isSignedIn = false
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.handleVote("up"))

      expect(openSignInMock).toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(result.current.voteCount).toBe(10)
    })

    it("낙관적 업데이트 — 서버 응답 전에 카운트가 먼저 오른다", async () => {
      let resolveFetch!: (v: unknown) => void
      const fetchMock = vi.fn().mockReturnValue(new Promise((r) => (resolveFetch = r)))
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      act(() => {
        void result.current.handleVote("up")
      })
      // 아직 서버 미응답 — 낙관적 상태
      expect(result.current.voteCount).toBe(11)
      expect(result.current.myVote).toBe("up")

      await act(async () => {
        resolveFetch(okJson({ voteCount: 11, voteType: "up" }))
      })
      expect(result.current.voteCount).toBe(11)
    })

    it("투표는 /api/posts/:id/vote 로 type 을 담아 POST 된다", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okJson({ voteCount: 11, voteType: "up" }))
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.handleVote("up"))

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("/api/posts/post-1/vote")
      expect(JSON.parse((init as RequestInit).body as string)).toEqual({ type: "up" })
    })

    it("같은 투표 재클릭 → 해제 (카운트 원복)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okJson({ voteCount: 10, voteType: null }))
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup({ isUpvoted: true, upvotes: 11 }) // 이미 up 상태

      await act(() => result.current.handleVote("up"))

      expect(result.current.myVote).toBeNull()
      expect(result.current.voteCount).toBe(10)
    })

    it("up → down 전환은 카운트 -2 (낙관적)", async () => {
      let resolveFetch!: (v: unknown) => void
      const fetchMock = vi.fn().mockReturnValue(new Promise((r) => (resolveFetch = r)))
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup({ isUpvoted: true, upvotes: 11 })

      act(() => {
        void result.current.handleVote("down")
      })
      expect(result.current.voteCount).toBe(9) // 11 - 1(down) - 1(up 취소)
      expect(result.current.myVote).toBe("down")
      await act(async () => resolveFetch(okJson({ voteCount: 9, voteType: "down" })))
    })

    it("서버 실패 → 낙관적 변경을 원복한다", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.handleVote("up"))

      expect(result.current.voteCount).toBe(10)
      expect(result.current.myVote).toBeNull()
    })
  })

  describe("북마크", () => {
    it("비로그인 → openSignIn, 네트워크 미호출", async () => {
      authState.isSignedIn = false
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.handleBookmark())

      expect(openSignInMock).toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("토글 성공 → 서버가 준 bookmarked 값 반영", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okJson({ bookmarked: true }))
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.handleBookmark())

      expect(result.current.isBookmarked).toBe(true)
    })

    it("checkBookmarkStatus 는 1회만 서버를 부른다 (재호출 캐시)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okJson({ bookmarked: true }))
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.checkBookmarkStatus())
      await act(() => result.current.checkBookmarkStatus())

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(result.current.isBookmarked).toBe(true)
    })

    it("실패 → 에러 토스트, 상태 불변", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue({ ok: false, json: async () => ({ error: "실패" }) })
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.handleBookmark())

      expect(result.current.isBookmarked).toBe(false)
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    })
  })

  describe("삭제·차단·기타", () => {
    it("confirm 취소 → 삭제 요청 자체가 없다", async () => {
      vi.stubGlobal(
        "confirm",
        vi.fn(() => false)
      )
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.handleDeletePost())

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("삭제 성공 → 홈으로 이동 + refresh", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okJson({}))
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.handleDeletePost())

      expect(fetchMock.mock.calls[0][0]).toBe("/api/posts/post-1")
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("DELETE")
      expect(routerMock.push).toHaveBeenCalledWith("/")
      expect(routerMock.refresh).toHaveBeenCalled()
    })

    it("삭제 실패 → 이동하지 않고 에러 토스트", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue({ ok: false, json: async () => ({ error: "권한 없음" }) })
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      await act(() => result.current.handleDeletePost())

      expect(routerMock.push).not.toHaveBeenCalled()
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: "권한 없음" }))
    })

    it("차단 — authorId 없으면 no-op", async () => {
      const { result } = setup({ authorId: undefined })
      await act(() => result.current.handleBlockUser())
      expect(toggleBlockMock).not.toHaveBeenCalled()
    })

    it("차단 성공 → toggleBlock 호출 + 완료 토스트", async () => {
      toggleBlockMock.mockResolvedValue({ blocked: true })
      const { result } = setup()

      await act(() => result.current.handleBlockUser())

      expect(toggleBlockMock).toHaveBeenCalledWith("author-1")
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "차단 완료" }))
    })

    it("글수정 → /write?edit=:id 로 이동", () => {
      const { result } = setup()
      act(() => result.current.handleEditPost())
      expect(routerMock.push).toHaveBeenCalledWith("/write?edit=post-1")
    })
  })
})
