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
    <Dialog open={alertModal.isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
            alertModal.type === 'error'
              ? 'bg-red-100 dark:bg-red-900/30'
              : alertModal.type === 'warning'
                ? 'bg-amber-100 dark:bg-amber-900/30'
                : 'bg-emerald-100 dark:bg-emerald-900/30'
          }`}>
            {alertModal.type === 'error' ? (
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            ) : alertModal.type === 'warning' ? (
              <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            ) : (
              <Circle className="h-8 w-8 text-emerald-600 dark:text-emerald-400 fill-emerald-600 dark:fill-emerald-400" />
            )}
          </div>
          <DialogTitle className={`text-xl ${
            alertModal.type === 'error'
              ? 'text-red-600 dark:text-red-400'
              : alertModal.type === 'warning'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
          }`}>
            {alertModal.title}
          </DialogTitle>
          <DialogDescription className="text-center text-base whitespace-pre-line pt-2">
            {alertModal.message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center pt-4">
          <Button
            onClick={onClose}
            className={`w-full sm:w-auto px-8 ${
              alertModal.type === 'error'
                ? 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700'
                : alertModal.type === 'warning'
                  ? 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700'
            }`}
          >
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
