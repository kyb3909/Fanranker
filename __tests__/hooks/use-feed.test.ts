import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import type { PostsResponse } from "@/hooks/use-feed"

/**
 * useFeed — **실제 훅을 renderHook 으로 렌더해서** 검증한다.
 * (기존 파일은 dedup 알고리즘 복사본만 검증하는 미러였다 — test-gaps.md P4 잔여분)
 *
 * SWR 훅 2개(useSWRInfinite·useSWR)를 목으로 바꿔 관측한다:
 * getKey 가 만드는 요청 URL(개인화·페이지네이션 계약)과
 * 응답 페이지 → posts 변환(중복 제거·정렬·프로필 매핑 계약).
 *
 * 지키는 계약:
 *   1. URL: sort/limit/offset + 팔로우 게시판 + 말머리 개인화(only/exclude)
 *   2. follows 로드 전엔 fetch 없음, 마지막 페이지(<20개) 후엔 다음 페이지 없음
 *   3. id 중복 제거(페이지 경계) + 제목 중복 제거(크롤링 중복) — 첫 글 우선
 *   4. new 정렬은 createdAt 내림차순
 *   5. 프로필 매핑 실패 시 "익명" fallback
 */

const authState = { isSignedIn: false }
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn }),
}))

// useSWR (flair prefs) — 테스트가 값 주입
let flairPrefs: { flair_id: string; pref: string }[] = []
vi.mock("swr", () => ({
  default: (key: string | null) => ({
    data: key ? { prefs: flairPrefs } : undefined,
  }),
}))

// useSWRInfinite — getKey 를 캡처하고 테스트가 pages 를 주입
interface SwrInfiniteState {
  data: PostsResponse[] | undefined
  error: unknown
  size: number
  setSize: ReturnType<typeof vi.fn>
  isLoading: boolean
  isValidating: boolean
}
let swrState: SwrInfiniteState
let capturedGetKey: (pageIndex: number, prev: PostsResponse | null) => string | null
vi.mock("swr/infinite", () => ({
  default: (getKey: typeof capturedGetKey) => {
    capturedGetKey = getKey
    return swrState
  },
}))

vi.mock("@/lib/swr", () => ({ fetcher: vi.fn() }))

import { useFeed, type SortType } from "@/hooks/use-feed"

/* ────────── 픽스처 ────────── */

let postSeq = 0
function makeRawPost(over: Record<string, unknown> = {}) {
  postSeq++
  return {
    id: `post-${postSeq}`,
    user_id: "user-1",
    community_slug: "football",
    title: `제목 ${postSeq}`,
    content: "본문",
    created_at: new Date(Date.now() - postSeq * 60_000).toISOString(),
    ...over,
  }
}

const PROFILES = [{ user_id: "user-1", nickname: "몽몽이", avatar_url: null }]

function page(posts: Record<string, unknown>[]): PostsResponse {
  return { posts, profiles: PROFILES } as unknown as PostsResponse
}

function setup(
  opts: {
    sortBy?: SortType
    followed?: string[]
    followsLoaded?: boolean
    pages?: PostsResponse[]
  } = {}
) {
  swrState = {
    data: opts.pages,
    error: undefined,
    size: opts.pages?.length ?? 1,
    setSize: vi.fn(),
    isLoading: false,
    isValidating: false,
  }
  return renderHook(() =>
    useFeed(opts.sortBy ?? "hot", new Set(opts.followed ?? []), opts.followsLoaded ?? true)
  )
}

describe("useFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.isSignedIn = false
    flairPrefs = []
    postSeq = 0
  })

  describe("요청 URL 계약 (getKey)", () => {
    it("기본: /api/posts?sort=hot&limit=20&offset=0", () => {
      setup({ sortBy: "hot" })
      expect(capturedGetKey(0, null)).toBe("/api/posts?sort=hot&limit=20&offset=0")
    })

    it("random 정렬도 서버에는 new 로 요청한다 (셔플은 클라 몫)", () => {
      setup({ sortBy: "random" })
      expect(capturedGetKey(0, null)).toContain("sort=new")
    })

    it("2페이지는 offset=20", () => {
      setup()
      const fullPrevPage = page(Array.from({ length: 20 }, () => makeRawPost()))
      expect(capturedGetKey(1, fullPrevPage)).toContain("offset=20")
    })

    it("follows 로드 전엔 요청하지 않는다 (null key)", () => {
      setup({ followsLoaded: false })
      expect(capturedGetKey(0, null)).toBeNull()
    })

    it("이전 페이지가 20개 미만이면 다음 페이지 없음 (페이지네이션 종료)", () => {
      setup()
      const lastPage = page([makeRawPost(), makeRawPost()]) // 2개 < PAGE_SIZE
      expect(capturedGetKey(1, lastPage)).toBeNull()
    })

    it("로그인 + 팔로우 게시판 → community_slugs 파라미터", () => {
      authState.isSignedIn = true
      setup({ followed: ["football", "baseball"] })
      expect(capturedGetKey(0, null)).toContain("community_slugs=football,baseball")
    })

    it("비로그인이면 팔로우 목록이 있어도 community_slugs 를 붙이지 않는다", () => {
      authState.isSignedIn = false
      setup({ followed: ["football"] })
      expect(capturedGetKey(0, null)).not.toContain("community_slugs")
    })

    it("말머리 개인화 — favorite→only_flairs, mute→exclude_flairs", () => {
      authState.isSignedIn = true
      flairPrefs = [
        { flair_id: "f1", pref: "favorite" },
        { flair_id: "f2", pref: "mute" },
        { flair_id: "f3", pref: "favorite" },
      ]
      setup()
      const url = capturedGetKey(0, null)!
      expect(url).toContain("only_flairs=f1,f3")
      expect(url).toContain("exclude_flairs=f2")
    })
  })

  describe("posts 변환 계약", () => {
    it("id 중복은 페이지 경계에서 제거된다", () => {
      const dup = makeRawPost({ title: "중복 글" })
      const { result } = setup({
        pages: [page([dup, makeRawPost()]), page([dup, makeRawPost()])],
      })
      const ids = result.current.posts.map((p) => String(p.id))
      expect(ids.filter((id) => id === String(dup.id))).toHaveLength(1)
      expect(result.current.posts).toHaveLength(3)
    })

    it("같은 제목(공백·대소문자 무시)의 다른 글은 첫 글만 남는다 (크롤링 중복)", () => {
      const a = makeRawPost({ title: "손흥민 이적설" })
      const b = makeRawPost({ title: "  손흥민 이적설 " })
      const { result } = setup({ pages: [page([a, b, makeRawPost()])] })
      expect(result.current.posts).toHaveLength(2)
      expect(String(result.current.posts[0].id)).toBe(String(a.id))
    })

    it("new 정렬은 createdAt 내림차순", () => {
      const oldPost = makeRawPost({ created_at: "2026-07-01T00:00:00Z" })
      const newPost = makeRawPost({ created_at: "2026-07-28T00:00:00Z" })
      const { result } = setup({ sortBy: "new", pages: [page([oldPost, newPost])] })
      expect(String(result.current.posts[0].id)).toBe(String(newPost.id))
    })

    it("프로필이 있으면 닉네임, 없으면 익명", () => {
      const known = makeRawPost()
      const unknown = makeRawPost({ user_id: "ghost" })
      const { result } = setup({ pages: [page([known, unknown])] })
      expect(result.current.posts[0].author).toBe("몽몽이")
      expect(result.current.posts[1].author).toBe("익명")
    })

    it("SWR 데이터가 없으면 빈 배열 (크래시 없음)", () => {
      const { result } = setup({ pages: undefined })
      expect(result.current.posts).toEqual([])
    })
  })
})
