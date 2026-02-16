"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import {
  Users,
  Plus,
  ThumbsUp,
  Loader2,
  ChevronDown,
  ChevronUp,
  Film,
  ArrowUpDown,
  X,
  Send,
} from "lucide-react"

interface Suggestion {
  id: string
  casting_id: string
  user_id: string
  actor_name: string
  reason: string | null
  vote_count: number
}

interface Casting {
  id: string
  movie_title: string
  role_name: string
  role_description: string | null
  original_actor: string | null
  vote_count: number
  suggestion_count: number
  suggestions: Suggestion[]
}

export default function VirtualCastingPage() {
  const { isSignedIn } = useAuth()
  const [castings, setCastings] = useState<Casting[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<"latest" | "popular">("popular")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)

  // Create form state
  const [newMovieTitle, setNewMovieTitle] = useState("")
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleDesc, setNewRoleDesc] = useState("")
  const [newOriginalActor, setNewOriginalActor] = useState("")
  const [creating, setCreating] = useState(false)

  // Suggestion form state
  const [suggestCastingId, setSuggestCastingId] = useState<string | null>(null)
  const [suggestActorName, setSuggestActorName] = useState("")
  const [suggestReason, setSuggestReason] = useState("")
  const [suggesting, setSuggesting] = useState(false)

  const fetchCastings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/games/virtual-casting?sort=${sort}`)
      const data = await res.json()
      if (res.ok) setCastings(data.castings || [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [sort])

  useEffect(() => {
    fetchCastings()
  }, [fetchCastings])

  const handleCreate = async () => {
    if (!newMovieTitle.trim() || !newRoleName.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/games/virtual-casting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movie_title: newMovieTitle,
          role_name: newRoleName,
          role_description: newRoleDesc || undefined,
          original_actor: newOriginalActor || undefined,
        }),
      })
      if (res.ok) {
        setNewMovieTitle("")
        setNewRoleName("")
        setNewRoleDesc("")
        setNewOriginalActor("")
        setShowCreateForm(false)
        fetchCastings()
      }
    } catch {
      // silently fail
    } finally {
      setCreating(false)
    }
  }

  const handleSuggest = async (castingId: string) => {
    if (!suggestActorName.trim()) return
    setSuggesting(true)
    try {
      const res = await fetch(`/api/games/virtual-casting/${castingId}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actor_name: suggestActorName,
          reason: suggestReason || undefined,
        }),
      })
      if (res.ok) {
        setSuggestActorName("")
        setSuggestReason("")
        setSuggestCastingId(null)
        fetchCastings()
      }
    } catch {
      // silently fail
    } finally {
      setSuggesting(false)
    }
  }

  const handleVote = async (castingId: string, suggestionId: string) => {
    if (!isSignedIn) return
    setVotingId(suggestionId)
    try {
      const res = await fetch(`/api/games/virtual-casting/${castingId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: suggestionId }),
      })
      if (res.ok) {
        fetchCastings()
      }
    } catch {
      // silently fail
    } finally {
      setVotingId(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">가상 캐스팅</h1>
          <p className="text-sm text-muted-foreground mt-0.5">영화 속 배역을 새롭게 캐스팅해보세요</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSort(sort === "latest" ? "popular" : "latest")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sort === "popular" ? "인기순" : "최신순"}
          </button>
          {isSignedIn && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              새 캐스팅
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">새 캐스팅 만들기</h3>
            <button onClick={() => setShowCreateForm(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="영화 제목"
              value={newMovieTitle}
              onChange={(e) => setNewMovieTitle(e.target.value)}
              className="col-span-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              placeholder="배역 이름"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              className="col-span-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              placeholder="원래 배우 (선택)"
              value={newOriginalActor}
              onChange={(e) => setNewOriginalActor(e.target.value)}
              className="col-span-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              placeholder="배역 설명 (선택)"
              value={newRoleDesc}
              onChange={(e) => setNewRoleDesc(e.target.value)}
              className="col-span-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newMovieTitle.trim() || !newRoleName.trim()}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "등록하기"}
          </button>
        </div>
      )}

      {/* Castings list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : castings.length === 0 ? (
        <div className="text-center py-20">
          <Film className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">아직 등록된 캐스팅이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {castings.map((casting) => {
            const isExpanded = expandedId === casting.id
            return (
              <div key={casting.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Card header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : casting.id)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white flex-shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {casting.movie_title}
                      </span>
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">
                        {casting.role_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {casting.original_actor && (
                        <span className="text-xs text-muted-foreground">
                          원작: {casting.original_actor}
                        </span>
                      )}
                      {casting.role_description && (
                        <span className="text-xs text-muted-foreground truncate">
                          {casting.role_description}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-sm font-bold text-foreground">{casting.suggestion_count}</p>
                      <p className="text-[10px] text-muted-foreground">후보</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-cyan-600">{casting.vote_count}</p>
                      <p className="text-[10px] text-muted-foreground">투표</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Suggestions */}
                    {casting.suggestions.length > 0 ? (
                      <div className="p-4 space-y-2">
                        {casting.suggestions.map((suggestion, idx) => (
                          <div
                            key={suggestion.id}
                            className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                          >
                            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              idx === 0
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : idx === 1
                                  ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                                  : idx === 2
                                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                    : "bg-muted text-muted-foreground"
                            }`}>
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{suggestion.actor_name}</p>
                              {suggestion.reason && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">{suggestion.reason}</p>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleVote(casting.id, suggestion.id)
                              }}
                              disabled={!isSignedIn || votingId === suggestion.id}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border text-xs font-medium text-muted-foreground hover:text-cyan-600 hover:border-cyan-300 transition-colors disabled:opacity-50"
                            >
                              {votingId === suggestion.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ThumbsUp className="h-3.5 w-3.5" />
                              )}
                              {suggestion.vote_count}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">아직 추천된 배우가 없습니다.</p>
                      </div>
                    )}

                    {/* Add suggestion */}
                    {isSignedIn && (
                      <div className="border-t border-border p-4">
                        {suggestCastingId === casting.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder="추천할 배우 이름"
                              value={suggestActorName}
                              onChange={(e) => setSuggestActorName(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                              autoFocus
                            />
                            <input
                              type="text"
                              placeholder="추천 이유 (선택)"
                              value={suggestReason}
                              onChange={(e) => setSuggestReason(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setSuggestCastingId(null)
                                  setSuggestActorName("")
                                  setSuggestReason("")
                                }}
                                className="flex-1 py-2 rounded-lg bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                              >
                                취소
                              </button>
                              <button
                                onClick={() => handleSuggest(casting.id)}
                                disabled={suggesting || !suggestActorName.trim()}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                              >
                                {suggesting ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Send className="h-3.5 w-3.5" />
                                    추천하기
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSuggestCastingId(casting.id)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                            배우 추천하기
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
