import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { PageBand } from "@/components/page-band"
import { formatRelativeTime } from "@/lib/utils/date"
import { STAGE_FLOW, STAGE_LABEL, stageIndex, type SagaType } from "@/lib/saga/stages"

export const metadata: Metadata = {
  title: "이적 사가 — 살아있는 이적설 문서",
  description:
    "이적설 하나가 문서 하나. 새 소식이 터질 때마다 문서가 자라고, 그 위에서 팬들이 예측하고 싸운다.",
  alternates: { canonical: "/saga" },
}

// 새 엔트리 발행 = 피드 범프 — 짧은 재검증으로 준실시간
export const revalidate = 60

interface SagaRow {
  id: string
  saga_type: SagaType
  slug: string
  title: string
  stage: string
  status: string
  outcome: string | null
  is_confirmed: boolean
  summary: string | null
  entry_count: number
  last_event_at: string
  subject: Record<string, unknown>
}

/**
 * 사가 인덱스 — 게시판을 "글 목록"이 아니라 "사가 인덱스"로 (PRD §1).
 * 정렬 = last_event_at desc: 이벤트가 터진 사가가 위로 올라온다(범프).
 */
export default async function SagaIndexPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("sagas")
    .select(
      "id, saga_type, slug, title, stage, status, outcome, is_confirmed, summary, entry_count, last_event_at, subject"
    )
    .order("last_event_at", { ascending: false })
    .limit(50)
  const all = (data ?? []) as unknown as SagaRow[]
  // 시즌 위키는 상단 고정 스트립 — 이적설 범프에 묻히면 팀 허브 역할을 못 한다
  const seasons = all.filter((s) => s.saga_type === "season")
  const sagas = all.filter((s) => s.saga_type !== "season")

  return (
    <div className="worldcup-scope min-h-[100dvh]" style={{ background: "var(--wc-paper)" }}>
      <PageBand
        kicker="Transfer Saga"
        title="이적 사가"
        description="이적설 하나가 문서 하나 — 소식이 터질 때마다 문서가 자랍니다. 어디까지 왔는지 보고, 결말을 예측해보세요."
      />

      <main className="mx-auto max-w-[860px] px-4 pt-6 pb-16 sm:px-6">
        {/* 팀 시즌 위키 스트립 — 이벤트 유입(Kop/Blues)의 팀 허브 착지 */}
        {seasons.length > 0 && (
          <div className="mb-5">
            <p
              className="mb-2 text-[12px] font-extrabold tracking-wide"
              style={{ color: "var(--wc-mute)" }}
            >
              팀 시즌 문서
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {seasons.map((s) => (
                <Link
                  key={s.id}
                  href={`/saga/${s.slug}`}
                  className="rounded-xl px-4 py-3 transition-shadow hover:shadow-md"
                  style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
                >
                  <p className="text-[11px] font-extrabold" style={{ color: "var(--wc-burgundy)" }}>
                    SEASON WIKI
                  </p>
                  <p
                    className="mt-0.5 text-[15px] font-extrabold"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    {s.title}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {sagas.length === 0 ? (
          <p className="py-16 text-center text-[14px]" style={{ color: "var(--wc-mute)" }}>
            아직 열린 사가가 없습니다 — 이적시장이 움직이면 여기부터 채워집니다.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {sagas.map((s) => {
              const flow = STAGE_FLOW[s.saga_type]
              const idx = stageIndex(s.saga_type, s.stage)
              const closed = s.status === "closed"
              return (
                <Link
                  key={s.id}
                  href={`/saga/${s.slug}`}
                  className="block rounded-xl px-5 py-4 transition-shadow hover:shadow-md"
                  style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
                >
                  <div className="flex items-center gap-2">
                    {/* 단계 칩 — "지금 어디까지 왔나"가 재방문 이유 (PRD §7) */}
                    <span
                      className="rounded px-1.5 py-0.5 text-[11px] font-extrabold"
                      style={{
                        background: closed ? "var(--wc-line)" : "rgba(139,30,63,.08)",
                        color: closed ? "var(--wc-mute)" : "var(--wc-burgundy)",
                      }}
                    >
                      {closed
                        ? (STAGE_LABEL[s.outcome ?? ""] ?? "종결")
                        : (STAGE_LABEL[s.stage] ?? s.stage)}
                    </span>
                    {!s.is_confirmed && !closed && (
                      <span className="text-[11px] font-bold" style={{ color: "var(--wc-mute)" }}>
                        미확인 루머
                      </span>
                    )}
                    <span
                      className="ml-auto text-[11.5px]"
                      style={{ color: "var(--wc-mute)" }}
                      suppressHydrationWarning
                    >
                      {formatRelativeTime(new Date(s.last_event_at))}
                    </span>
                  </div>

                  <h2
                    className="mt-1.5 text-[16.5px] font-extrabold"
                    style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                  >
                    {s.title}
                  </h2>
                  {s.summary && (
                    <p
                      className="mt-1 line-clamp-2 text-[13px]"
                      style={{ color: "var(--wc-mute)", wordBreak: "keep-all" }}
                    >
                      {s.summary}
                    </p>
                  )}

                  {/* 진행도 바 — stage 스테퍼 요약 */}
                  <div className="mt-3 flex items-center gap-1" aria-hidden>
                    {flow.slice(0, -1).map((st, i) => (
                      <span
                        key={st}
                        className="h-1 flex-1 rounded-full"
                        style={{
                          background:
                            i <= idx && !closed
                              ? "var(--wc-burgundy)"
                              : closed && s.outcome === "done"
                                ? "var(--wc-burgundy)"
                                : "var(--wc-line)",
                        }}
                      />
                    ))}
                    <span
                      className="ml-2 text-[11px] font-bold"
                      style={{ color: "var(--wc-mute)" }}
                    >
                      기록 {s.entry_count}건
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
