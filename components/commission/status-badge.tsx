"use client"

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: '대기중', className: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800' },
  accepted: { label: '수락됨', className: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800' },
  in_progress: { label: '작업중', className: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800' },
  review: { label: '검토중', className: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800' },
  revision: { label: '수정요청', className: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800' },
  completed: { label: '완료', className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800' },
  cancelled: { label: '취소됨', className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800' },
  // Milestone statuses
  submitted: { label: '제출됨', className: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800' },
  approved: { label: '승인됨', className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800' },
  revision_requested: { label: '수정요청', className: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800' },
}

export function CommissionStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, className: 'bg-muted text-muted-foreground border-border' }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${config.className}`}>
      {config.label}
    </span>
  )
}
