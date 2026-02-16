"use client"

import { Check, Clock, Loader2, RotateCcw, Upload } from "lucide-react"
import { CommissionStatusBadge } from "./status-badge"

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

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  in_progress: <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />,
  submitted: <Upload className="h-3.5 w-3.5 text-indigo-500" />,
  approved: <Check className="h-3.5 w-3.5 text-green-500" />,
  revision_requested: <RotateCcw className="h-3.5 w-3.5 text-orange-500" />,
}

export function MilestoneTracker({ milestones }: { milestones: Milestone[] }) {
  return (
    <div className="space-y-0">
      {milestones.map((ms, idx) => (
        <div key={ms.id} className="flex gap-3">
          {/* Vertical line + dot */}
          <div className="flex flex-col items-center">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 ${
              ms.status === 'approved' ? 'border-green-500 bg-green-50' :
              ms.status === 'submitted' ? 'border-indigo-500 bg-indigo-50' :
              ms.status === 'in_progress' ? 'border-primary bg-primary/10' :
              ms.status === 'revision_requested' ? 'border-orange-500 bg-orange-50' :
              'border-border bg-card'
            }`}>
              {STATUS_ICON[ms.status]}
            </div>
            {idx < milestones.length - 1 && (
              <div className={`w-0.5 flex-1 min-h-[24px] ${
                ms.status === 'approved' ? 'bg-green-300' : 'bg-border'
              }`} />
            )}
          </div>

          {/* Content */}
          <div className="pb-4 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-foreground">{ms.title}</span>
              <CommissionStatusBadge status={ms.status} />
            </div>
            {ms.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{ms.description}</p>
            )}
            {ms.deliverable_note && (
              <p className="text-xs text-foreground/80 mt-1 bg-muted/50 rounded px-2 py-1">{ms.deliverable_note}</p>
            )}
            {ms.feedback && (
              <p className="text-xs text-orange-600 mt-1 bg-orange-50 rounded px-2 py-1">피드백: {ms.feedback}</p>
            )}
            {ms.submitted_at && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                제출: {new Date(ms.submitted_at).toLocaleString('ko-KR')}
              </p>
            )}
            {ms.approved_at && (
              <p className="text-[11px] text-green-600 mt-0.5">
                승인: {new Date(ms.approved_at).toLocaleString('ko-KR')}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
