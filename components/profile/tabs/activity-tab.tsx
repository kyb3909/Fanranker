"use client"

import { Card } from "@/components/ui/card"
import { FileText, ThumbsUp, MessageSquare, ImageIcon } from "lucide-react"
import Link from "@/components/ui/app-link"
import Image from "next/image"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"

interface PublicPost {
  id: string
  title: string
  vote_count: number
  comment_count: number
  created_at: string
  community_slug: string
}

interface PixelArtInfo {
  pixel_art_id: string
  purchased_at: string
  pixel_art_items: {
    id: string
    slug: string
    name: string
    image_url: string
    category: string
  }
}

interface ActivityTabProps {
  recentPosts: PublicPost[]
  pixelArts: PixelArtInfo[]
}

export function ActivityTab({ recentPosts, pixelArts }: ActivityTabProps) {
  return (
    <div className="space-y-4">
      {/* 최근 작성글 */}
      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="text-primary h-4 w-4" />
            <h3 className="text-sm font-semibold">최근 작성글</h3>
          </div>
          {recentPosts.length > 0 && (
            <Link href="/my-posts" className="text-primary text-xs hover:underline">
              전체보기
            </Link>
          )}
        </div>
        {recentPosts.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <FileText className="text-muted-foreground/40 mb-2 h-10 w-10" />
            <p className="text-muted-foreground text-sm">작성한 글이 없습니다.</p>
          </div>
        ) : (
          <div className="divide-border divide-y">
            {recentPosts.slice(0, 8).map((post) => (
              <Link
                key={post.id}
                href={`/post/${post.id}`}
                className="hover:bg-muted/50 block px-4 py-3 transition-colors"
              >
                <p className="text-foreground truncate text-sm font-medium">{post.title}</p>
                <div className="mt-1 flex items-center justify-between">
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span className="bg-muted rounded px-1.5 py-0.5 text-[10px]">
                      {COMMUNITY_NAMES[post.community_slug] || post.community_slug}
                    </span>
                    <span>{formatRelativeTime(new Date(post.created_at))}</span>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-0.5">
                      <ThumbsUp className="h-3 w-3" />
                      {post.vote_count || 0}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="h-3 w-3" />
                      {post.comment_count || 0}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* 픽셀아트 컬렉션 */}
      {pixelArts.length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="border-border flex items-center gap-2 border-b px-4 py-3">
            <ImageIcon className="text-primary h-4 w-4" />
            <h3 className="text-sm font-semibold">픽셀아트 컬렉션</h3>
            <span className="text-muted-foreground ml-auto text-xs">{pixelArts.length}개</span>
          </div>
          <div className="grid grid-cols-4 gap-3 p-4 sm:grid-cols-6">
            {pixelArts.map((pa) => (
              <div key={pa.pixel_art_id} className="flex flex-col items-center gap-1">
                <div className="bg-muted flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg">
                  <Image
                    src={pa.pixel_art_items.image_url}
                    alt={pa.pixel_art_items.name}
                    width={48}
                    height={48}
                    className="object-contain"
                    style={{ imageRendering: "pixelated" }}
                    unoptimized
                  />
                </div>
                <span className="text-muted-foreground max-w-full truncate text-[10px]">
                  {pa.pixel_art_items.name}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
