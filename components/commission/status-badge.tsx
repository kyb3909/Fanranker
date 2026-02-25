"use client"

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "대기중", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  accepted: { label: "수락됨", className: "bg-blue-100 text-blue-800 border-blue-200" },
  in_progress: { label: "작업중", className: "bg-purple-100 text-purple-800 border-purple-200" },
  review: { label: "검토중", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  revision: { label: "수정요청", className: "bg-orange-100 text-orange-800 border-orange-200" },
  completed: { label: "완료", className: "bg-green-100 text-green-800 border-green-200" },
  cancelled: { label: "취소됨", className: "bg-red-100 text-red-800 border-red-200" },
  // Milestone statuses
  submitted: { label: "제출됨", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  approved: { label: "승인됨", className: "bg-green-100 text-green-800 border-green-200" },
  revision_requested: {
    label: "수정요청",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
}

export function CommissionStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || {
    label: status,
    className: "bg-muted text-muted-foreground border-border",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}
