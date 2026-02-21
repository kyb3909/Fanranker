'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Coins, Award, FileText, MessageSquare, Target,
  Loader2, ShieldCheck, Palette, AlertTriangle,
} from 'lucide-react'

interface UserDetail {
  profile: {
    user_id: string
    nickname: string
    avatar_url: string | null
    role: string
    temperature: number
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
  sanctions: Array<{
    id: string
    type: string
    reason: string
    starts_at: string
    expires_at: string | null
    lifted_at: string | null
    created_at: string
  }>
  recentPosts: Array<{
    id: string
    title: string
    community_slug: string
    created_at: string
  }>
}

type Tab = 'overview' | 'economy' | 'activity' | 'sanctions'

const sanctionTypeLabels: Record<string, string> = {
  warning: '경고',
  timeout: '타임아웃',
  ban: '밴',
  shadowban: '섀도우밴',
  content_restrict: '콘텐츠 제한',
}

export function UserDetailTabs({ userId }: { userId: string }) {
  const [data, setData] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [actionLoading, setActionLoading] = useState(false)

  // Economy adjustment
  const [adjustType, setAdjustType] = useState<'token' | 'gold'>('token')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')

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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setData((prev) => prev ? { ...prev, profile: { ...prev.profile, role } } : null)
    } catch (error) {
      alert(error instanceof Error ? error.message : '오류 발생')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAdjustEconomy = async () => {
    if (!adjustAmount || !adjustReason) {
      alert('금액과 사유를 입력해주세요.')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/adjust-economy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: adjustType,
          amount: parseInt(adjustAmount),
          reason: adjustReason,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      // Refresh data
      const refreshed = await fetch(`/api/admin/users/${userId}`).then((r) => r.json())
      setData(refreshed)
      setAdjustAmount('')
      setAdjustReason('')
    } catch (error) {
      alert(error instanceof Error ? error.message : '오류 발생')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return <div className="text-center text-muted-foreground py-12">사용자를 찾을 수 없습니다.</div>
  }

  const { profile, economy, activity, sanctions, recentPosts } = data

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: '개요' },
    { key: 'economy', label: '경제' },
    { key: 'activity', label: '활동' },
    { key: 'sanctions', label: '제재' },
  ]

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage src={profile.avatar_url || ''} />
              <AvatarFallback className="text-lg">{profile.nickname?.[0] ?? '?'}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{profile.nickname}</h2>
                <Badge className="text-xs">{profile.role}</Badge>
                {profile.is_expert && (
                  <Badge variant="default" className="text-xs bg-green-600">
                    <ShieldCheck className="h-3 w-3 mr-0.5" />전문가
                  </Badge>
                )}
                {profile.is_artist && (
                  <Badge variant="default" className="text-xs bg-purple-600">
                    <Palette className="h-3 w-3 mr-0.5" />아티스트
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                ID: <code className="text-xs">{profile.user_id}</code>
                {' · '}온도: {profile.temperature?.toFixed(1)}°
                {' · '}가입: {new Date(profile.created_at).toLocaleDateString('ko-KR')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {['user', 'moderator', 'admin'].map((role) => (
                <Button
                  key={role}
                  variant={profile.role === role ? 'default' : 'outline'}
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
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">토큰 잔액</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-500" />
              <span className="text-xl font-bold">{economy.tokenBalance.toLocaleString()}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">골드 잔액</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <span className="text-xl font-bold">{economy.goldBalance.toLocaleString()}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">게시글</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="text-xl font-bold">{activity.postCount}</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground">예측</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              <span className="text-xl font-bold">{activity.predictionCount}</span>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'economy' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">토큰</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{economy.tokenBalance.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">총 획득: {economy.totalTokensEarned.toLocaleString()}</p>
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
                  variant={adjustType === 'token' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAdjustType('token')}
                >
                  토큰
                </Button>
                <Button
                  variant={adjustType === 'gold' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAdjustType('gold')}
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
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '적용'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 flex items-center gap-3">
                <FileText className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{activity.postCount}</p>
                  <p className="text-xs text-muted-foreground">게시글</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{activity.commentCount}</p>
                  <p className="text-xs text-muted-foreground">댓글</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 flex items-center gap-3">
                <Target className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{activity.predictionCount}</p>
                  <p className="text-xs text-muted-foreground">예측</p>
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
                <p className="text-sm text-muted-foreground">게시글이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {recentPosts.map((post) => (
                    <div key={post.id} className="flex items-center justify-between text-sm">
                      <span className="truncate flex-1">{post.title}</span>
                      <div className="flex items-center gap-2 ml-4">
                        <Badge variant="outline" className="text-xs">{post.community_slug}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(post.created_at).toLocaleDateString('ko-KR')}
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

      {activeTab === 'sanctions' && (
        <div className="space-y-4">
          {sanctions.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                제재 이력이 없습니다.
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>유형</TableHead>
                    <TableHead>사유</TableHead>
                    <TableHead>시작일</TableHead>
                    <TableHead>만료일</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sanctions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />
                          {sanctionTypeLabels[s.type] ?? s.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{s.reason}</TableCell>
                      <TableCell className="text-xs">{new Date(s.starts_at).toLocaleDateString('ko-KR')}</TableCell>
                      <TableCell className="text-xs">{s.expires_at ? new Date(s.expires_at).toLocaleDateString('ko-KR') : '무기한'}</TableCell>
                      <TableCell>
                        {s.lifted_at ? (
                          <Badge variant="secondary" className="text-xs">해제됨</Badge>
                        ) : s.expires_at && new Date(s.expires_at) < new Date() ? (
                          <Badge variant="outline" className="text-xs">만료됨</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">활성</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
