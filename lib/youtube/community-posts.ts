/**
 * YouTube "게시물(커뮤니티)" 탭 스크래핑 — 영상과 달리 공식 API/RSS 가 없어
 * 페이지 HTML의 ytInitialData JSON 에서 backstagePostRenderer 를 추출한다.
 *
 * ⚠️ 서버 전용 + fragile: 유튜브가 마크업/구조를 바꾸면 깨질 수 있다. 실패 시 빈 배열 반환
 * (영상 섹션·페이지는 영향 없음). 클라이언트에서 직접 호출 금지.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

export interface CommunityPost {
  postId: string
  text: string
  imageUrl: string | null
  publishedText: string
  postUrl: string
}

interface YtRun {
  text?: string
}
interface YtThumb {
  url?: string
}
interface BackstagePost {
  postId?: string
  contentText?: { runs?: YtRun[] }
  publishedTimeText?: { runs?: YtRun[] }
  backstageAttachment?: {
    backstageImageRenderer?: { image?: { thumbnails?: YtThumb[] } }
    postMultiImageRenderer?: {
      images?: Array<{ backstageImageRenderer?: { image?: { thumbnails?: YtThumb[] } } }>
    }
  }
}

function extractYtInitialData(html: string): unknown {
  const patterns = [
    /var ytInitialData = (\{[\s\S]*?\});<\/script>/,
    /ytInitialData"\]\s*=\s*(\{[\s\S]*?\});\s*<\/script>/,
    /ytInitialData\s*=\s*(\{[\s\S]*?\});\s*(?:var|window|<\/script>)/,
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m) {
      try {
        return JSON.parse(m[1])
      } catch {
        /* 다음 패턴 시도 */
      }
    }
  }
  return null
}

function findBackstagePosts(root: unknown): BackstagePost[] {
  const out: BackstagePost[] = []
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return
    const obj = o as Record<string, unknown>
    if (obj.backstagePostRenderer) out.push(obj.backstagePostRenderer as BackstagePost)
    for (const k in obj) walk(obj[k])
  }
  walk(root)
  return out
}

/** @handle 의 커뮤니티 게시물 최신순. 실패하면 빈 배열. */
export async function fetchCommunityPosts(handle: string, limit = 8): Promise<CommunityPost[]> {
  const clean = handle.replace(/^@/, "")
  let html: string
  try {
    const res = await fetch(`https://www.youtube.com/@${clean}/posts`, {
      headers: { "User-Agent": UA, "Accept-Language": "ko,en;q=0.8" },
      cache: "no-store",
    })
    if (!res.ok) return []
    html = await res.text()
  } catch {
    return []
  }

  const data = extractYtInitialData(html)
  if (!data) return []

  const posts: CommunityPost[] = []
  for (const p of findBackstagePosts(data)) {
    if (!p.postId) continue
    const text = (p.contentText?.runs ?? []).map((r) => r.text ?? "").join("")
    const publishedText = (p.publishedTimeText?.runs ?? []).map((r) => r.text ?? "").join("")
    const att = p.backstageAttachment
    const thumbs =
      att?.backstageImageRenderer?.image?.thumbnails ??
      att?.postMultiImageRenderer?.images?.[0]?.backstageImageRenderer?.image?.thumbnails
    const imageUrl = thumbs && thumbs.length ? (thumbs[thumbs.length - 1].url ?? null) : null
    posts.push({
      postId: p.postId,
      text,
      imageUrl,
      publishedText,
      postUrl: `https://www.youtube.com/post/${p.postId}`,
    })
    if (posts.length >= limit) break
  }
  return posts
}
