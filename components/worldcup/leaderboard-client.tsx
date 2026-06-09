"use client"

import { useMemo } from "react"
import { Crown } from "lucide-react"

export interface LbGroup {
  slug: string
  name: string
  clubKor: string | null
  color: string
}

export interface LbGroupAvg {
  slug: string
  avgProfit: number
  avgAccuracy: number
  members: number
  rank: number
}

export interface LbRanking {
  user_id: string
  nickname: string
  profit: number
  accuracy: number
  settled: number
  rank: number
}

export interface LbMyInfo {
  user_id: string
  groupSlug: string
  rank: number
  totalInGroup: number
  profit: number
  accuracy: number
  settled: number
}

interface LeaderboardClientProps {
  groups: LbGroup[]
  groupAvg: LbGroupAvg[]
  /** TOP 10 list — 의욕 상실 방지 위해 client 에 노출하지 않음. 데이터는 props 로 받지만 사용 X (시그니처 호환). */
  rankings?: Record<string, LbRanking[]>
  myInfo: LbMyInfo | null
}

const fmtProfit = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString()}`

/** rank / totalInGroup → '상위 N%' 부드러운 표현 */
function fmtPercentile(rank: number, total: number): string {
  if (total <= 1) return "—"
  const pct = Math.round((rank / total) * 100)
  return `상위 ${Math.max(1, pct)}%`
}

export function LeaderboardClient({ groups, groupAvg, myInfo }: LeaderboardClientProps) {
  const groupAvgBySlug = useMemo(() => new Map(groupAvg.map((g) => [g.slug, g])), [groupAvg])

  // 그룹 카드 정렬 — rank 순 (avgProfit 내림차순)
  const sortedGroups = useMemo(
    () =>
      [...groups].sort((a, b) => {
        const ra = groupAvgBySlug.get(a.slug)?.rank ?? 99
        const rb = groupAvgBySlug.get(b.slug)?.rank ?? 99
        return ra - rb
      }),
    [groups, groupAvgBySlug]
  )

  if (groups.length === 0) {
    return (
      <div className="wc-reg-rules">
        <div className="wc-reg-rules-h">데이터 없음</div>
        <p className="text-[13px] leading-[1.6]">
          이벤트 또는 그룹 데이터가 없습니다. 마이그레이션이 적용됐는지 확인하세요.
        </p>
      </div>
    )
  }

  const myGroup = myInfo ? groups.find((g) => g.slug === myInfo.groupSlug) : null
  const myGroupAvg = myInfo ? groupAvgBySlug.get(myInfo.groupSlug) : null
  return (
    <div className="wc-lb">
      {/* 구너 전체 현황 — 단일 그룹(아스날 구너) 요약 카드 */}
      <div className="wc-lbg-grid">
        {sortedGroups.map((g) => {
          const stats = groupAvgBySlug.get(g.slug)
          if (!stats) return null
          return (
            <div
              key={g.slug}
              className="wc-lbg-card mine"
              style={{ ["--gp" as string]: g.color } as React.CSSProperties}
            >
              <div className="wc-lbg-name">{g.name}</div>
              <div className="wc-lbg-name-sub">{g.clubKor} 구너 전체</div>
              <div className="wc-lbg-roi">
                <b>{fmtProfit(stats.avgProfit)}</b>
                <span>평균 수익 (볼)</span>
              </div>
              <div className="wc-lbg-meta">
                <span>
                  적중 <b>{stats.avgAccuracy}%</b>
                </span>
                <span>{stats.members}명</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 내 위치 — percentile (구체 ranking 숨김, 의욕 상실 방지) */}
      {myInfo && myGroup && myGroupAvg && (
        <div
          className="wc-lb-me"
          style={{ ["--gp" as string]: myGroup.color } as React.CSSProperties}
        >
          <div className="wc-lb-me-l">
            <Crown className="h-7 w-7 shrink-0" />
            <div>
              <div className="wc-lb-me-h">
                내 위치 — {fmtPercentile(myInfo.rank, myInfo.totalInGroup)}
              </div>
              <div className="wc-lb-me-sub">
                {myGroup.clubKor} 구너 {myInfo.totalInGroup}명 중
              </div>
            </div>
          </div>
          <div className="wc-lb-me-stats">
            <div className="wc-lb-me-s">
              <span>내 수익 (볼)</span>
              <b className={myInfo.profit >= 0 ? "up" : ""}>{fmtProfit(myInfo.profit)}</b>
            </div>
            <div className="wc-lb-me-s">
              <span>적중률</span>
              <b>{myInfo.accuracy}%</b>
            </div>
            <div className="wc-lb-me-s">
              <span>구너 평균</span>
              <b>{fmtProfit(myGroupAvg.avgProfit)}</b>
            </div>
            <div className="wc-lb-me-s">
              <span>완료된 예측</span>
              <b>{myInfo.settled}</b>
            </div>
          </div>
        </div>
      )}

      {/* 비등록자 안내 */}
      {!myInfo && (
        <div className="wc-reg-rules">
          <div className="wc-reg-rules-h">아직 참가 신청 전</div>
          <p className="text-[13px] leading-[1.6]">
            참가 신청하면 구너 평균과 내 위치를 볼 수 있어요.{" "}
            <a
              href="/worldcup/register"
              className="underline"
              style={{ color: "var(--wc-burgundy)" }}
            >
              지금 참가 신청하기 →
            </a>
          </p>
        </div>
      )}

      <p className="text-center text-[11px]" style={{ color: "var(--wc-mute)" }}>
        실시간 구너 평균. 개별 순위는 종료 시점 결과 발표에서 공개됩니다.
      </p>
    </div>
  )
}
