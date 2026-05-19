"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Coins,
  Award,
  FileText,
  MessageSquare,
  Target,
  Loader2,
  ShieldCheck,
  Palette,
  AlertTriangle,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface UserDetail {
  profile: {
    user_id: string
    nickname: string
    avatar_url: string | null
    role: string
    is_expert: boolean
    is_artist: boolean
    created_at: string
  }
  economy: {
    tokenBalance: number
    totalTokensEarned: number
    goldBalance: number
  }
  activity: {
    postCount: number
    commentCount: number
    predictionCount: number
  }
  cards: Array<{
    id: string
    card_type: string
    reason: string
    report_id: string | null
    issued_at: string
    expires_at: string | null
  }>
  suspensions: Array<{
    id: string
    reason: string
    suspended_at: string
    suspended_until: string | null
  }>
  recentPosts: Array<{
    id: string
    title: string
    community_slug: string
    created_at: string
  }>
}

type Tab = "overview" | "economy" | "activity" | "sanctions"

const cardTypeLabels: Record<string, string> = {
  yellow: "옐로카드",
  red: "레드카드",
}

export function UserDetailTabs({ userId }: { userId: string }) {
  const [data, setData] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("overview")
  const [actionLoading, setActionLoading] = useState(false)

  // Economy adjustment
  const [adjustType, setAdjustType] = useState<"token" | "gold">("token")
  const [adjustAmount, setAdjustAmount] = useState("")
  const [adjustReason, setAdjustReason] = useState("")

  useEffect(() => {
    fetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [userId])

  const handleRoleChange = async (role: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setData((prev) => (prev ? { ...prev, profile: { ...prev.profile, role } } : null))
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "오류 발생",
      })
    } finally {
      setActionLoading(false)
    }
  }

  const handleAdjustEconomy = async () => {
    if (!adjustAmount || !adjustReason) {
      toast({
        variant: "destructive",
        title: "입력 오류",
        description: "금액과 사유를 입력해주세요.",
      })
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/adjust-economy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: adjustType,
          amount: parseInt(adjustAmount),
          reason: adjustReason,
          idempotency_key: crypto.randomUUID(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      // Refresh data
      const refreshed = await fetch(`/api/admin/users/${userId}`).then((r) => r.json())
      setData(refreshed)
      setAdjustAmount("")
      setAdjustReason("")
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "오류 발생",
      })
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <div className="text-muted-foreground py-12 text-center">사용자를 찾을 수 없습니다.</div>
  }

  const { profile, economy, activity, cards, suspensions, recentPosts } = data
  const now = Date.now()

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "개요" },
    { key: "economy", label: "경제" },
    { key: "activity", label: "활동" },
    { key: "sanctions", label: "제재" },
  ]

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={profile.avatar_url || ""} alt={profile.nickname || "사용자"} />
              <AvatarFallback className="text-lg">{profile.nickname?.[0] ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{profile.nickname}</h2>
                <Badge className="text-xs">{profile.role}</Badge>
                {profile.is_expert && (
                  <Badge variant="default" className="bg-green-600 text-xs">
                    <ShieldCheck className="mr-0.5 h-3 w-3" />
                    전문가
                  </Badge>
                )}
                {profile.is_artist && (
                  <Badge variant="default" className="bg-purple-600 text-xs">
                    <Palette className="mr-0.5 h-3 w-3" />
                    아티스트
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                ID: <code className="text-xs">{profile.user_id}</code>
                {" · "}가입: {new Date(profile.created_at).toLocaleDateString("ko-KR")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {["user", "moderator", "admin"].map((role) => (
                <Button
                  key={role}
                  variant={profile.role === role ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRoleChange(role)}
                  disabled={actionLoading || profile.role === role}
                >
                  {role}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs">토큰 잔액</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-500" />
              <span className="text-xl font-bold">{economy.tokenBalance.toLocaleString()}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs">골드 잔액</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <span className="text-xl font-bold">{economy.goldBalance.toLocaleString()}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs">게시글</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="text-xl font-bold">{activity.postCount}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-xs">예측</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              <span className="text-xl font-bold">{activity.predictionCount}</span>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "economy" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">토큰</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{economy.tokenBalance.toLocaleString()}</p>
                <p className="text-muted-foreground text-xs">
                  총 획득: {economy.totalTokensEarned.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">골드</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{economy.goldBalance.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">경제 수동 조정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant={adjustType === "token" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAdjustType("token")}
                >
                  토큰
                </Button>
                <Button
                  variant={adjustType === "gold" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAdjustType("gold")}
                >
                  골드
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="금액 (음수 가능)"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-40"
                />
                <Input
                  placeholder="사유"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleAdjustEconomy} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "적용"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "activity" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 pt-6">
                <FileText className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{activity.postCount}</p>
                  <p className="text-muted-foreground text-xs">게시글</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 pt-6">
                <MessageSquare className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{activity.commentCount}</p>
                  <p className="text-muted-foreground text-xs">댓글</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 pt-6">
                <Target className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{activity.predictionCount}</p>
                  <p className="text-muted-foreground text-xs">예측</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">최근 게시글</CardTitle>
            </CardHeader>
            <CardContent>
              {recentPosts.length === 0 ? (
                <p className="text-muted-foreground text-sm">게시글이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {recentPosts.map((post) => (
                    <div key={post.id} className="flex items-center justify-between text-sm">
                      <span className="flex-1 truncate">{post.title}</span>
                      <div className="ml-4 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {post.community_slug}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {new Date(post.created_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "sanctions" && (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">카드 이력</h3>
            {cards.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground pt-6 text-center text-sm">
                  카드 발급 이력이 없습니다.
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>유형</TableHead>
                      <TableHead>사유</TableHead>
                      <TableHead>발급일</TableHead>
                      <TableHead>만료일</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cards.map((c) => {
                      const expired = c.expires_at && new Date(c.expires_at).getTime() < now
                      const isYellow = c.card_type === "yellow"
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Badge
                              variant={isYellow ? "outline" : "destructive"}
                              className={`text-xs ${isYellow ? "border-yellow-500 text-yellow-700 dark:text-yellow-400" : ""}`}
                            >
                              <AlertTriangle className="mr-0.5 h-3 w-3" />
                              {cardTypeLabels[c.card_type] ?? c.card_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {c.reason}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(c.issued_at).toLocaleDateString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-xs">
                            {c.expires_at
                              ? new Date(c.expires_at).toLocaleDateString("ko-KR")
                              : "영구"}
                          </TableCell>
                          <TableCell>
                            {expired ? (
                              <Badge variant="outline" className="text-xs">
                                만료
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                유효
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">정지 이력</h3>
            {suspensions.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground pt-6 text-center text-sm">
                  정지 이력이 없습니다.
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>사유</TableHead>
                      <TableHead>시작일</TableHead>
                      <TableHead>종료일</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suspensions.map((s) => {
                      const ended = s.suspended_until && new Date(s.suspended_until).getTime() < now
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="max-w-[240px] truncate text-sm">
                            {s.reason}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(s.suspended_at).toLocaleDateString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-xs">
                            {s.suspended_until
                              ? new Date(s.suspended_until).toLocaleDateString("ko-KR")
                              : "영구"}
                          </TableCell>
                          <TableCell>
                            {ended ? (
                              <Badge variant="outline" className="text-xs">
                                종료
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                활성
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
