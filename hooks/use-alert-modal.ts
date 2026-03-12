import { useState, useCallback } from "react"
import type { AlertModalState } from "@/components/betting/betting-types"

export function useAlertModal() {
  const [alertModal, setAlertModal] = useState<AlertModalState>({
    isOpen: false,
    type: "error",
    title: "",
    message: "",
  })

  const showAlert = useCallback(
    (type: "error" | "warning" | "success", title: string, message: string) => {
      setAlertModal({ isOpen: true, type, title, message })
    },
    []
  )

  const closeAlert = useCallback(() => {
    setAlertModal((prev) => ({ ...prev, isOpen: false }))
  }, [])

  return { alertModal, showAlert, closeAlert }
}
