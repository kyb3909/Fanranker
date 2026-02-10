/**
 * Reddit 시드 봇
 *
 * 레딧에서 게시물을 가져와 메인 피드에 시드 데이터로 등록합니다.
 * 오픈 전 컨텐츠를 미리 채우기 위한 용도입니다.
 *
 * 사용법:
 *   1. supabase migration 025 실행 (봇 프로필 등록)
 *   2. .env에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정
 *   3. pnpm reddit-seed
 *
 * Reddit 앱 등록 없이 RSS 기반 공개 API(reddit-rss-api.deno.dev)를 사용합니다.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const BOT_USER_ID = 'user_reddit_seed_bot'
const USER_AGENT = 'RedditSeedBot/1.0 (by /u/FanRanker)'

// 서브레딧 → community_slug 매핑
const SUBREDDIT_TO_COMMUNITY: Record<string, string> = {
  soccer: 'overseas-football',
  football: 'overseas-football',
  premierleague: 'overseas-football',
  fifa: 'overseas-football',
  baseball: 'baseball',
  mlb: 'baseball',
  kbo: 'baseball',
  nba: 'basketball',
  basketball: 'basketball',
  volleyball: 'volleyball',
  esports: 'esports',
  leagueoflegends: 'esports',
  valorant: 'esports',
}

// soccer 하루 top 10개 (RSS API: sort=desc = 최신순, 상단이 오늘 top에 가깝게)
const SUBREDDIT = 'soccer'
const LIMIT = 10

interface RssItem {
  title: string
  link: string
  author?: string
  isoDate?: string
  id?: string
  message?: string
}

interface RssApiResponse {
  items?: RssItem[]
}

function textToTipTapJson(text: string): object {
  const trimmed = text?.trim()
  if (!trimmed) {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '(원문에서 가져온 게시물입니다.)' }],
        },
      ],
    }
  }
  const paragraphs = trimmed.split(/\n\n+/).filter((p) => p.trim()).slice(0, 20)
  const blocks = paragraphs.map((p) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: p.slice(0, 5000) }],
  }))
  return { type: 'doc', content: blocks }
}

const RSS_API_BASE = 'https://reddit-rss-api.deno.dev'

function extractPostIdFromRedditUrl(link: string): string | null {
  const match = link.match(/reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)/i)
  return match ? match[1] : null
}

async function fetchFullPostBody(subreddit: string, postId: string): Promise<string | null> {
  const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) return null
    const json = await res.json()
    const post = json?.[0]?.data?.children?.[0]?.data
    const selftext = post?.selftext?.trim()
    return selftext || null
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchRedditViaRss(subreddit: string, limit: number): Promise<RssItem[]> {
  const url = `${RSS_API_BASE}/r/${subreddit}?sort=desc&count=${limit}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) {
    throw new Error(`RSS API error: ${res.status} ${res.statusText}`)
  }
  const data: RssApiResponse = await res.json()
  return data.items ?? []
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('환경 변수가 필요합니다: .env.local 또는 .env에 설정하세요.')
    if (!supabaseUrl) console.error('  - NEXT_PUBLIC_SUPABASE_URL')
    if (!serviceKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  let inserted = 0
  let skipped = 0

  const communitySlug = SUBREDDIT_TO_COMMUNITY[SUBREDDIT.toLowerCase()] ?? 'overseas-football'

  try {
    const items = await fetchRedditViaRss(SUBREDDIT, LIMIT)
    console.log(`[${SUBREDDIT}] ${items.length}개 fetch (RSS) → ${communitySlug}`)

    for (const item of items) {
      const title = (item.title ?? '(제목 없음)').slice(0, 200)
      let body = item.message?.trim() || ''

      const postId = item.link ? extractPostIdFromRedditUrl(item.link) : null
      if (postId) {
        const fullBody = await fetchFullPostBody(SUBREDDIT, postId)
        if (fullBody) body = fullBody
        await sleep(1200)
      }
      if (!body && item.link) body = `원문: ${item.link}`
      const content = textToTipTapJson(body)

      const { error } = await supabase.from('posts').insert({
        user_id: BOT_USER_ID,
        community_slug: communitySlug,
        title,
        content,
      })

      if (error) {
        if (error.code === '23505') {
          skipped++
          continue
        }
        console.error(`  [${item.id ?? title}] insert error:`, error.message)
        skipped++
        continue
      }
      inserted++
      console.log(`  ✓ ${title.slice(0, 50)}...`)
    }
  } catch (e) {
    console.error(`[${SUBREDDIT}] fetch error:`, e)
  }

  console.log(`\n완료: ${inserted}개 등록, ${skipped}개 스킵`)
}

main()
