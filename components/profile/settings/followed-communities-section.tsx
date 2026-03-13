"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Hash, X } from "lucide-react"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"

interface FollowedCommunity {
  community_slug: string
  created_at: string
}

interface FollowedCommunitiesSectionProps {
  communities: FollowedCommunity[]
  onUnfollow: (slug: string) => void
}

export function FollowedCommunitiesSection({
  communities,
  onUnfollow,
}: FollowedCommunitiesSectionProps) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Hash className="text-primary h-5 w-5" />
        <h2 className="font-semibold">팔로우한 게시판</h2>
      </div>

      {communities.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          팔로우한 게시판이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {communities.map((community) => (
            <div
              key={community.community_slug}
              className="bg-muted/50 flex items-center justify-between rounded-lg p-3"
            >
              <span className="font-medium">
                {COMMUNITY_NAMES[community.community_slug] || community.community_slug}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUnfollow(community.community_slug)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
