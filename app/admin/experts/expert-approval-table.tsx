"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Shield, ShieldCheck, ShieldOff } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "@/hooks/use-toast"

interface Profile {
  user_id: string
  nickname: string
  avatar_url: string | null
  is_expert: boolean
  expert_certified_at: string | null
  created_at: string
}

interface ExpertApprovalTableProps {
  initialProfiles: Profile[]
}

export function ExpertApprovalTable({ initialProfiles }: ExpertApprovalTableProps) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
  const [loading, setLoading] = useState<string | null>(null)

  const handleToggleExpert = async (userId: string, currentStatus: boolean) => {
    setLoading(userId)
    try {
      const response = await fetch("/api/admin/users/certify-expert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          revoke: currentStatus,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "전문가 인증 상태 변경에 실패했습니다.")
      }

      const { profile } = await response.json()

      // Update local state
      setProfiles((prev) => prev.map((p) => (p.user_id === userId ? { ...p, ...profile } : p)))
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "오류가 발생했습니다.",
      })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>사용자</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>인증 일시</TableHead>
            <TableHead>가입일</TableHead>
            <TableHead className="text-right">동작</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                사용자가 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            profiles.map((profile) => (
              <TableRow key={profile.user_id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile.avatar_url || ""} alt={profile.nickname} />
                      <AvatarFallback>{profile.nickname[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{profile.nickname}</div>
                      <div className="text-muted-foreground text-xs">
                        {profile.user_id.slice(-8)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {profile.is_expert ? (
                    <Badge variant="default" className="bg-green-500">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      전문가
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <ShieldOff className="mr-1 h-3 w-3" />
                      일반
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {profile.expert_certified_at
                    ? new Date(profile.expert_certified_at).toLocaleString("ko-KR")
                    : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(profile.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant={profile.is_expert ? "destructive" : "default"}
                    onClick={() => handleToggleExpert(profile.user_id, profile.is_expert)}
                    disabled={loading === profile.user_id}
                  >
                    {loading === profile.user_id ? (
                      "처리 중..."
                    ) : profile.is_expert ? (
                      <>
                        <ShieldOff className="mr-1 h-4 w-4" />
                        인증 해제
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-1 h-4 w-4" />
                        인증 승인
                      </>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
