'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DRAFT_MODE_LIST } from '@/lib/draft/modes'
import { ModeCard } from '@/components/draft/mode-card'
import { draftPost, draftGet } from '@/lib/draft/api'
import { useGuestId } from '@/hooks/use-guest-id'

export default function DraftPage() {
  const router = useRouter()
  const guestId = useGuestId()
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateRoom = async (modeId: string) => {
    if (!guestId) return
    setLoading(true)
    setError(null)
    try {
      const res = await draftPost('/api/games/draft/rooms', { modeId })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/games/draft/room/${data.room.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '방 생성에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinByCode = async () => {
    if (!joinCode.trim() || !guestId) return
    setLoading(true)
    setError(null)
    try {
      const searchRes = await draftGet(`/api/games/draft/rooms/find?code=${joinCode.trim().toUpperCase()}`)
      const searchData = await searchRes.json()
      if (!searchRes.ok) throw new Error(searchData.error)

      const joinRes = await draftPost(`/api/games/draft/rooms/${searchData.room.id}/join`, {
        roomCode: joinCode.trim().toUpperCase(),
      })
      const joinData = await joinRes.json()
      if (!joinRes.ok) throw new Error(joinData.error)

      router.push(`/games/draft/room/${searchData.room.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '참가에 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">멀티플레이어 드래프트</h1>
        <p className="text-sm text-muted-foreground mt-1">
          로그인 없이 바로 플레이! 1분간 혼자면 봇이 참가합니다
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-primary/10 border border-primary/30 px-4 py-3 text-sm text-primary">
          {error}
        </div>
      )}

      {/* Join by code */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">방 코드로 입장</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="6자리 코드 입력"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-mono tracking-widest placeholder:text-muted-foreground placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={handleJoinByCode}
            disabled={loading || joinCode.length < 6}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '...' : '입장'}
          </button>
        </div>
      </div>

      {/* Mode selection */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">새 방 만들기</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {DRAFT_MODE_LIST.map(mode => (
            <ModeCard
              key={mode.id}
              mode={mode}
              onClick={() => handleCreateRoom(mode.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
