"use client"

import { useState, useEffect } from "react"
import { MessageSquare, Calendar, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import Link from "next/link"

interface RecentPost {
  id: string
  title: string
  community: string
  comments: number
  timestamp: string
}

interface Match {
  id: string
  league: string
  homeTeam: string
  awayTeam: string
  time: string
  status: string
  score?: string
}

// 커뮤니티 이름 매핑
const COMMUNITY_NAMES: Record<string, string> = {
  "overseas-football": "해외축구",
  "domestic-football": "국내축구",
  "baseball": "야구",
  "basketball": "농구",
  "volleyball": "배구",
  "esports": "e스포츠",
  "free-board": "자유게시판",
  "tips": "정보게시판",
}

// 상대적 시간 포맷팅
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "방금 전"
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}

export function ActivitySidebar() {
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)
  const [isLoadingMatches, setIsLoadingMatches] = useState(true)

  // 최근 댓글이 달린 글 가져오기
  useEffect(() => {
    async function fetchRecentPosts() {
      setIsLoadingPosts(true)
      try {
        const response = await fetch('/api/posts?sort=comments&limit=4')
        if (response.ok) {
          const { posts } = await response.json()
          setRecentPosts(posts.map((p: any) => ({
            id: p.id,
            title: p.title,
            community: COMMUNITY_NAMES[p.community_slug] || p.community_slug,
            comments: p.comment_count || 0,
            timestamp: formatRelativeTime(new Date(p.created_at)),
          })))
        }
      } catch (error) {
        console.error('Failed to fetch recent posts:', error)
      } finally {
        setIsLoadingPosts(false)
      }
    }

    fetchRecentPosts()
  }, [])

  // 오늘의 경기 가져오기
  useEffect(() => {
    async function fetchMatches() {
      setIsLoadingMatches(true)
      try {
        const response = await fetch('/api/matches?status=upcoming&limit=4')
        if (response.ok) {
          const data = await response.json()
          setMatches(data.matches || [])
        }
      } catch (error) {
        console.error('Failed to fetch matches:', error)
      } finally {
        setIsLoadingMatches(false)
      }
    }

    fetchMatches()
  }, [])

  return (
    <div className="space-y-4 sticky top-16">

      {/* ===== 최근 댓글 섹션 ===== */}
      <Card className="bg-card border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 border-b border-border">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="text-[14px] font-bold text-foreground">최근 댓글</h3>
        </div>

        <div className="p-2">
          {isLoadingPosts ? (
            <div className="p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : recentPosts.length > 0 ? (
            recentPosts.map((post) => (
              <Link
                key={post.id}
                href={`/post/${post.id}`}
                className="block px-2 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <p className="text-[13px] font-medium text-foreground line-clamp-1 mb-1.5">
                  {post.title}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] px-1.5 py-0.5 bg-secondary text-muted-foreground rounded font-medium">
                    {post.community}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="w-3 h-3" />
                      {post.comments}
                    </span>
                    <span>{post.timestamp}</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">최근 댓글이 없습니다.</p>
            </div>
          )}
        </div>
      </Card>

      {/* ===== 광고 섹션 ===== */}
      <Card className="bg-card border-border rounded-xl overflow-hidden">
        <div className="p-4">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-6 text-center border border-primary/20">
            <div className="space-y-3">
              <div className="w-16 h-16 mx-auto bg-primary/20 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📢</span>
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-foreground mb-1">광고 영역</h3>
                <p className="text-[12px] text-muted-foreground">
                  광고를 표시할 수 있는 공간입니다
                </p>
              </div>
              <button className="w-full bg-primary text-primary-foreground text-[13px] font-semibold py-2 px-4 rounded-lg hover:bg-primary/90 transition-colors">
                자세히 보기
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* ===== 오늘의 경기 섹션 ===== */}
      <Card className="bg-card border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="text-[14px] font-bold text-foreground">오늘의 경기</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">{matches.length}경기</span>
        </div>

        <div className="divide-y divide-border/50">
          {isLoadingMatches ? (
            <div className="p-4 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : matches.length > 0 ? (
            matches.map((match) => (
              <div key={match.id} className="px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                {/* 리그 + 상태 + 시간 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                      {match.league}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        match.status === "진행 중" || match.status === "live"
                          ? "bg-primary text-primary-foreground"
                          : match.status === "경기 종료" || match.status === "finished"
                            ? "bg-muted text-muted-foreground"
                            : "bg-primary/20 text-primary"
                      }`}
                    >
                      {match.status === "live" ? "진행 중" : match.status === "finished" ? "경기 종료" : match.status === "upcoming" ? "경기 예정" : match.status}
                    </span>
                  </div>
                  <span className="text-[12px] font-medium text-muted-foreground tabular-nums">{match.time}</span>
                </div>

                {/* 팀 vs 팀 */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-foreground">{match.homeTeam}</span>
                    {match.score && (
                      <span className="text-[14px] font-bold text-foreground tabular-nums">
                        {match.score.split("-")[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-foreground">{match.awayTeam}</span>
                    {match.score && (
                      <span className="text-[14px] font-bold text-foreground tabular-nums">
                        {match.score.split("-")[1]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center">
              <p className="text-xs text-muted-foreground">오늘 예정된 경기가 없습니다.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
