"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Check, X, Play } from "lucide-react"
import { CommissionStatusTimeline } from "./status-timeline"
import { MilestoneTracker } from "./milestone-tracker"
import { MilestoneSubmitForm } from "./milestone-submit"
import { MilestoneReviewCard } from "./milestone-review"
import { CommissionChat } from "./chat"

interface Milestone {
  id: string
  milestone_number: number
  title: string
  description: string | null
  status: string
  deliverable_images: string[]
  deliverable_note: string | null
  submitted_at: string | null
  feedback: string | null
  approved_at: string | null
}

interface Order {
  id: string
  order_number: string
  title: string
  description: string
  status: string
  price_gold: number
  platform_fee_gold: number
  delivery_days: number
  max_revisions: number
  revisions_used: number
  client_id: string
  artist_id: string
  deadline_at: string | null
  auto_release_at: string | null
  created_at: string
  accepted_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  reference_images: string[]
  commission_packages: { name: string; type: string } | null
}

interface Props {
  order: Order
  milestones: Milestone[]
  currentUserId: string
  profiles: Record<string, { nickname: string; avatar_url: string | null }>
  onRefresh: () => void
}

export function CommissionOrderDetail({ order, milestones, currentUserId, profiles, onRefresh }: Props) {
  const [loading, setLoading] = useState('')
  const [activeTab, setActiveTab] = useState<'milestones' | 'chat'>('milestones')

  const isClient = order.client_id === currentUserId
  const isArtist = order.artist_id === currentUserId

  const callAction = async (endpoint: string, body?: Record<string, unknown>) => {
    setLoading(endpoint)
    try {
      const res = await fetch(`/api/commissions/orders/${order.id}/${endpoint}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || '처리 실패')
      }
      onRefresh()
    } catch {
      alert('오류가 발생했습니다.')
    } finally {
      setLoading('')
    }
  }

  // Find active milestone for actions
  const submittedMilestone = milestones.find(m => m.status === 'submitted')
  const activeMilestone = milestones.find(m => ['pending', 'in_progress', 'revision_requested'].includes(m.status))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">{order.order_number}</p>
            <h2 className="font-bold text-lg text-foreground">{order.title}</h2>
          </div>
          <span className="font-bold text-lg text-primary">{order.price_gold.toLocaleString()}G</span>
        </div>

        <CommissionStatusTimeline status={order.status} />

        {/* Meta */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">패키지</p>
            <p className="font-medium text-foreground">{order.commission_packages?.name || '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">작업일</p>
            <p className="font-medium text-foreground">{order.delivery_days}일</p>
          </div>
          <div>
            <p className="text-muted-foreground">수정</p>
            <p className="font-medium text-foreground">{order.revisions_used}/{order.max_revisions}회</p>
          </div>
          <div>
            <p className="text-muted-foreground">마감일</p>
            <p className="font-medium text-foreground">
              {order.deadline_at ? new Date(order.deadline_at).toLocaleDateString('ko-KR') : '미정'}
            </p>
          </div>
        </div>

        {order.description && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1">요청 내용</p>
            <p className="text-sm text-foreground">{order.description}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border">
          {/* Artist: accept/reject pending */}
          {isArtist && order.status === 'pending' && (
            <>
              <Button size="sm" className="gap-1.5" onClick={() => callAction('accept')} disabled={!!loading}>
                {loading === 'accept' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                수락
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => callAction('reject')} disabled={!!loading}>
                {loading === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                거절
              </Button>
            </>
          )}

          {/* Artist: deliver */}
          {isArtist && ['in_progress', 'revision'].includes(order.status) && (
            <Button size="sm" className="gap-1.5" onClick={() => callAction('deliver')} disabled={!!loading}>
              {loading === 'deliver' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              최종 제출
            </Button>
          )}

          {/* Client: complete */}
          {isClient && order.status === 'review' && (
            <Button size="sm" className="gap-1.5" onClick={() => callAction('complete')} disabled={!!loading}>
              {loading === 'complete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              완료 승인 (정산)
            </Button>
          )}

          {/* Cancel */}
          {!['review', 'revision', 'completed', 'cancelled'].includes(order.status) && (
            <Button size="sm" variant="outline" className="gap-1.5 text-primary border-primary/30 hover:bg-primary/10" onClick={() => { if (confirm('정말 취소하시겠습니까?')) callAction('cancel') }} disabled={!!loading}>
              취소
            </Button>
          )}
        </div>

        {order.auto_release_at && order.status === 'review' && (
          <p className="text-xs text-muted-foreground">
            자동 정산: {new Date(order.auto_release_at).toLocaleString('ko-KR')}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
        <button
          onClick={() => setActiveTab('milestones')}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'milestones' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          마일스톤
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'chat' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          메시지
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'milestones' ? (
        <div className="space-y-4">
          <MilestoneTracker milestones={milestones} />

          {/* Artist: submit form for active milestone */}
          {isArtist && activeMilestone && ['accepted', 'in_progress', 'revision'].includes(order.status) && (
            <MilestoneSubmitForm
              milestoneId={activeMilestone.id}
              milestoneTitle={activeMilestone.title}
              orderId={order.id}
              onSubmitted={onRefresh}
            />
          )}

          {/* Client: review submitted milestone */}
          {isClient && submittedMilestone && (
            <MilestoneReviewCard
              milestoneId={submittedMilestone.id}
              milestoneTitle={submittedMilestone.title}
              orderId={order.id}
              deliverableNote={submittedMilestone.deliverable_note}
              revisionsUsed={order.revisions_used}
              maxRevisions={order.max_revisions}
              onAction={onRefresh}
            />
          )}
        </div>
      ) : (
        <CommissionChat
          orderId={order.id}
          currentUserId={currentUserId}
          profiles={profiles}
        />
      )}
    </div>
  )
}
