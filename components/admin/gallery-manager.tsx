"use client"

import Image from "next/image"
import { useState } from "react"
import useSWR from "swr"
import { Loader2, Trash2 } from "lucide-react"

interface GalleryRow {
  id: string
  tweet_url: string
  author_name: string | null
  author_handle: string | null
  media: { url: string; thumbnail_url?: string | null }[]
  tag: string | null
}

const fetcher = (u: string) => fetch(u).then((r) => r.json())

/** 트윗 URL 여러 줄 등록 + 목록/삭제. 데이터는 /api/gallery, 쓰기는 /api/admin/gallery. */
export function GalleryManager() {
  const { data, mutate } = useSWR<{ items: GalleryRow[] }>("/api/gallery?limit=200", fetcher)
  const [input, setInput] = useState("")
  const [tag, setTag] = useState("")
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<string | null>(null)

  async function register() {
    const urls = input
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (urls.length === 0 || busy) return
    setBusy(true)
    setReport(null)
    try {
      const res = await fetch("/api/admin/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, ...(tag.trim() ? { tag: tag.trim() } : {}) }),
      })
      const d = await res.json()
      if (!res.ok) {
        setReport(d?.error ?? "등록에 실패했습니다.")
      } else {
        type R = { ok: boolean; url: string; reason?: string }
        const failed = (d.results ?? []).filter((r: R) => !r.ok)
        // 등록됐지만 일부 사진이 인물 아님 판정으로 빠진 경우도 알려준다
        const partial = (d.results ?? []).filter((r: R) => r.ok && r.reason)
        setReport(
          `${d.registered}건 등록` +
            (partial.length ? ` · ${partial.map((p: R) => p.reason).join(" / ")}` : "") +
            (failed.length
              ? ` · 실패 ${failed.length}건: ${failed
                  .map((f: R) => `${f.url} (${f.reason})`)
                  .join(", ")}`
              : "")
        )
        setInput("")
        mutate()
      }
    } catch {
      setReport("네트워크 오류가 발생했습니다.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await fetch("/api/admin/gallery", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    mutate()
  }

  const items = data?.items ?? []

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-lg border p-4">
        <label
          htmlFor="gallery-urls"
          className="text-foreground mb-1.5 block text-sm font-semibold"
        >
          트윗 URL (한 줄에 하나, 최대 20개)
        </label>
        <textarea
          id="gallery-urls"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          placeholder={"https://x.com/작성자/status/...\nhttps://x.com/작성자/status/..."}
          className="bg-background w-full rounded-md border px-3 py-2 font-mono text-sm outline-none"
        />
        <div className="mt-2 flex items-center gap-2">
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="태그 (선택 — 예: 그룹명)"
            className="bg-background w-48 rounded-md border px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={register}
            disabled={busy || !input.trim()}
            className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            등록
          </button>
        </div>
        {report && <p className="text-muted-foreground mt-2 text-sm break-all">{report}</p>}
      </div>

      <div>
        <h2 className="text-foreground mb-2 text-sm font-bold">등록된 항목 ({items.length})</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {items.map((item) => {
            const thumb = item.media?.[0]?.thumbnail_url || item.media?.[0]?.url
            return (
              <div key={item.id} className="bg-card overflow-hidden rounded-md border">
                <div className="bg-muted relative aspect-square">
                  {thumb && (
                    <Image
                      src={thumb}
                      alt={item.author_name ?? ""}
                      fill
                      sizes="200px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <span className="text-muted-foreground truncate text-[11px]">
                    {item.author_handle || item.author_name || "-"}
                    {item.media.length > 1 ? ` · ${item.media.length}장` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    aria-label="삭제"
                    className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
