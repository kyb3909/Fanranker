"use client"

import { useMemo, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import { SlidersHorizontal, Star, EyeOff } from "lucide-react"
import { fetcher } from "@/lib/swr"
import { SPORTS_COMMUNITIES } from "@/lib/constants/communities"

// 말머리 필터는 스포츠 게시판의 "팀" 말머리만 대상(자유게시판 등 라이프 게시판의
// 카테고리 말머리 잡담/유머/정보…는 팀 즐겨찾기/뮤트 개념과 안 맞아 제외).
const SPORT_SLUGS = new Set(SPORTS_COMMUNITIES.map((c) => c.slug))

interface Flair {
  id: string
  name: string
  color: string | null
  community_slug: string
}
interface FlairPref {
  flair_id: string
  pref: "favorite" | "mute"
}

/**
 * 담벼락 말머리 필터 — 로그인 사용자가 팔로우한 게시판의 말머리(팀)를
 * 즐겨찾기(그 말머리만 보기) / 뮤트(숨김)로 개인화한다.
 *
 * prefs 변경 시 "/api/flair-prefs" SWR 키를 mutate → use-feed 의 동일 키 SWR 이
 * 재검증되며 only_flairs/exclude_flairs 가 바뀌고 피드가 자동 갱신된다.
 */
export function FlairFilterBar({ followedSlugs }: { followedSlugs: string[] }) {
  const { mutate } = useSWRConfig()
  const [open, setOpen] = useState(false)

  // 팔로우한 게시판 중 스포츠 게시판만 → 그 게시판들의 팀 말머리만 표시.
  const sportSlugs = useMemo(() => followedSlugs.filter((s) => SPORT_SLUGS.has(s)), [followedSlugs])
  const slugsParam = useMemo(() => sportSlugs.slice().sort().join(","), [sportSlugs])
  const { data: flairsData } = useSWR<{ flairs: Flair[] }>(
    slugsParam ? `/api/flairs?community_slugs=${slugsParam}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300000 }
  )
  const { data: prefsData } = useSWR<{ prefs: FlairPref[] }>("/api/flair-prefs", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })

  const prefMap = useMemo(() => {
    const m = new Map<string, "favorite" | "mute">()
    for (const p of prefsData?.prefs ?? []) m.set(p.flair_id, p.pref)
    return m
  }, [prefsData])

  const flairs = flairsData?.flairs ?? []
  const favCount = useMemo(
    () => [...prefMap.values()].filter((p) => p === "favorite").length,
    [prefMap]
  )
  const muteCount = useMemo(
    () => [...prefMap.values()].filter((p) => p === "mute").length,
    [prefMap]
  )

  if (sportSlugs.length === 0 || flairs.length === 0) return null

  // none → favorite → mute → none 순환
  const cycle = async (flairId: string) => {
    const cur = prefMap.get(flairId)
    const next = cur === undefined ? "favorite" : cur === "favorite" ? "mute" : null
    await fetch("/api/flair-prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flair_id: flairId, pref: next }),
    })
    mutate("/api/flair-prefs")
  }

  return (
    <div
      className="rounded-xl"
      style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold"
        style={{ color: "var(--wc-ink)" }}
      >
        <SlidersHorizontal
          className="h-4 w-4"
          style={{ color: "var(--wc-burgundy)" }}
          aria-hidden
        />
        말머리 필터
        {(favCount > 0 || muteCount > 0) && (
          <span className="text-[11px] font-medium" style={{ color: "var(--wc-mute)" }}>
            {favCount > 0 && `⭐ ${favCount}`}
            {favCount > 0 && muteCount > 0 && " · "}
            {muteCount > 0 && `🔇 ${muteCount}`}
          </span>
        )}
        <span className="ml-auto text-[11px]" style={{ color: "var(--wc-mute)" }}>
          {open ? "접기" : "펼치기"}
        </span>
      </button>
      {open && (
        <div
          className="flex flex-wrap gap-1.5 px-3.5 pb-3"
          style={{ borderTop: "1px solid var(--wc-line)" }}
        >
          <p
            className="mt-2 w-full text-[11px] leading-relaxed"
            style={{ color: "var(--wc-mute)" }}
          >
            칩을 누르면 즐겨찾기(⭐ 그 말머리만 보기) → 뮤트(🔇 숨기기) → 해제 순으로 바뀝니다.
          </p>
          {flairs.map((f) => {
            const pref = prefMap.get(f.id)
            const isFav = pref === "favorite"
            const isMute = pref === "mute"
            return (
              <button
                key={f.id}
                onClick={() => cycle(f.id)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all"
                style={{
                  background: isFav
                    ? "var(--wc-burgundy)"
                    : isMute
                      ? "var(--wc-soft)"
                      : "var(--wc-card)",
                  color: isFav ? "#fff" : isMute ? "var(--wc-mute)" : "var(--wc-ink)",
                  border: "1px solid",
                  borderColor: isFav ? "var(--wc-burgundy)" : "var(--wc-line)",
                  textDecoration: isMute ? "line-through" : "none",
                  opacity: isMute ? 0.65 : 1,
                }}
              >
                {isFav && <Star className="h-3 w-3" fill="currentColor" aria-hidden />}
                {isMute && <EyeOff className="h-3 w-3" aria-hidden />}
                {f.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
