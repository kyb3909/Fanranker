"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface DeleteAccountSectionProps {
  onDelete: () => Promise<void>
}

export function DeleteAccountSection({ onDelete }: DeleteAccountSectionProps) {
  const [confirmText, setConfirmText] = useState("")
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  return (
    <Card className="border-destructive/50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Trash2 className="text-destructive h-5 w-5" />
        <h2 className="text-destructive font-semibold">계정 삭제</h2>
      </div>

      <p className="text-muted-foreground mb-4 text-sm">
        계정과 프로필 개인정보, 게시판에 작성한 글·댓글 내용이 삭제되며 계정을 복구할 수 없습니다.
      </p>

      <AlertDialog
        open={open}
        onOpenChange={(value) => {
          if (!deleting) {
            setOpen(value)
            setError("")
            setConfirmText("")
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-full">
            <Trash2 className="mr-2 h-4 w-4" />
            계정 삭제
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 계정을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              작성한 글·댓글의 내용은 삭제됩니다. 예측·정산 기록과 다른 사용자의 답글 연결에 필요한
              기록은 남습니다. 로그인 계정 삭제가 지연되면 자동으로 재시도하며, 접수 후 기존 계정은
              사용할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="delete-confirm" className="text-muted-foreground text-sm">
              확인을 위해 <span className="text-destructive font-semibold">계정삭제</span>를
              입력해주세요
            </Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="계정삭제"
              className="mt-2"
              autoComplete="off"
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} onClick={() => setConfirmText("")}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async (event) => {
                event.preventDefault()
                if (deleting) return
                setDeleting(true)
                setError("")
                try {
                  await onDelete()
                  setOpen(false)
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "계정 삭제에 실패했습니다.")
                } finally {
                  setDeleting(false)
                }
              }}
              disabled={deleting || confirmText !== "계정삭제"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleting ? "처리 중…" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
