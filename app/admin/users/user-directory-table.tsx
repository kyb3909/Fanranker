"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Search, Loader2, ExternalLink, ShieldCheck, Palette } from "lucide-react"

interface User {
  user_id: string
  nickname: string
  avatar_url: string | null
  role: string
  is_expert: boolean
  is_artist: boolean
  created_at: string
}

const roleColors: Record<string, string> = {
  admin: "bg-primary/15 text-primary",
  moderator: "bg-blue-100 text-blue-800",
  user: "",
}

export function UserDirectoryTable({
  initialUsers,
  total: initialTotal,
}: {
  initialUsers: User[]
  total: number
}) {
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [total, setTotal] = useState(initialTotal)
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)

  const fetchUsers = async (searchTerm?: string) => {
    setSearching(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set("search", searchTerm)
      const res = await fetch(`/api/admin/users?${params}`)
      const data = await res.json()
      setUsers(data.users ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
          <Input
            placeholder="닉네임 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchUsers(search)}
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchUsers(search)} disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "검색"}
        </Button>
        <span className="text-muted-foreground ml-auto text-sm">총 {total}명</span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>사용자</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>태그</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead className="text-right">상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                  사용자가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={user.avatar_url || ""} alt={user.nickname || "사용자"} />
                        <AvatarFallback className="text-xs">
                          {user.nickname?.[0] ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{user.nickname}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${roleColors[user.role] || ""}`}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {user.is_expert && (
                        <Badge variant="default" className="bg-green-600 text-xs">
                          <ShieldCheck className="mr-0.5 h-3 w-3" />
                          전문가
                        </Badge>
                      )}
                      {user.is_artist && (
                        <Badge variant="default" className="bg-purple-600 text-xs">
                          <Palette className="mr-0.5 h-3 w-3" />
                          아티스트
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(user.created_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <Link href={`/admin/users/${user.user_id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
