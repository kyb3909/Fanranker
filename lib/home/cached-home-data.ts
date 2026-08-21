import "server-only"

import { unstable_cache } from "next/cache"
import { createAnonClient } from "@/lib/supabase/server"
import { fetchCardNews, fetchHeroCards, type CardNewsItem } from "@/lib/feed/cardnews"
import type { PostsResponse, SortType } from "@/hooks/use-feed"

/**
 * 홈/승부예측 SSR 이 긁는 공개 데이터의 **Data Cache 래퍼 모음**.
 *
 * ## 왜 필요한가 (2026-08-15 실측)
 *
 * 두 페이지에 `export const revalidate = 300` 이 선언돼 있지만 **동작하지 않는다.**
 * 루트 레이아웃의 `<ClerkProvider dynamic>` 이 앱 전체를 동적 렌더로 고정해서
 * 프리렌더 라우트는 robots/sitemap/og 3개뿐이고, 모든 페이지 응답이 `private, no-store`
 * 로 나간다 (x-vercel-cache 100% MISS). 즉 홈은 **매 요청마다 통째로 다시 렌더된다.**
 *
 * 그런데 Vercel 함수는 iad1(미국), Supabase 는 아시아에 있어 무캐시 왕복 1회가
 * 300ms~2초다 (실측: 카테고리 285ms / 설문 719ms / 예측통계 1,792ms). 홈은 이런 조회를
 * 8개 병렬로 돌리므로 **가장 느린 하나가 전체를 인질로 잡아** 서버 HTML 완료가 2.5~3.7초,
 * LCP 는 거기에 +200ms 로 따라붙었다. FCP 는 이미 0.4~0.8초라 껍데기는 빠르게 그려진다 —
 * 즉 홈이 느린 이유는 자산 무게(폰트·JS·이미지)가 아니라 **오직 서버 데이터 대기**다.
 *
 * 그래서 각 소스를 Data Cache 로 감싼다. 전체 렌더 캐시(ISR)를 살리는 건 ClerkProvider
 * 구조를 건드려야 해서 별개 작업이고, Data Cache 는 동적 렌더 안에서도 그대로 동작한다.
 *
 * ## 신선도
 *
 * TTL 만으로 버티지 않는다 — 쓰기 경로에서 `revalidateTag` 로 즉시 무효화한다.
 * 새 글 작성이 홈에 바로 안 뜨면 그게 곧 버그다 (종전 `revalidatePath("/")` 가 하던 역할).
 * 태그를 추가할 땐 무효화 지점도 같이 넣을 것.
 */

/** revalidateTag 로 무효화할 때 쓰는 태그 — 쓰기 경로와 이 파일이 같은 문자열을 봐야 한다. */
export const HOME_TAGS = {
  /** 글 목록/최근 댓글/전체 공지 — 글 작성·삭제·공지 지정 시 */
  posts: "home-posts",
  /** 게시판 목록 — 어드민 boards 변경 시 */
  categories: "home-categories",
  /** 이벤트 상태 — 이벤트 개폐 시 */
  events: "home-events",
  /** 카드뉴스·히어로 — 뉴스 발행/히어로 핀 변경 시 */
  cardnews: "home-cardnews",
} as const

// ─────────────────────────────────────────────────────────────
// 1) 메인 피드
// ─────────────────────────────────────────────────────────────

async function fetchFeed(sort: SortType): Promise<PostsResponse> {
  const supabase = createAnonClient()
  try {
    // active 게시판만 — 게시판 축소(is_active)를 비로그인 담벼락에도 일관 적용.
    // 이 initialFeed 는 use-feed 가 hot+비로그인일 때 그대로 fallback 으로 쓰므로
    // 여기서 안 막으면 숨긴 게시판 글이 담벼락에 그대로 노출된다.
    const { data: activeCats } = await supabase
      .from("categories")
      .select("slug")
      .eq("is_active", true)
    const activeSlugs = (activeCats ?? []).map((c) => c.slug)
    const base = supabase
      .from("posts")
      .select(
        "id, user_id, community_slug, title, content, image, vote_count, comment_count, temperature, created_at"
      )
      .is("deleted_at", null)
      .in("community_slug", activeSlugs)
    const ordered =
      sort === "new"
        ? base.order("created_at", { ascending: false })
        : base.order("temperature", { ascending: false, nullsFirst: false })
    const { data: posts, error } = await ordered.range(0, 19)

    if (error || !posts || posts.length === 0) {
      return { posts: [], profiles: [] }
    }

    const userIds = [...new Set(posts.map((p) => p.user_id))]
    const [{ data: profiles }, { data: equippedTitles }] = await Promise.all([
      supabase.from("profiles").select("user_id, nickname, avatar_url").in("user_id", userIds),
      supabase
        .from("user_equipped_titles")
        .select("user_id, board_slug, adj_titles ( title, rarity ), noun_titles ( title )")
        .in("user_id", userIds),
    ])

    return {
      posts,
      profiles: profiles || [],
      equippedTitles: (equippedTitles || []) as unknown as PostsResponse["equippedTitles"],
      hasMore: posts.length === 20,
    }
  } catch {
    return { posts: [], profiles: [] }
  }
}

/** 담벼락 첫 20개. 새 글은 쓰기 경로의 revalidateTag 로 즉시 반영된다. */
export function getCachedFeed(sort: SortType): Promise<PostsResponse> {
  return unstable_cache(() => fetchFeed(sort), ["home-feed", sort], {
    revalidate: 30,
    tags: [HOME_TAGS.posts],
  })()
}

// ─────────────────────────────────────────────────────────────
// 2) 사이드바 — 홈과 승부예측이 **같은 캐시 키를 공유**한다
// ─────────────────────────────────────────────────────────────

/** 게시판 목록 (CommunitySidebar) */
export function getCachedCategories(): Promise<unknown[]> {
  return unstable_cache(
    async () => {
      const supabase = createAnonClient()
      const { data } = await supabase
        .from("categories")
        .select("id, slug, name, icon, sort_order, description, parent_slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
      return data ?? []
    },
    ["home-categories"],
    { revalidate: 300, tags: [HOME_TAGS.categories] }
  )().catch(() => [] as unknown[])
}

/** 최근 댓글 달린 글 (ActivitySidebar) */
export function getCachedRecentComments(): Promise<unknown[]> {
  return unstable_cache(
    async () => {
      const supabase = createAnonClient()
      // active 게시판만 — fetchFeed 와 같은 이유 (2026-08-21 혼합 피드 토론 D3:
      // 이 함수만 필터가 없어서, 온보딩으로 숨긴 게시판 글이 댓글 하나로 홈에 재등장했다)
      const { data: activeCats } = await supabase
        .from("categories")
        .select("slug")
        .eq("is_active", true)
      const activeSlugs = (activeCats ?? []).map((c) => c.slug)
      const { data } = await supabase
        .from("posts")
        // user_id: "담벼락 지금" 인터리브가 사람 글을 골라내는 데 쓴다 (2026-08-20).
        // content: 첫 이미지 추출용 — 아래에서 image 로 줄이고 원본은 버린다 (2026-08-21
        // 운영자: "아이돌 이미지도 하나 중간에 껴 있으면"). ActivitySidebar 는 여분 필드 무시.
        .select(
          "id, title, community_slug, comment_count, last_comment_at, created_at, user_id, image, content"
        )
        .is("deleted_at", null)
        .gt("comment_count", 0)
        .in("community_slug", activeSlugs)
        .order("last_comment_at", { ascending: false, nullsFirst: false })
        // 25로 확장 (2026-08-21 토론 D1 — 풀 고갈 수리): 봇 기사 포함 top-10 에서 봇 제외를
        // 클라이언트가 사후 수행하는 구조라, 경기일에 댓글이 봇 매치 기사로 몰리면 사람 글이
        // 10칸 밖으로 밀려 인터리브가 **무증상으로** 사라졌다. 소비처는 각자 slice 한다.
        .limit(25)
      const { extractFirstImageSrcFromTipTapJSON } = await import("@/lib/utils/tiptap-embeds")
      return (data ?? []).map(({ content, ...row }) => ({
        ...row,
        image: (row.image as string | null) ?? extractFirstImageSrcFromTipTapJSON(content),
      }))
    },
    // v4: active 필터 + limit 25 — 키를 안 올리면 revalidate 창 동안 옛 셰이프가 남는다 (실측 함정)
    ["home-recent-comments-v4"],
    { revalidate: 60, tags: [HOME_TAGS.posts] }
  )().catch(() => [] as unknown[])
}

/**
 * 담벼락 인터리브 비율 (2026-08-20 운영자: "뉴스 대 게시글 비율을 점진적으로 바꿔나갈 거야").
 *
 * `site_settings.home_feed_wall_ratio` 한 행이 다이얼이다 — 코드 배포 없이 SQL 로 조정:
 *   UPDATE site_settings SET value='{"newsPerWall":4,"maxWallCards":6}' WHERE key='home_feed_wall_ratio';
 * 사람 글이 늘수록 newsPerWall 을 내리고 maxWallCards 를 올리면 피드가 게시판 쪽으로 기운다.
 * 행이 없거나 읽기 실패면 5:1·4장 기본값 — 다이얼 고장이 피드를 죽이면 안 된다.
 */
export interface WallFeedRatio {
  newsPerWall: number
  maxWallCards: number
}

const WALL_RATIO_DEFAULT: WallFeedRatio = { newsPerWall: 5, maxWallCards: 4 }

export function getCachedWallRatio(): Promise<WallFeedRatio> {
  return unstable_cache(
    async () => {
      const supabase = createAnonClient()
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "home_feed_wall_ratio")
        .maybeSingle()
      const v = (data?.value ?? {}) as Partial<WallFeedRatio>
      // 정수·범위 강제 — 어드민 오타(0, 음수)가 무한 주입·0나눗셈이 되지 않게
      const news = Math.floor(Number(v.newsPerWall))
      const max = Math.floor(Number(v.maxWallCards))
      return {
        // 하한 3 (2026-08-21 토론 D2): n=2 면 첫 인터리브 슬롯이 2번째 카드로 튀어 올라
        // 첫 화면(fold) 방어가 붕괴한다 — 다이얼로도 그 밑으로는 못 내리게 코드가 지킨다
        newsPerWall: Number.isFinite(news) && news >= 3 ? news : WALL_RATIO_DEFAULT.newsPerWall,
        maxWallCards:
          Number.isFinite(max) && max >= 0 && max <= 10 ? max : WALL_RATIO_DEFAULT.maxWallCards,
      }
    },
    ["home-wall-ratio"],
    { revalidate: 300 }
  )().catch(() => WALL_RATIO_DEFAULT)
}

/**
 * 피드 종단 "내일 경기 예고" 한 줄 (2026-08-21 데드엔드 리포트 Top5-5).
 * 다음 40시간 안의 발매 경기 중 유명 클럽 경기를 EPL 우선으로 하나 골라 문안까지
 * 완성해 내려준다 — 목적지가 /prediction 이라 betman 마켓이 있는 경기만 정직하다.
 * 없으면 null → 피드는 기존 일정 도선으로 폴백.
 */
export function getCachedTomorrowMatchTitle(): Promise<string | null> {
  return unstable_cache(
    async () => {
      const { createServiceRoleClient } = await import("@/lib/supabase/server")
      const { hasFamousClub } = await import("@/lib/match/famous-clubs")
      const { displayTeamName, loadTeamShortMap } = await import("@/lib/match/team-display")
      const { data } = await createServiceRoleClient()
        .from("betman_games")
        .select("home_team_name, away_team_name, match_time, league_code")
        .eq("status", "scheduled")
        .eq("sport", "축구")
        .gt("match_time", new Date().toISOString())
        .lte("match_time", new Date(Date.now() + 40 * 3600_000).toISOString())
        .order("match_time", { ascending: true })
        .limit(40)
      const rows = data ?? []
      if (rows.length === 0) return null
      const shortNames = await loadTeamShortMap()
      const label = (r: (typeof rows)[number]) => ({
        home: displayTeamName(String(r.home_team_name), shortNames),
        away: displayTeamName(String(r.away_team_name), shortNames),
      })
      // 같은 경기의 마켓별 중복 행은 첫 행만 보게 되므로 별도 dedupe 불필요 (정렬이 시간순)
      const pick =
        rows.find((r) => {
          const t = label(r)
          return r.league_code === "EPL" && hasFamousClub(t.home, t.away)
        }) ??
        rows.find((r) => {
          const t = label(r)
          return hasFamousClub(t.home, t.away)
        }) ??
        rows.find((r) => r.league_code === "EPL") ??
        rows[0]
      const t = label(pick)
      const kst = new Date(new Date(pick.match_time as string).getTime() + 9 * 3600_000)
      const kstNow = new Date(Date.now() + 9 * 3600_000)
      const dayDiff = Math.floor(
        (Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) -
          Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())) /
          86400_000
      )
      const day =
        dayDiff <= 0
          ? "오늘"
          : dayDiff === 1
            ? "내일"
            : `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`
      const hh = String(kst.getUTCHours()).padStart(2, "0")
      const mm = String(kst.getUTCMinutes()).padStart(2, "0")
      return `${day} ${hh}:${mm}, ${t.home} – ${t.away}`
    },
    ["home-tomorrow-match"],
    { revalidate: 600 }
  )().catch(() => null)
}

/**
 * 전체 공지 (담벼락 최상단 고정) — 관리자가 is_global_notice=true 로 고정한 글.
 * 컬럼 미적용(마이그레이션 전)이면 error+data:null → [] 로 안전하게 떨어진다.
 */
export function getCachedGlobalNotices(): Promise<unknown[]> {
  return unstable_cache(
    async () => {
      const supabase = createAnonClient()
      const { data } = await supabase
        .from("posts")
        .select("id, title, content")
        .eq("is_global_notice", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(3)
      return data ?? []
    },
    ["home-global-notices"],
    { revalidate: 300, tags: [HOME_TAGS.posts] }
  )().catch(() => [] as unknown[])
}

/** 월드컵 이벤트 상태 (배너 전환용 — closed 면 "우승자 확인") */
export function getCachedWorldcupStatus(): Promise<string | null> {
  return unstable_cache(
    async () => {
      const supabase = createAnonClient()
      const { data } = await supabase
        .from("events")
        .select("status")
        .eq("slug", "worldcup-2026")
        .maybeSingle()
      return (data as { status?: string } | null)?.status ?? null
    },
    ["home-worldcup-status"],
    { revalidate: 300, tags: [HOME_TAGS.events] }
  )().catch(() => null)
}

// ─────────────────────────────────────────────────────────────
// 3) 카드뉴스 / 히어로
// ─────────────────────────────────────────────────────────────

const EMPTY_CARDNEWS = { cards: [] as CardNewsItem[], nextCursor: null as string | null }

/** 카드뉴스 피드 (담벼락 기본 탭) — 실패해도 홈은 뜬다 */
export function getCachedCardNews(): Promise<{ cards: CardNewsItem[]; nextCursor: string | null }> {
  return unstable_cache(async () => fetchCardNews(), ["home-cardnews"], {
    revalidate: 60,
    tags: [HOME_TAGS.cardnews],
  })().catch(() => EMPTY_CARDNEWS)
}

/**
 * 히어로(Top Story) — 운영자 수동 큐레이션(hero_pinned_at, 2026-08-03).
 * 핀이 하나도 없으면 빈 배열 → 호출부에서 최신 이미지 카드로 폴백.
 */
export function getCachedHeroCards(): Promise<CardNewsItem[]> {
  return unstable_cache(async () => fetchHeroCards(), ["home-hero-cards"], {
    revalidate: 60,
    tags: [HOME_TAGS.cardnews],
  })().catch(() => [] as CardNewsItem[])
}
