import Link from "@/components/ui/app-link"
import { STAGE_LABEL, stageIndex, STAGE_FLOW, type SagaType } from "@/lib/saga/stages"

/**
 * 글 → 사가 연결 카드 (2026-08-12).
 *
 * saga_article_links 로 기사 149건이 이미 사가에 묶여 있었지만, 글 페이지에는 그 사실이
 * 전혀 표시되지 않았다 — /saga 진입로가 앱 전체에 admin 링크 하나뿐이었던 원인.
 * 이 카드가 모든 연결 글의 하단에서 사가 문서로 가는 문이 된다.
 */

export interface SagaContextItem {
  slug: string
  title: string
  saga_type: SagaType
  stage: string
  entry_count: number
}

export function SagaContextBanner({ sagas }: { sagas: SagaContextItem[] }) {
  if (sagas.length === 0) return null

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
    >
      {sagas.map((s) => {
        const flow = STAGE_FLOW[s.saga_type]
        const idx = stageIndex(s.saga_type, s.stage)
        return (
          <Link
            key={s.slug}
            href={`/saga/${s.slug}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[.03]"
          >
            <span
              className="shrink-0 rounded px-2 py-0.5 text-[11px] font-extrabold"
              style={{ background: "rgba(139,30,63,.08)", color: "var(--wc-burgundy)" }}
            >
              {s.saga_type === "season" ? "시즌 사가" : "이적 사가"}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-[14px] font-bold"
                style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
              >
                {s.title}
              </span>
              <span className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
                {STAGE_LABEL[s.stage] ?? s.stage} 단계 · {idx + 1}/{flow.length} · 기록{" "}
                {s.entry_count}건
              </span>
            </span>
            <span className="shrink-0 text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
              전체 연대기 →
            </span>
          </Link>
        )
      })}
    </div>
  )
}
