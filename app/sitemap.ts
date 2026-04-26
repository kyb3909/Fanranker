import type { MetadataRoute } from "next"
import { SITE_CONFIG } from "@/lib/seo"
import { createServerAnonClient } from "@/lib/supabase"

const COMMUNITIES = [
  "football",
  "baseball",
  "basketball",
  "volleyball",
  "game",
  "movies",
  "music",
  "idol",
  "anime",
  "free-board",
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_CONFIG.url

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/prediction`, changeFrequency: "hourly", priority: 0.95 },
    { url: `${base}/explore`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/share`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/content-policy`, changeFrequency: "yearly", priority: 0.2 },
  ]

  const communityPages: MetadataRoute.Sitemap = COMMUNITIES.map((slug) => ({
    url: `${base}/community/${slug}`,
    changeFrequency: "daily",
    priority: 0.8,
  }))

  // 최근 게시글 (최대 200개)
  let postPages: MetadataRoute.Sitemap = []
  try {
    const supabase = createServerAnonClient()
    const { data: posts } = await supabase
      .from("posts")
      .select("id, updated_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200)

    postPages = (posts || []).map((p) => ({
      url: `${base}/post/${p.id}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: "weekly",
      priority: 0.6,
    }))
  } catch {
    // sitemap 생성 실패 시 정적 페이지만 반환
  }

  return [...staticPages, ...communityPages, ...postPages]
}
