"use client"

import { Check, Clock, Loader2, X } from "lucide-react"

const STEPS = [
  { key: 'pending', label: '주문 접수' },
  { key: 'accepted', label: '작가 수락' },
  { key: 'in_progress', label: '작업 진행' },
  { key: 'review', label: '결과 검토' },
  { key: 'completed', label: '완료' },
]

const STATUS_INDEX: Record<string, number> = {
  pending: 0,
  accepted: 1,
  in_progress: 2,
  review: 3,
  revision: 2, // Goes back to in_progress stage
  completed: 4,
  cancelled: -1,
}

export function CommissionStatusTimeline({ status }: { status: string }) {
  const currentIdx = STATUS_INDEX[status] ?? -1

  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 py-3">
        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
          <X className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-medium text-primary">주문이 취소되었습니다</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0 py-3 overflow-x-auto">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        const isPending = idx > currentIdx

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                isCompleted ? 'bg-green-500' :
                isCurrent ? 'bg-primary' :
                'bg-muted border border-border'
              }`}>
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 text-white" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 text-primary-foreground animate-spin" />
                ) : (
                  <Clock className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap ${
                isCurrent ? 'text-foreground font-medium' :
                isCompleted ? 'text-green-600' :
                'text-muted-foreground'
              }`}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 mt-[-14px] ${
                isCompleted ? 'bg-green-500' : 'bg-border'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
