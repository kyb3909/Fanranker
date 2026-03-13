"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Lock } from "lucide-react"

interface PasswordSectionProps {
  user:
    | {
        updatePassword: (params: {
          currentPassword: string
          newPassword: string
        }) => Promise<unknown>
      }
    | null
    | undefined
}

export function PasswordSection({ user }: PasswordSectionProps) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleChange = async () => {
    if (!user) return
    setMessage(null)
    if (!currentPassword.trim()) {
      setMessage({ type: "error", text: "현재 비밀번호를 입력해주세요." })
      return
    }
    if (!newPassword.trim()) {
      setMessage({ type: "error", text: "새 비밀번호를 입력해주세요." })
      return
    }
    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "새 비밀번호는 8자 이상이어야 합니다." })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "새 비밀번호와 확인이 일치하지 않습니다." })
      return
    }
    setSaving(true)
    try {
      await user.updatePassword({ currentPassword, newPassword })
      setMessage({ type: "success", text: "비밀번호가 변경되었습니다." })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "errors" in err
          ? (err as { errors: Array<{ message?: string }> }).errors?.[0]?.message
          : err instanceof Error
            ? err.message
            : "비밀번호 변경에 실패했습니다."
      setMessage({ type: "error", text: String(msg) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Lock className="text-primary h-5 w-5" />
        <h2 className="font-semibold">비밀번호</h2>
      </div>

      <p className="text-muted-foreground mb-4 text-sm">
        현재 비밀번호를 입력한 뒤 새 비밀번호로 변경할 수 있습니다. (8자 이상)
      </p>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="current-password">현재 비밀번호</Label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="현재 비밀번호"
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">새 비밀번호</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="새 비밀번호 (8자 이상)"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="새 비밀번호 다시 입력"
            autoComplete="new-password"
          />
        </div>
        {message && (
          <p
            className={`text-sm ${message.type === "success" ? "text-green-600" : "text-destructive"}`}
          >
            {message.text}
          </p>
        )}
        <Button variant="outline" onClick={handleChange} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Lock className="mr-2 h-4 w-4" />
          )}
          {saving ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        소셜 로그인(Google 등)만 사용 중인 경우 비밀번호가 없을 수 있습니다.
      </p>
    </Card>
  )
}
