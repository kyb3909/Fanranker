import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api-error'

/**
 * GET /api/community/[slug]/ticker
 *
 * Returns ticker items for a community board.
 * Queries news_ticker_items by community_slug, returns up to 20 items
 * from the last 24 hours, ordered by importance DESC, posted_at DESC.
 *
 * Response matches the TickerItem interface in news-ticker.tsx:
 *   { items: [{ id, tag, text, detail }] }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const supabase = createServiceRoleClient()

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: rows, error } = await supabase
      .from('news_ticker_items')
      .select(
        'id, headline_kr, summary_kr, category, importance, ticker_tag, external_url, link_url, thumbnail_url, media_type, score, num_comments, posted_at, source_id, author, original_title'
      )
      .eq('community_slug', slug)
      .gte('posted_at', cutoff)
      .order('importance', { ascending: false })
      .order('posted_at', { ascending: false })
      .limit(20)

    if (error) {
      // Graceful degradation: capture to Sentry but return empty items
      apiError('Ticker query error', 500, error)
      return NextResponse.json({ items: [] })
    }

    // Extract display-friendly source name from URL domain
    function extractSourceName(url: string | null): string | null {
      if (!url) return null
      try {
        const host = new URL(url).hostname.replace(/^www\./, '')
        // Known domain → friendly name
        const DOMAIN_NAMES: Record<string, string> = {
          'variety.com': 'Variety',
          'hollywoodreporter.com': 'Hollywood Reporter',
          'deadline.com': 'Deadline',
          'indiewire.com': 'IndieWire',
          'inverse.com': 'Inverse',
          'nytimes.com': 'NY Times',
          'bbc.com': 'BBC',
          'bbc.co.uk': 'BBC',
          'theguardian.com': 'The Guardian',
          'espn.com': 'ESPN',
          'marca.com': 'Marca',
          'goal.com': 'Goal',
          'skysports.com': 'Sky Sports',
          'theathletic.com': 'The Athletic',
          'chelseafc.com': 'Chelsea FC',
          'reuters.com': 'Reuters',
          'apnews.com': 'AP News',
          'ign.com': 'IGN',
          'imdb.com': 'IMDb',
          'rottentomatoes.com': 'Rotten Tomatoes',
          'youtube.com': 'YouTube',
          'youtu.be': 'YouTube',
        }
        if (DOMAIN_NAMES[host]) return DOMAIN_NAMES[host]
        // i.redd.it, preview.redd.it → skip (not a real source)
        if (host.endsWith('redd.it') || host.endsWith('imgur.com')) return null
        // Fallback: capitalize domain without TLD
        const name = host.split('.')[0]
        return name.charAt(0).toUpperCase() + name.slice(1)
      } catch {
        return null
      }
    }

    // Subreddit display names (fallback)
    const SUBREDDIT_NAMES: Record<string, string> = {
      'reddit-soccer': 'r/soccer',
      'reddit-movies': 'r/movies',
    }

    // Map DB rows → frontend TickerItem format
    const items = (rows || []).map(row => ({
      id: `ticker-${row.id}`,
      tag: row.ticker_tag as 'live' | 'breaking' | 'result',
      text: row.headline_kr,
      detail: {
        summary: row.summary_kr ? row.summary_kr.split('\n') : [],
        source: extractSourceName(row.link_url) || SUBREDDIT_NAMES[row.source_id] || row.source_id,
        sourceUrl: row.link_url || row.external_url,
        redditUrl: row.external_url,
        thumbnailUrl: row.thumbnail_url || null,
        mediaType: row.media_type || null,
        participants: row.num_comments || 0,
        score: row.score || 0,
        category: row.category,
        importance: row.importance,
        postedAt: row.posted_at,
        originalTitle: row.original_title,
      },
    }))

    return NextResponse.json(
      { items },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
        },
      }
    )
  } catch (error) {
    // Graceful degradation: return empty items instead of error response
    // but still capture to Sentry via apiError side-effect
    apiError('Ticker API error', 500, error)
    return NextResponse.json({ items: [] })
  }
}
