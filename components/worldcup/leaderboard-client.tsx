"use client"

import { useState, useMemo } from "react"
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
  rankings: Record<string, LbRanking[]>
  myInfo: LbMyInfo | null
}

const fmtProfit = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString()}`

export function LeaderboardClient({ groups, groupAvg, rankings, myInfo }: LeaderboardClientProps) {
  const initialTab = myInfo?.groupSlug ?? groups[0]?.slug ?? "gooner"
  const [activeTab, setActiveTab] = useState<string>(initialTab)
  const activeGroup = groups.find((g) => g.slug === activeTab) ?? groups[0]
  const activeRankings = rankings[activeTab] ?? []
  const isMyGroup = myInfo?.groupSlug === activeTab

  const groupAvgBySlug = useMemo(() => new Map(groupAvg.map((g) => [g.slug, g])), [groupAvg])

  // 그룹 평균 카드 정렬 — rank 순 (avgProfit 내림차순)
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

  return (
    <div className="wc-lb">
      {/* Z3.2 그룹 평균 카드 (3 카드, 1/2/3위 표시, mine ring) */}
      <div className="wc-lbg-grid">
        {sortedGroups.map((g) => {
          const stats = groupAvgBySlug.get(g.slug)
          if (!stats) return null
          const isMine = g.slug === myInfo?.groupSlug
          return (
            <div
              key={g.slug}
              className={`wc-lbg-card ${isMine ? "mine" : ""}`}
              style={{ ["--gp" as string]: g.color } as React.CSSProperties}
            >
              <div aria-hidden className="wc-lbg-rank">
                {stats.rank}
              </div>
              <div className="wc-lbg-name">
                {g.name}
                {isMine && <span className="wc-lbg-mine-tag">MINE</span>}
              </div>
              <div className="wc-lbg-name-sub">{g.clubKor} 팬덤</div>
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

      {/* Z3.4 내 순위 — 활성 탭=내 그룹일 때만 (베이스라인 invariant 5 보존) */}
      {isMyGroup && myInfo && activeGroup && (
        <div
          className="wc-lb-me"
          style={{ ["--gp" as string]: activeGroup.color } as React.CSSProperties}
        >
          <div className="wc-lb-me-l">
            <Crown className="h-7 w-7 shrink-0" />
            <div>
              <div className="wc-lb-me-h">
                내 순위 #{myInfo.rank}
                <span className="wc-lb-me-handle"> / {myInfo.totalInGroup}명</span>
              </div>
              <div className="wc-lb-me-sub">
                {activeGroup.name} · {activeGroup.clubKor} 팬덤
              </div>
            </div>
          </div>
          <div className="wc-lb-me-stats">
            <div className="wc-lb-me-s">
              <span>적중률</span>
              <b>{myInfo.accuracy}%</b>
            </div>
            <div className="wc-lb-me-s">
              <span>수익 (볼)</span>
              <b className={myInfo.profit >= 0 ? "up" : ""}>{fmtProfit(myInfo.profit)}</b>
            </div>
            <div className="wc-lb-me-s">
              <span>그룹 평균</span>
              <b>{fmtProfit(groupAvgBySlug.get(activeGroup.slug)?.avgProfit ?? 0)}</b>
            </div>
            <div className="wc-lb-me-s">
              <span>정산 슬립</span>
              <b>{myInfo.settled}</b>
            </div>
          </div>
        </div>
      )}

      {/* Z3.3 그룹 탭 + Z3.5 TOP 10 테이블 */}
      <div className="wc-lb-table-card">
        <div className="wc-lb-tabs">
          {groups.map((g) => (
            <button
              key={g.slug}
              type="button"
              className={activeTab === g.slug ? "on" : ""}
              onClick={() => setActiveTab(g.slug)}
              aria-pressed={activeTab === g.slug}
            >
              {g.name}
            </button>
          ))}
        </div>

        {activeRankings.length === 0 ? (
          <div className="py-12 text-center text-[13px]" style={{ color: "var(--wc-mute)" }}>
            아직 등록자가 없습니다. 첫 번째로 합류해보세요!
          </div>
        ) : (
          <>
            <div className="wc-lb-table-h">
              <div>RANK</div>
              <div>NAME</div>
              <div className="r">적중</div>
              <div className="r">수익</div>
            </div>
            {activeRankings.map((r) => {
              const isMe = isMyGroup && !!myInfo && r.user_id === myInfo.user_id
              const rankClass =
                r.rank === 1 ? "top1" : r.rank === 2 ? "top2" : r.rank === 3 ? "top3" : ""
              return (
                <div key={r.user_id} className={`wc-lb-tr ${isMe ? "you" : ""}`}>
                  <div className={`wc-lb-rk ${rankClass}`}>{r.rank}</div>
                  <div className="wc-lb-nm">
                    <span className="truncate">{r.nickname}</span>
                  </div>
                  <div className="acc r">{r.accuracy}%</div>
                  <div className={`roi r ${r.profit >= 0 ? "up" : "down"}`}>
                    {fmtProfit(r.profit)}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Z3.6 안내 푸터 */}
      <p className="text-center text-[11px]" style={{ color: "var(--wc-mute)" }}>
        실시간 집계. 정산 완료된 슬립만 수익에 반영됩니다.
      </p>
    </div>
  )
}
