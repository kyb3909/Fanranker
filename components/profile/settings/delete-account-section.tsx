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

  return (
    <Card className="border-destructive/50 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Trash2 className="text-destructive h-5 w-5" />
        <h2 className="text-destructive font-semibold">계정 삭제</h2>
      </div>

      <p className="text-muted-foreground mb-4 text-sm">
        계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
      </p>

      <AlertDialog>
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
              이 작업은 되돌릴 수 없습니다. 모든 게시글, 댓글, 예측 내역이 영구적으로 삭제됩니다.
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
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText("")}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={confirmText !== "계정삭제"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
