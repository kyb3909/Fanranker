import type { Metadata } from "next"
import Link from "next/link"
import { getStaffRole } from "@/lib/admin/roles"
import { loadDashboardData } from "./_dashboard/data"
import { ControlCenter } from "./_control-center/control-center"
import { ReportBudgetCard } from "./_dashboard/report-budget-card"
import {
  MiniNewsDeck,
  Widget,
  SquadReviewList,
  BlockedPlayerRegisterList,
  ParticipationPanel,
  TickerModPanel,
  RefreshButton,
  WINE,
} from "./_dashboard/widgets"

/**
 * 관제 센터 — 관리자의 **유일한** 첫 화면 (2026-09-08 통합).
 *
 * 종전에는 `/admin`(관제실)과 `/admin2`(작업대)가 각자 다른 집계를 보여줘, 전체 상황을
 * 알려면 둘을 번갈아 열어야 했다. 이제 `/admin2` 는 대응 화면으로 넘어가고 여기 하나만 남는다.
 *
 * 위: 관측 상태 → 지금 할 일 → 업무별 현황 → 기다리는 일 → 최근 결과 (`<ControlCenter />`).
 * 아래: **홈에서 바로 처리하던 작업**은 그대로 둔다 — 뉴스 검수 덱, 이름 등재, 스쿼드 검수,
 * 티커 삭제, 참여도. 운영자가 매일 쓰던 인라인 처리를 통합하면서 잃지 않는다.
 */

export const metadata: Metadata = { title: "관제 센터" }
export const dynamic = "force-dynamic"

export default async function AdminControlCenterPage() {
  const role = await getStaffRole()
  const d = await loadDashboardData()

  return (
    <>
      <ControlCenter />

      <div className="w-full px-4 pb-6 sm:px-6 2xl:px-8">
        {/* 아래 영역은 서버에서 그린다 — 위 관제 센터의 새로고침(API 재조회)과 별개다 */}
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-sm font-bold">여기서 바로 처리</h2>
          <span className="text-muted-foreground text-[11px]">
            뉴스 검수 · 이름 등재 · 스쿼드 검수 · 티커 정리
          </span>
          <span className="ml-auto">
            <RefreshButton />
          </span>
        </div>

        {/* ── 홈에서 바로 하는 일 ① 뉴스 검수 — 원문·초안 2열, P/R 유예 커밋 ── */}
        <Widget
          kicker="NEWS DESK"
          title="뉴스 검수"
          count={d.newsTotal}
          tone={d.news.some((n) => n.breaking) ? "danger" : "default"}
          headerRight={
            <Link href="/admin/news-review" className="text-muted-foreground text-[11px] underline">
              검수 페이지 (편집·사가 연결) →
            </Link>
          }
        >
          <MiniNewsDeck items={d.news} />
        </Widget>

        {/* ── ② 선수 이름 등록 대기 → 스쿼드 검수 백로그 (운영자 지정 순서) ── */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Widget
            kicker="NOTATION"
            title="선수 이름 등록 대기"
            count={d.dictCandidates}
            className="xl:col-span-6"
            tone={d.dictCandidates > 0 ? "danger" : "default"}
          >
            {/* 무엇을 하라는 패널인지 첫 줄에 못박는다 (운영자: "뭘 어쩌라는 건지 모르겠어") */}
            <p className="text-muted-foreground mb-2 text-xs leading-relaxed">
              사전에 없는 선수 이름에 걸려 <b>사가로 못 들어간 소식</b>들입니다. 한글 표기를
              확인하고 <b>등재</b>를 누르면 그 선수의 소식이 다음 처리 회차에 자동으로 풀립니다.
              행에 마우스를 올리면 근거 기사 제목이 보입니다.
            </p>
            <BlockedPlayerRegisterList rows={d.blockedPlayers} />
            {d.blockedUnparsed > 0 && (
              <p className="mt-2 rounded bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                ⚠️ 그 외 <b className="tabular-nums">{d.blockedUnparsed}</b>건은 이름 추출 자체가
                실패한 잔여물 — 표기 등록으로는 안 풀립니다. 일괄 정리가 따로 필요합니다.
              </p>
            )}
            <Link
              href="/admin/news-review"
              className="mt-2 self-start text-[11px] font-bold underline"
              style={{ color: WINE }}
            >
              등록 화면 열기 →
            </Link>
          </Widget>

          <Widget
            kicker="SQUAD"
            title="스쿼드 검수 백로그"
            count={d.squadBacklog}
            className="xl:col-span-6"
            headerRight={
              <span className="text-muted-foreground text-[11px]">마감 없음 — 틈날 때 한 줄씩</span>
            }
          >
            {/* 초안이 입력칸 — 고치고 싶으면 그 자리에서 고친 뒤 승인 (Enter = 승인) */}
            <SquadReviewList rows={d.squadPreview} />
            <Link
              href="/admin/team-squads"
              className="mt-2 self-start text-[11px] font-bold underline"
              style={{ color: WINE }}
            >
              선수단 사전 전체 열기 →
            </Link>
          </Widget>
        </div>

        {/* ── ③ 티커 정리 + 참여도 — 급한 일이 아니라 아래에 둔다 ── */}
        <ReportBudgetCard canManage={role === "admin"} />
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-5">
            <TickerModPanel items={d.ticker.recent} />
          </div>
          <div className="xl:col-span-7">
            <ParticipationPanel rows={d.participation} />
            <p className="text-muted-foreground mt-2 px-1 text-[11px]">
              진행 중 경기 <b className="text-foreground tabular-nums">{d.activeGames}</b>
              {d.dailyRound.roundNum != null && (
                <>
                  {" · "}회차{" "}
                  <b className="text-foreground tabular-nums">{d.dailyRound.roundNum}</b>
                  {d.dailyRound.closeAt && (
                    <>
                      {" "}
                      (마감{" "}
                      {new Date(d.dailyRound.closeAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      )
                    </>
                  )}
                </>
              )}
              {role === "editor" && " · 검수 담당 계정으로 보고 있습니다"}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
