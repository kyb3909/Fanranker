// data/agents/scripts/agg-fetch-run.js
//
// 커뮤니티 애그리게이터 2단계: 상세 수집 + 미디어 추출 + 이미지 rehost (T0, LLM 없음)
// ingested → fetched
//
// 원본 글 페이지에서 본문 발췌 + 미디어(이미지/유튜브/트위터)를 추출하고,
// 이미지는 Supabase storage 'posts' 버킷 agg/ 경로로 rehost (핫링크 차단 회피 + next/image 호환).
// TipTap src는 업로드 라우트와 동일한 /storage/posts/... 프록시 경로 사용.
//
// 사용:
//   node data/agents/scripts/agg-fetch-run.js
//   node data/agents/scripts/agg-fetch-run.js --limit=5
//   node data/agents/scripts/agg-fetch-run.js --dry-run   (rehost/DB 갱신 없이 추출 결과만)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import supabase from '../../crawlers/core/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'aggregator.json'), 'utf8'))

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

// WebP 변환용 sharp — 업로드 라우트(app/api/upload/image)와 동일한 설정(1200px, q80).
// VPS 에 sharp 미설치면 원본 포맷 그대로 rehost 하고 경고만 남긴다 (파이프라인 중단 방지).
let sharp = null
try {
  sharp = (await import('sharp')).default
} catch {
  /* fallback: 원본 그대로 업로드 */
}

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [agg-fetch] ${msg}\n`)
}

/** 소스별 본문 영역 추출. 실패 시 전체 HTML 반환 (미디어 추출은 되게). */
function extractArticle(source, html) {
  if (source === 'theqoo') {
    const m = html.match(/<article itemprop="articleBody">([\s\S]*?)<\/article>/)
    if (m) return m[1]
  }
  if (source.startsWith('instiz')) {
    const m = html.match(/id="memo_content_1"([\s\S]*?)<\/td>/)
    if (m) return m[1]
  }
  return html
}

function extractMedia(articleHtml) {
  const media = []
  // 유튜브 (iframe embed 또는 링크)
  const ytRe =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g
  let m
  const seenYt = new Set()
  while ((m = ytRe.exec(articleHtml)) !== null) {
    if (seenYt.has(m[1])) continue
    seenYt.add(m[1])
    media.push({ type: 'youtube', url: `https://www.youtube.com/watch?v=${m[1]}` })
  }
  // 트위터/X 링크
  const xRe = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/\w+\/status(?:es)?\/\d+/g
  const seenX = new Set()
  while ((m = xRe.exec(articleHtml)) !== null) {
    if (seenX.has(m[0])) continue
    seenX.add(m[0])
    media.push({ type: 'x', url: m[0] })
  }
  // 이미지 (본문 내 절대경로만 — 레이아웃/이모티콘 제외 목적으로 http 시작만 수집)
  const imgRe = /<img[^>]*src="(https?:\/\/[^"]+)"[^>]*>/g
  const seenImg = new Set()
  while ((m = imgRe.exec(articleHtml)) !== null) {
    const url = m[1]
    if (seenImg.has(url)) continue
    if (/emoticon|emoji|icon|logo|avatar/i.test(url)) continue
    seenImg.add(url)
    media.push({ type: 'image', url })
  }
  return media
}

function extractExcerpt(articleHtml) {
  return articleHtml
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1600)
}

function extForContentType(ct, url) {
  if (ct?.includes('webp')) return 'webp'
  if (ct?.includes('png')) return 'png'
  if (ct?.includes('gif')) return 'gif'
  if (ct?.includes('jpeg') || ct?.includes('jpg')) return 'jpg'
  const m = url.match(/\.(webp|png|gif|jpe?g)(\?|#|$)/i)
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
}

/** 이미지 다운로드 → WebP 변환 → storage 'posts' 버킷 rehost → /storage/posts/... 경로 반환 */
async function rehostImage(reservoirId, idx, imageUrl, referer) {
  const res = await fetch(imageUrl, {
    headers: { 'User-Agent': UA, Referer: referer },
  })
  if (!res.ok) throw new Error(`img HTTP ${res.status}`)
  const ct = res.headers.get('content-type') || ''
  if (!ct.startsWith('image/')) throw new Error(`not image: ${ct}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_IMAGE_BYTES) throw new Error(`too large: ${buf.length}`)

  let outBuf = buf
  let outCt = ct
  let ext = extForContentType(ct, imageUrl)
  if (sharp) {
    try {
      const isGif = ct.includes('gif')
      outBuf = await sharp(buf, isGif ? { animated: true, pages: -1 } : undefined)
        .resize(1200, undefined, { withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 80 })
        .toBuffer()
      outCt = 'image/webp'
      ext = 'webp'
    } catch (e) {
      log(`    [WARN] webp 변환 실패 (${e.message}) — 원본 포맷으로 rehost`)
    }
  } else {
    log(`    [WARN] sharp 미설치 — 원본 포맷으로 rehost (data/agents 에서 npm install 필요)`)
  }

  const path = `agg/${reservoirId}/${idx}.${ext}`
  const { error } = await supabase.storage
    .from('posts')
    .upload(path, outBuf, { contentType: outCt, upsert: true })
  if (error) throw new Error(`upload: ${error.message}`)
  return `/storage/posts/${path}`
}

async function main() {
  log(`dry=${dryRun} limit=${limit}`)

  const { data: items, error } = await supabase
    .from('agg_reservoir')
    .select('id, source, source_url, source_title, body_excerpt, media, audit')
    .eq('status', 'ingested')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }
  log(`대상 ${items.length}건`)

  for (const item of items) {
    try {
      let media
      let excerpt
      if (item.source === 'reddit') {
        // scout 이 hot.json 에서 media/excerpt 를 이미 확보 — 여기선 rehost 만
        media = item.media || []
        excerpt = item.body_excerpt || item.source_title
      } else {
        const res = await fetch(item.source_url, {
          headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
        })
        if (!res.ok) throw new Error(`detail HTTP ${res.status}`)
        const html = await res.text()
        const article = extractArticle(item.source, html)
        media = extractMedia(article)
        excerpt = extractExcerpt(article)
      }

      log(`  ${item.source_title.slice(0, 40)} — media ${media.length} (img ${media.filter((x) => x.type === 'image').length})`)
      if (dryRun) {
        for (const mm of media.slice(0, 6)) log(`    [${mm.type}] ${mm.url.slice(0, 90)}`)
        continue
      }

      // embedFirst 소스(여돌/홈마): X·유튜브 임베드가 있으면 이미지 rehost 스킵 —
      // 홈마 원본을 퍼오지 않고 임베드(출처 노출)로만 소비한다.
      const embedFirst =
        CONFIG.sources[item.source]?.embedFirst && media.some((mm) => mm.type !== 'image')

      // 이미지 rehost (최대 MAX_IMAGES장)
      let imgCount = 0
      for (const mm of media) {
        if (mm.type !== 'image') continue
        if (embedFirst) {
          mm.skipped = 'embed_first'
          continue
        }
        if (imgCount >= MAX_IMAGES) {
          mm.skipped = true
          continue
        }
        try {
          mm.rehosted_url = await rehostImage(item.id, imgCount, mm.url, item.source_url)
          imgCount++
        } catch (e) {
          log(`    [WARN] rehost 실패 (${e.message}) — 건너뜀: ${mm.url.slice(0, 70)}`)
          mm.rehost_error = e.message
        }
      }

      const hasUsableMedia =
        media.some((mm) => mm.rehosted_url) || media.some((mm) => mm.type !== 'image')

      const audit = [
        ...(item.audit || []),
        { at: new Date().toISOString(), stage: 'fetch', media: media.length, rehosted: imgCount },
      ]

      const { error: upErr } = await supabase
        .from('agg_reservoir')
        .update({
          status: hasUsableMedia ? 'fetched' : 'rejected',
          reject_reason: hasUsableMedia ? null : 'no_usable_media',
          body_excerpt: excerpt,
          media,
          audit,
        })
        .eq('id', item.id)
      if (upErr) throw new Error(`update: ${upErr.message}`)
      if (!hasUsableMedia) log(`    → rejected (쓸 수 있는 미디어 없음 — 텍스트 전용 글)`)
    } catch (e) {
      log(`  [ERR] ${item.source_url}: ${e.message}`)
      await supabase
        .from('agg_reservoir')
        .update({
          status: 'rejected',
          reject_reason: `fetch_error: ${e.message}`.slice(0, 200),
        })
        .eq('id', item.id)
    }
  }
  log('완료')
}

main().catch((e) => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})
