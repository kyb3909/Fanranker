import type { Metadata } from "next"
import { TeamSquadsManager } from "@/components/admin/team-squads"

export const metadata: Metadata = { title: "선수단 사전" }
export const dynamic = "force-dynamic"

/**
 * 팀 스쿼드(선수 한글명) 사전 관리 (2026-08-16).
 * soccerway×나무위키 수확분의 빈칸·오류를 CSV 왕복으로 검수한다. 여기서 확정된 표기가
 * 라인업 한글화·경기 리포트의 선수 이름 근거가 된다.
 */
export default function AdminTeamSquadsPage() {
  return (
    <main id="main-content" tabIndex={-1} className="p-6">
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold">선수단 사전</h1>
        <p className="text-muted-foreground text-sm">
          팀별 선수 한글 표기입니다. 수확 스크립트가 나무위키 대조로 채운 것은 <b>제안</b> 상태, CSV
          로 올린 것은 <b>확정</b> — 확정은 재수확이 덮어쓰지 않습니다. 라인업과 경기 리포트가 이
          표기를 그대로 씁니다.
        </p>
      </div>
      <TeamSquadsManager />
    </main>
  )
}
