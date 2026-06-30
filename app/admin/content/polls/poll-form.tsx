"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function PollForm() {
  const router = useRouter()
  const [question, setQuestion] = useState("")
  const [options, setOptions] = useState<string[]>(["", ""])
  const [allowReason, setAllowReason] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setOption(i: number, v: string) {
    setOptions((o) => o.map((x, idx) => (idx === i ? v : x)))
  }
  function addOption() {
    setOptions((o) => (o.length < 6 ? [...o, ""] : o))
  }
  function removeOption(i: number) {
    setOptions((o) => (o.length > 2 ? o.filter((_, idx) => idx !== i) : o))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const opts = options.map((o) => o.trim()).filter(Boolean)
    if (question.trim().length < 2) {
      setError("질문을 입력하세요.")
      return
    }
    if (opts.length < 2) {
      setError("선택지를 2개 이상 입력하세요.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), options: opts, allowReason }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || "생성에 실패했습니다.")
        return
      }
      setQuestion("")
      setOptions(["", ""])
      setAllowReason(true)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border p-4">
      <label className="block text-sm font-semibold">질문</label>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={200}
        placeholder="예) 다음 영입 1순위는?"
        className="mt-1 mb-3 w-full rounded-md border px-3 py-2 text-sm"
      />

      <label className="block text-sm font-semibold">선택지 (2~6개)</label>
      <div className="mt-1 space-y-2">
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={o}
              onChange={(e) => setOption(i, e.target.value)}
              maxLength={100}
              placeholder={`선택지 ${i + 1}`}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="rounded-md border px-3 text-sm"
              >
                삭제
              </button>
            )}
          </div>
        ))}
      </div>
      {options.length < 6 && (
        <button
          type="button"
          onClick={addOption}
          className="mt-2 text-sm font-medium text-blue-600"
        >
          + 선택지 추가
        </button>
      )}

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allowReason}
          onChange={(e) => setAllowReason(e.target.checked)}
        />
        투표 후 &quot;왜?&quot; 한 줄 입력 받기
      </label>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "생성 중..." : "설문 생성 (즉시 노출)"}
      </button>
    </form>
  )
}
