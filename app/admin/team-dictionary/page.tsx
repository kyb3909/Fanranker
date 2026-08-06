import type { Metadata } from "next"
import { TeamDictionaryManager } from "@/components/admin/team-dictionary"

export const metadata: Metadata = { title: "팀 사전 · 경기 매핑" }
export const dynamic = "force-dynamic"

/**
 * 팀 사전 + betman↔Soccerway 경기 매핑 관리 (실록 단계 2-B).
 * 데이터는 클라이언트가 /api/admin/team-dictionary 로 가져온다 (SWR — 등재 직후 갱신).
 */
export default function AdminTeamDictionaryPage() {
  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">팀 사전 · 경기 매핑</h1>
        <p className="text-muted-foreground text-sm">
          betman 한글 팀명을 Soccerway 팀에 잇는 사전입니다. 발견 에이전트가 검색+경기 대조로 검증한
          팀을 <b>제안 상태</b>로 자동 등재하고, 확정(실기록 자격)은 사람 클릭만 — 여기서 훑어보고
          승격해 주세요.
        </p>
      </div>
      <TeamDictionaryManager />
    </main>
  )
}
