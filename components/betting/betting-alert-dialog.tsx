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
import type { AlertModalState } from "./betting-types"

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
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              alertModal.type === "error"
                ? "bg-primary/15"
                : alertModal.type === "warning"
                  ? "bg-amber-100"
                  : "bg-emerald-100"
            }`}
          >
            {alertModal.type === "error" ? (
              <AlertCircle className="h-8 w-8 text-primary" />
            ) : alertModal.type === "warning" ? (
              <AlertCircle className="h-8 w-8 text-amber-600" />
            ) : (
              <Circle className="h-8 w-8 fill-emerald-600 text-emerald-600" />
            )}
          </div>
          <DialogTitle
            className={`text-xl ${
              alertModal.type === "error"
                ? "text-primary"
                : alertModal.type === "warning"
                  ? "text-amber-600"
                  : "text-emerald-600"
            }`}
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
            className={`w-full px-8 sm:w-auto ${
              alertModal.type === "error"
                ? "bg-primary hover:bg-primary/90"
                : alertModal.type === "warning"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
