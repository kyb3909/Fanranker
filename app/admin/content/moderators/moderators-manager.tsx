"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"

interface Board {
  slug: string
  name: string
}
interface Mod {
  user_id: string
  nickname: string
  avatar_url: string | null
  granted_at: string
}

export function ModeratorsManager({ boards }: { boards: Board[] }) {
  const [slug, setSlug] = useState(boards[0]?.slug ?? "")
  const [nickname, setNickname] = useState("")
  const [busy, setBusy] = useState(false)
  const { data, mutate } = useSWR<{ moderators: Mod[] }>(
    slug ? `/api/admin/content/moderators?slug=${slug}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const mods = data?.moderators ?? []

  const add = async () => {
    if (!nickname.trim() || busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/content/moderators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_slug: slug, nickname: nickname.trim() }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; nickname?: string }
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "오류",
          description: d.error || "MOD 지정에 실패했습니다.",
        })
        return
      }
      toast({ title: "MOD 지정 완료", description: `${d.nickname}님을 MOD로 지정했어요.` })
      setNickname("")
      mutate()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (m: Mod) => {
    if (!confirm(`${m.nickname}님을 이 게시판 MOD에서 해제할까요?`)) return
    const res = await fetch("/api/admin/content/moderators", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ community_slug: slug, user_id: m.user_id }),
    })
    if (res.ok) {
      toast({ title: "MOD 해제됨" })
      mutate()
    } else {
      toast({ variant: "destructive", title: "오류", description: "해제에 실패했습니다." })
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="mod-board">게시판</Label>
        <select
          id="mod-board"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm sm:w-64"
        >
          {boards.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mod-nick">MOD 추가 (닉네임)</Label>
        <div className="flex gap-2">
          <Input
            id="mod-nick"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add()
            }}
            placeholder="사용자 닉네임"
          />
          <Button onClick={add} disabled={busy || !nickname.trim()}>
            추가
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>현재 MOD ({mods.length})</Label>
        {mods.length > 0 ? (
          <ul className="divide-border divide-y rounded-md border">
            {mods.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span className="text-foreground font-medium">{m.nickname}</span>
                <button
                  type="button"
                  onClick={() => remove(m)}
                  className="text-destructive text-xs font-medium hover:underline"
                >
                  해제
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">지정된 MOD가 없습니다.</p>
        )}
      </div>
    </div>
  )
}
