"use client"

import { useMemo } from "react"
import { MinimalPredictionContent } from "@/components/minimal-sport/minimal-prediction-content"
import type { TalkItem } from "@/components/minimal-sport/minimal-talk-list"

interface PredictionClientProps {
  initialCategories?: unknown[]
  initialRecentComments?: unknown[]
}

export function PredictionClient({
  initialCategories,
  initialRecentComments,
}: PredictionClientProps) {
  const talkItems = useMemo<TalkItem[]>(() => {
    const list = (initialRecentComments ?? []) as Array<{
      id: string
      title: string
      community_slug: string | null
      comment_count: number | null
    }>
    return list.map((t) => ({
      id: t.id,
      title: t.title,
      community_slug: t.community_slug,
      comment_count: t.comment_count,
    }))
  }, [initialRecentComments])

  const groupedCategories = useMemo(
    () =>
      (initialCategories ?? []) as Array<{
        id: number | string
        slug: string
        name: string
        icon: string | null
        sort_order: number
        parent_slug: string | null
      }>,
    [initialCategories]
  )

  return <MinimalPredictionContent categories={groupedCategories} recentComments={talkItems} />
}
