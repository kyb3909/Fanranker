import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

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
        'id, headline_kr, summary_kr, category, importance, ticker_tag, external_url, link_url, score, num_comments, posted_at, source_id, author, original_title'
      )
      .eq('community_slug', slug)
      .gte('posted_at', cutoff)
      .order('importance', { ascending: false })
      .order('posted_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Ticker query error:', error)
      return NextResponse.json({ items: [] })
    }

    // Map DB rows → frontend TickerItem format
    const items = (rows || []).map(row => ({
      id: `ticker-${row.id}`,
      tag: row.ticker_tag as 'live' | 'breaking' | 'result',
      text: row.headline_kr,
      detail: {
        summary: row.summary_kr ? row.summary_kr.split('\n') : [],
        source: row.source_id === 'reddit-soccer' ? 'r/soccer' : row.source_id,
        sourceUrl: row.link_url || row.external_url,
        redditUrl: row.external_url,
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
    console.error('Ticker API error:', error)
    return NextResponse.json({ items: [] })
  }
}
