"use client"

import { useState, useCallback } from "react"

type ReportTarget = {
  targetType: "post" | "comment"
  targetId: string
} | null

let globalOpenReport: ((targetType: "post" | "comment", targetId: string) => void) | null = null

export function openReport(targetType: "post" | "comment", targetId: string) {
  globalOpenReport?.(targetType, targetId)
}

export function useReportDialogState() {
  const [target, setTarget] = useState<ReportTarget>(null)

  const open = useCallback((targetType: "post" | "comment", targetId: string) => {
    setTarget({ targetType, targetId })
  }, [])

  const close = useCallback(() => setTarget(null), [])

  // Register global handler
  globalOpenReport = open

  return { target, open, close }
}
