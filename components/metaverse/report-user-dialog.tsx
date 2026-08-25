"use client"

/**
 * ReportUserDialog — 메타버스 유저 신고 모달.
 *
 * 사유 select + 선택적 상세 입력 + 제출.
 * 성공 시 토스트, 409 (오늘 이미 신고) 시 별도 안내.
 */

import { useEffect, useState } from "react"
import { sceneBridge } from "@/lib/metaverse/scene-bridge"
import { METAVERSE_GUEST_HEADER } from "@/lib/metaverse/constants"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

export interface ReportTarget {
  userId: string
  nickname: string
}

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "spam", label: "도배/광고" },
  { value: "abuse", label: "욕설/비방" },
  { value: "hate", label: "혐오 발언" },
  { value: "sexual", label: "성적 내용" },
  { value: "harassment", label: "희롱/괴롭힘" },
  { value: "impersonation", label: "사칭" },
  { value: "other", label: "기타" },
]

const ERROR_MESSAGES: Record<string, string> = {
  duplicate_today: "오늘 이미 이 유저를 신고하셨어요.",
  invalid_reason: "사유를 선택해주세요.",
  cannot_report_self: "본인은 신고할 수 없어요.",
  reported_user_id_required: "대상 유저 정보가 없어요.",
  unauthorized: "로그인이 필요해요.",
}

export function ReportUserDialog({
  target,
  identity,
  onClose,
}: {
  target: ReportTarget | null
  identity: MetaversePlayerIdentity
  onClose: () => void
}) {
  const [reason, setReason] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // 모달 열리면 씬 이동 차단
  useEffect(() => {
    if (!target) return
    sceneBridge.emit("chat:input:open")
    return () => sceneBridge.emit("chat:input:close")
  }, [target])

  useEffect(() => {
    if (target) {
      setReason("")
      setNote("")
      setError(null)
      setDone(false)
    }
  }, [target])

  if (!target) return null

  const submit = async () => {
    if (!reason) {
      setError(ERROR_MESSAGES.invalid_reason)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" }
      if (identity.userId.startsWith("guest-")) {
        headers[METAVERSE_GUEST_HEADER] = identity.userId
      }
      const res = await fetch("/api/metaverse/reports", {
        method: "POST",
        headers,
        body: JSON.stringify({
          reportedUserId: target.userId,
          reason,
          note: note.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const key = (data.error ?? "unknown") as string
        setError(ERROR_MESSAGES[key] ?? `신고 실패 (${key})`)
        return
      }
      setDone(true)
      setTimeout(onClose, 1500)
    } catch (err) {
      console.error("[metaverse] report failed", err)
      setError("요청 실패. 잠시 후 다시 시도해주세요.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[min(92vw,420px)] rounded-lg border border-white/10 bg-neutral-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] font-semibold tracking-wider text-white/40 uppercase">신고</p>
            <h2 className="mt-1 text-base font-bold break-all text-white">🚩 {target.nickname}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 transition-colors hover:text-white"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {done ? (
          <div className="mt-6 rounded border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
            <p className="text-sm text-emerald-200">신고가 접수됐어요.</p>
            <p className="mt-1 text-[12px] text-emerald-300/70">관리자가 검토 후 조치합니다.</p>
          </div>
        ) : (
          <>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-[12px] font-semibold text-white/70">사유</span>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {REASON_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setReason(opt.value)
                        if (error) setError(null)
                      }}
                      className={`rounded border px-2 py-1.5 text-[12px] transition-colors ${
                        reason === opt.value
                          ? "border-red-400/70 bg-red-500/20 text-red-100"
                          : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </label>

              <label className="block">
                <span className="text-[12px] font-semibold text-white/70">
                  상세 설명 <span className="text-white/40">(선택 · 최대 500자)</span>
                </span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="관리자 검토에 도움되는 맥락이 있으면 적어주세요"
                  className="mt-1 w-full rounded border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-white/30 focus:border-white/30 focus:outline-none"
                />
                <div className="mt-0.5 text-right text-[12px] text-white/40 tabular-nums">
                  {note.length}/500
                </div>
              </label>
            </div>

            {error && (
              <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                {error}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between">
              <p className="text-[12px] text-white/40">허위 신고 반복 시 제재될 수 있어요</p>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded px-3 py-1.5 text-[12px] text-white/60 transition-colors hover:text-white disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  onClick={submit}
                  disabled={submitting || !reason}
                  className="rounded bg-red-500/80 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-40"
                >
                  {submitting ? "전송 중…" : "신고"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
