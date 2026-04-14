// data/agents/scripts/publish-run.js
//
// Phase B Final Publisher (T0 deterministic)
// formatted → published
//
// publish 객체의 paragraphs를 TipTap JSON으로 변환하고 posts 테이블에 insert.
// external_key (UNIQUE)로 멱등성 보장 — 재실행해도 중복 발행 안됨.
// flair_id는 seo_formatter가 이미 선택한 것 그대로 사용.
//
// 봇 계정 매핑은 BOT_BY_COMMUNITY. 없는 종목은 skip.
//
// 사용:
//   node data/agents/scripts/publish-run.js
//   node data/agents/scripts/publish-run.js --dry-run
//   node data/agents/scripts/publish-run.js --limit=3

import supabase from '../../crawlers/core/db.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null

// community_slug → 봇 user_id 매핑.
// profiles 테이블에 해당 user_id가 미리 생성돼 있어야 함 (migration 035).
const BOT_BY_COMMUNITY = {
  football: 'user_bot_soccer_kr',
  basketball: 'user_bot_nba_kr',
  baseball: 'user_bot_mlb_kr',
  // volleyball, game, movies 등은 봇 계정 추가 후 여기 등록
}

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [publisher] ${msg}\n`)
}

// URL 패턴 감지 — lib/utils/tiptap-embeds.ts와 동기화 유지
const EMBED_PATTERNS = {
  youtube:
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/([a-zA-Z0-9_-]+)/,
  x: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/,
  image: /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i,
  redditImage: /i\.redd\.it|imgur\.com\/[a-zA-Z0-9]+(?:\.[a-z]+)?(?:\?|#|$)/i,
}

/** URL로부터 TipTap embed/image 노드 생성. 감지 실패 시 null. */
function buildMediaNode(url) {
  if (!url) return null
  const yt = url.match(EMBED_PATTERNS.youtube)
  if (yt) {
    return {
      type: 'embed',
      attrs: {
        provider: 'youtube',
        url: `https://www.youtube.com/watch?v=${yt[1]}`,
        thumbnail_url: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`,
      },
    }
  }
  if (EMBED_PATTERNS.instagram.test(url)) {
    return { type: 'embed', attrs: { provider: 'instagram', url } }
  }
  if (EMBED_PATTERNS.x.test(url)) {
    return { type: 'embed', attrs: { provider: 'x', url } }
  }
  if (EMBED_PATTERNS.image.test(url) || EMBED_PATTERNS.redditImage.test(url)) {
    return { type: 'image', attrs: { src: url } }
  }
  return null
}

/** reservoir item의 urls를 보고 대표 미디어 노드 하나 추출.
 *  우선순위:
 *    1. socials의 youtube/x/instagram embed
 *    2. article URL 자체가 embed 가능한 경우 (youtube.com 직링 등)
 *    3. socials의 image
 *    4. og:image fallback (article 소스에서 긁은 대표 이미지) */
function pickMediaNode(item) {
  const socials = item.urls?.socials || []
  // 1) socials에서 youtube/twitter/instagram 우선
  for (const s of socials) {
    const node = buildMediaNode(s.url)
    if (node && node.type === 'embed') return node
  }
  // 2) article URL이 youtube/twitter 같은 것일 수도
  const articleNode = buildMediaNode(item.urls?.article)
  if (articleNode) return articleNode
  // 3) image type socials (i.redd.it, imgur 등)
  for (const s of socials) {
    const node = buildMediaNode(s.url)
    if (node) return node
  }
  // 4) og:image fallback — 기사 원본의 대표 이미지
  const ogImage = item.urls?.og_image
  if (ogImage && /^https?:\/\//i.test(ogImage)) {
    return { type: 'image', attrs: { src: ogImage } }
  }
  return null
}

/** paragraphs + optional media → TipTap doc.
 *  media는 맨 위에 배치. 텍스트만 있으면 fallback. */
function buildTipTapDoc(paragraphs, mediaNode) {
  const content = []
  if (mediaNode) content.push(mediaNode)
  for (const text of paragraphs) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: String(text).slice(0, 5000) }],
    })
  }
  return { type: 'doc', content }
}

async function main() {
  log(`dry=${dryRun} limit=${limit ?? 'none'}`)

  let query = supabase
    .from('news_reservoir')
    .select('id, source, urls, draft, publish, external_key, audit')
    .eq('status', 'formatted')
    .order('created_at', { ascending: true })

  if (limit) query = query.limit(limit)

  const { data: items, error } = await query

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }

  log(`fetched ${items.length} formatted items`)
  if (items.length === 0) return

  const totals = {
    processed: 0,
    published: 0,
    skipped_no_bot: 0,
    skipped_already: 0,
    errors: 0,
  }

  for (const item of items) {
    const pub = item.publish || {}
    const communitySlug = pub.communitySlug
    const title = pub.title
    const paragraphs = pub.paragraphs
    const flairId = pub.flairId || null

    if (!communitySlug || !title || !Array.isArray(paragraphs) || paragraphs.length === 0) {
      log(`  [ERR] invalid publish meta for ${item.id}`)
      totals.errors++
      continue
    }

    const botUserId = BOT_BY_COMMUNITY[communitySlug]
    if (!botUserId) {
      log(`  [SKIP] no bot account for community=${communitySlug}`)
      totals.skipped_no_bot++
      continue
    }

    // 멱등성: external_key 이미 있으면 skip
    if (item.external_key) {
      log(`  [SKIP] already has external_key=${item.external_key}`)
      totals.skipped_already++
      continue
    }

    const mediaNode = pickMediaNode(item)
    const content = buildTipTapDoc(paragraphs, mediaNode)
    const externalKey = `news_agent:${item.id}`

    const mediaLabel = mediaNode
      ? mediaNode.type === 'embed'
        ? `embed:${mediaNode.attrs.provider}`
        : mediaNode.type
      : 'text-only'
    log(`  PUBLISH — [${communitySlug}] (${mediaLabel}) ${title.slice(0, 60)}`)

    if (dryRun) {
      totals.published++
      continue
    }

    // 1) posts insert
    const { data: postRow, error: insErr } = await supabase
      .from('posts')
      .insert({
        user_id: botUserId,
        community_slug: communitySlug,
        title,
        content,
        flair_id: flairId,
      })
      .select('id')
      .single()

    if (insErr) {
      log(`  [ERR] posts insert: ${insErr.message}`)
      totals.errors++
      continue
    }

    // 2) reservoir 업데이트 (external_key + status + audit)
    const newAudit = [
      ...(item.audit || []),
      {
        at: new Date().toISOString(),
        agent: 'final_publisher',
        action: 'publish',
        status_from: 'formatted',
        status_to: 'published',
        tier: 'T0',
        verdict: 'success',
        message: `post_id=${postRow.id} community=${communitySlug} bot=${botUserId} flair=${flairId || 'null'}`,
      },
    ]

    const mergedPublish = {
      ...pub,
      postId: postRow.id,
      botUserId,
      publishedAt: new Date().toISOString(),
    }

    const { error: updErr } = await supabase
      .from('news_reservoir')
      .update({
        status: 'published',
        publish: mergedPublish,
        external_key: externalKey,
        audit: newAudit,
      })
      .eq('id', item.id)

    if (updErr) {
      // 포스트는 이미 들어갔는데 reservoir 업데이트 실패 → 다음 cycle에서 external_key 중복 감지 실패할 수 있음.
      // 경보성 로그 남기고 진행. 운영자가 수동 정리.
      log(`  [CRIT] posts inserted (${postRow.id}) but reservoir update failed: ${updErr.message}`)
      totals.errors++
      continue
    }

    totals.processed++
    totals.published++
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) log(`  ${k.padEnd(20)}: ${v}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
