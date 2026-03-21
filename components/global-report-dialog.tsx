"use client"

import { ReportDialog } from "@/components/report-dialog"
import { useReportDialogState } from "@/hooks/use-report-dialog"

export function GlobalReportDialog() {
  const { target, close } = useReportDialogState()

  return (
    <ReportDialog
      targetType={target?.targetType ?? "post"}
      targetId={target?.targetId ?? ""}
      open={!!target}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    />
  )
}
