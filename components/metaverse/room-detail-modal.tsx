"use client"

/**
 * RoomDetailModal — 내가 들어가 있는 방의 상세 정보 표시.
 *
 * 표시 내용:
 *  - 간판 텍스트 (sign_text)
 *  - 광장 + Plot 코드
 *  - 방장 닉네임 (프로필 API fetch)
 *  - 생성 시각
 *  - 접속자 수
 *  - 공유 링크 — 이 Plot 으로 deep-link (Phase 3.15 에서 /metaverse?plot=xxx 처리)
 *
 * 방장 본인은 여기서 바로 방 닫기 불가 — PlotActionOverlay 의 별도 버튼 사용.
 */

import { useEffect, useState } from "react"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

export interface RoomDetailContext {
  roomId: string
  plotId: string
  plotCode: string
  plazaName: string
  ownerUserId: string
}

interface OwnerProfile {
  nickname: string
  avatar_url: string | null
}

interface RoomMeta {
  id: string
  signText: string
  createdAt: string
  lastActivityAt: string
}

export function RoomDetailModal({
  context,
  identity,
  occupantCount,
  onClose,
}: {
  context: RoomDetailContext | null
  identity: MetaversePlayerIdentity
  occupantCount: number
  onClose: () => void
}) {
  const [owner, setOwner] = useState<OwnerProfile | null>(null)
  const [meta, setMeta] = useState<RoomMeta | null>(null)
  const [copied, setCopied] = useState(false)

  // 모달 열려있는 동안 씬 이동 차단
  useEffect(() => {
    if (!context) return
    sceneBridge.emit("chat:input:open")
    return () => sceneBridge.emit("chat:input:close")
  }, [context])

  // 오너 프로필 + 방 메타 fetch — guest 오너일 경우 nickname 없음
  useEffect(() => {
    if (!context) {
      setOwner(null)
      setMeta(null)
      return
    }
    let cancelled = false

    ;(async () => {
      if (!context.ownerUserId.startsWith("guest-")) {
        try {
          const res = await fetch(`/api/profile/${context.ownerUserId}`)
          if (res.ok) {
            const data = await res.json()
            if (!cancelled)
              setOwner({
                nickname: data?.profile?.nickname ?? "알 수 없음",
                avatar_url: data?.profile?.avatar_url ?? null,
              })
          }
        } catch {
          /* ignore */
        }
      } else {
        if (!cancelled)
          setOwner({
            nickname: `게스트 (${context.ownerUserId.slice(0, 14)}…)`,
            avatar_url: null,
          })
      }

      // 방 메타는 plots API 에서 받은 rooms 로 이미 알고 있지만 최신값 재조회
      try {
        const res = await fetch("/api/metaverse/plots")
        if (res.ok) {
          const data = await res.json()
          const room = (data.rooms ?? []).find((r: { id: string }) => r.id === context.roomId)
          if (room && !cancelled) {
            setMeta({
              id: room.id,
              signText: room.signText,
              createdAt: room.createdAt,
              lastActivityAt: room.lastActivityAt,
            })
          }
        }
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [context])

  const copyShareLink = async () => {
    if (!context || typeof window === "undefined") return
    const url = `${window.location.origin}/metaverse?plot=${encodeURIComponent(context.plotCode)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard 실패 시 무시 */
    }
  }

  if (!context) return null

  const isOwnerMe = context.ownerUserId === identity.userId
  const createdLabel = meta?.createdAt
    ? new Date(meta.createdAt).toLocaleString("ko-KR", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[min(92vw,440px)] rounded-lg border border-white/10 bg-neutral-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-white/40 uppercase">
              방 정보
            </p>
            <h2 className="mt-1 text-base font-bold break-all text-white">
              🪧 {meta?.signText ?? "…"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 transition-colors hover:text-white"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <dl className="mt-5 space-y-2 text-[12px]">
          <Row label="위치">
            <span className="text-white">{context.plazaName}</span>
            <span className="text-white/40"> · {context.plotCode}</span>
          </Row>
          <Row label="방장">
            <span className="text-white">{owner?.nickname ?? "로딩 중…"}</span>
            {isOwnerMe && (
              <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
                나
              </span>
            )}
          </Row>
          <Row label="생성">
            <span className="text-white/85">{createdLabel}</span>
          </Row>
          <Row label="접속자">
            {occupantCount > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                <span className="tabular-nums">{occupantCount}명</span>
              </span>
            ) : (
              <span className="text-white/50">— 명</span>
            )}
          </Row>
        </dl>

        <div className="mt-5 space-y-2">
          <button
            onClick={copyShareLink}
            className="flex w-full items-center justify-between rounded border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white transition-colors hover:bg-white/10"
          >
            <span className="text-white/70">공유 링크 복사</span>
            <span
              className={`text-[11px] font-semibold transition-colors ${
                copied ? "text-emerald-300" : "text-white/60"
              }`}
            >
              {copied ? "복사됨" : "/metaverse?plot=" + context.plotCode}
            </span>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded bg-white/10 px-4 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-white/20"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="w-14 flex-shrink-0 text-[11px] text-white/40">{label}</dt>
      <dd className="flex-1 text-white/90">{children}</dd>
    </div>
  )
}
