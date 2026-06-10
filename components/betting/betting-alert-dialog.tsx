"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { AlertCircle, Circle } from "lucide-react"
import type { AlertModalState } from "@/types/betting"

interface BettingAlertDialogProps {
  alertModal: AlertModalState
  onClose: () => void
}

export function BettingAlertDialog({ alertModal, onClose }: BettingAlertDialogProps) {
  return (
    <Dialog
      open={alertModal.isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background:
                alertModal.type === "error"
                  ? "rgba(160,32,59,0.15)"
                  : alertModal.type === "warning"
                    ? "rgba(200,132,42,0.15)"
                    : "rgba(47,125,91,0.15)",
            }}
          >
            {alertModal.type === "error" ? (
              <AlertCircle className="h-8 w-8" style={{ color: "var(--wc-burgundy)" }} />
            ) : alertModal.type === "warning" ? (
              <AlertCircle className="h-8 w-8" style={{ color: "var(--wc-warn)" }} />
            ) : (
              <Circle className="h-8 w-8" style={{ fill: "var(--wc-go)", color: "var(--wc-go)" }} />
            )}
          </div>
          <DialogTitle
            className="text-xl"
            style={{
              color:
                alertModal.type === "error"
                  ? "var(--wc-burgundy)"
                  : alertModal.type === "warning"
                    ? "var(--wc-warn)"
                    : "var(--wc-go)",
            }}
          >
            {alertModal.title}
          </DialogTitle>
          <DialogDescription className="pt-2 text-center text-base whitespace-pre-line">
            {alertModal.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-4 sm:justify-center">
          <Button
            onClick={onClose}
            className="w-full px-8 sm:w-auto"
            style={{
              background:
                alertModal.type === "error"
                  ? "var(--wc-burgundy)"
                  : alertModal.type === "warning"
                    ? "var(--wc-warn)"
                    : "var(--wc-go)",
              color: "white",
            }}
          >
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
