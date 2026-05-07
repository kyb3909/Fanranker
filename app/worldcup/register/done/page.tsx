import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { Countdown } from "@/components/worldcup/countdown"

const GROUPS = {
  gooner: {
    name: "Gooner",
    clubKor: "아스날",
    color: "#EF0107",
    motto: "Victoria Concordia Crescit",
  },
  kop: {
    name: "Kopite",
    clubKor: "리버풀",
    color: "#C8102E",
    motto: "You'll Never Walk Alone",
  },
  blues: {
    name: "Blue",
    clubKor: "첼시",
    color: "#034694",
    motto: "Pride of London",
  },
} as const

type GroupSlug = keyof typeof GROUPS

export const metadata: Metadata = {
  title: "등록 완료 — 월드컵 이벤트",
  description: "월드컵 이벤트 사전 등록을 완료했습니다. 이벤트 시작까지 카운트다운.",
  alternates: { canonical: "/worldcup/register/done" },
  robots: { index: false }, // 직접 URL 접근은 가능하지만 검색엔진 인덱싱 X
}

interface PageProps {
  searchParams: Promise<{ group?: string }>
}

export default async function RegisterDonePage({ searchParams }: PageProps) {
  const sp = await searchParams
  const slug: GroupSlug =
    sp.group === "gooner" || sp.group === "kop" || sp.group === "blues" ? sp.group : "gooner"
  const group = GROUPS[slug]

  return (
    <div className="wc-done" style={{ ["--gp" as string]: group.color } as React.CSSProperties}>
      <div className="wc-done-bg">
        <div className="wc-done-orb" />
        <div className="wc-done-grid" />
      </div>

      <div className="wc-done-content">
        <div className="mx-auto max-w-4xl px-4">
          {/* Hero */}
          <header className="wc-done-hero">
            <div className="wc-done-eb">YOU&apos;RE IN</div>
            <h1 className="wc-done-h1">
              <span style={{ color: group.color }}>{group.name}</span> 합류 완료
            </h1>
            <p className="wc-done-tagline">&ldquo;{group.motto}&rdquo;</p>
            <p className="wc-done-sub">
              {group.clubKor} 팬덤 그룹에 합류했어요. 월드컵 시작일에 알림 보내드릴게요. 그동안 다른
              그룹의 슬립과 리더보드를 둘러보세요.
            </p>
            <div className="wc-done-cd-wrap">
              <Countdown target="2026-06-11T00:00:00+09:00" label="이벤트 시작까지" />
            </div>
          </header>

          {/* Action cards */}
          <div className="wc-done-cards">
            <div className="wc-done-card">
              <div className="wc-done-card-h">리더보드 미리보기</div>
              <p className="wc-done-card-b">
                {group.name} 그룹의 다른 멤버 적중률·수익률을 확인하세요.
              </p>
              <Link href="/worldcup/leaderboard" className="wc-done-card-cta">
                리더보드로 →
              </Link>
            </div>
            <div className="wc-done-card">
              <div className="wc-done-card-h">친구 초대</div>
              <p className="wc-done-card-b">
                같은 팬덤 친구를 같은 그룹에 합류시키면 그룹 평균이 올라갑니다.
              </p>
              <Link href="/worldcup" className="wc-done-card-cta">
                안내 페이지 공유
              </Link>
            </div>
            <div className="wc-done-card">
              <div className="wc-done-card-h">이벤트 안내로</div>
              <p className="wc-done-card-b">일정·규칙·진행 방식을 다시 확인하세요.</p>
              <Link href="/worldcup" className="wc-done-card-cta">
                안내로 가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
