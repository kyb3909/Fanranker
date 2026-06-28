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
  /** 그룹별 TOP 10 순위 (공개). */
  rankings?: Record<string, LbRanking[]>
  myInfo: LbMyInfo | null
}

const fmtProfit = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString()}`

export function LeaderboardClient({ groups, groupAvg, rankings, myInfo }: LeaderboardClientProps) {
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

  // 디자인 시스템 공통 카드 (랜딩/신청 페이지와 동일 톤)
  const cardStyle: React.CSSProperties = {
    background: "var(--wc-card)",
    border: "1px solid var(--wc-line)",
    borderRadius: 18,
    boxShadow: "var(--wc-shadow-1)",
  }

  if (groups.length === 0) {
    return (
      <div style={{ ...cardStyle, padding: "22px 24px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--wc-ink)" }}>데이터 없음</div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--wc-ink-2)", marginTop: 4 }}>
          이벤트 또는 그룹 데이터가 없습니다. 마이그레이션이 적용됐는지 확인하세요.
        </p>
      </div>
    )
  }

  const myGroup = myInfo ? groups.find((g) => g.slug === myInfo.groupSlug) : null
  const myGroupAvg = myInfo ? groupAvgBySlug.get(myInfo.groupSlug) : null
  return (
    <div className="wc-lb">
      {/* 구너 전체 현황 — 단일 그룹(아스날 구너) 요약 카드 (디자인 시스템 화이트 카드) */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,420px)]">
        {sortedGroups.map((g) => {
          const stats = groupAvgBySlug.get(g.slug)
          if (!stats) return null
          return (
            <div key={g.slug} style={{ ...cardStyle, padding: "22px 24px" }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "-.02em",
                  color: "var(--wc-ink)",
                }}
              >
                {g.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--wc-mute)",
                  fontWeight: 600,
                  marginTop: 5,
                }}
              >
                {g.clubKor} 구너 전체
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}>
                <b
                  className="tabular-nums"
                  style={{
                    fontSize: 30,
                    fontWeight: 800,
                    letterSpacing: "-.02em",
                    color: "var(--wc-burgundy)",
                  }}
                >
                  {fmtProfit(stats.avgProfit)}
                </b>
                <span style={{ fontSize: 12.5, color: "var(--wc-mute)" }}>평균 획득 점수</span>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  marginTop: 8,
                  fontSize: 12.5,
                  color: "var(--wc-mute)",
                }}
              >
                <span>
                  적중{" "}
                  <b style={{ color: "var(--wc-ink)", fontWeight: 700 }}>{stats.avgAccuracy}%</b>
                </span>
                <span>{stats.members}명 참여</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* TOP 10 순위 — 공개 */}
      {rankings &&
        sortedGroups.map((g) => {
          const list = rankings[g.slug] ?? []
          if (list.length === 0) return null
          return (
            <div key={`top-${g.slug}`} style={{ ...cardStyle, padding: "20px 24px" }}>
              <div
                style={{ fontSize: 16, fontWeight: 800, color: "var(--wc-ink)", marginBottom: 14 }}
              >
                TOP 10
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {list.map((u, i) => (
                  <div
                    key={u.user_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 0",
                      borderTop: i === 0 ? "none" : "1px solid var(--wc-line)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <b
                        className="tabular-nums"
                        style={{
                          width: 22,
                          textAlign: "center",
                          fontSize: 14,
                          color: u.rank <= 3 ? "var(--wc-burgundy)" : "var(--wc-mute)",
                        }}
                      >
                        {u.rank}
                      </b>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--wc-ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {u.nickname}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 14,
                        fontSize: 12.5,
                        color: "var(--wc-mute)",
                        flexShrink: 0,
                      }}
                    >
                      <b
                        className="tabular-nums"
                        style={{ color: u.profit >= 0 ? "var(--wc-burgundy)" : "var(--wc-mute)" }}
                      >
                        {fmtProfit(u.profit)}
                      </b>
                      <span className="tabular-nums">{u.accuracy}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

      {/* 내 위치 — 공개 순위 */}
      {myInfo && myGroup && myGroupAvg && (
        <div
          className="wc-lb-me"
          style={
            {
              // 디자인 시스템 와인 밴드로 통일 (클럽 레드 대신 버건디) + 라운드 일치
              ["--gp" as string]: "var(--wc-burgundy)",
              borderRadius: 18,
            } as React.CSSProperties
          }
        >
          <div className="wc-lb-me-l">
            <Crown className="h-7 w-7 shrink-0" />
            <div>
              <div className="wc-lb-me-h">
                내 순위 — {myInfo.rank}위 / {myInfo.totalInGroup}명
              </div>
              <div className="wc-lb-me-sub">
                {myGroup.clubKor} 구너 {myInfo.totalInGroup}명 중
              </div>
            </div>
          </div>
          <div className="wc-lb-me-stats">
            <div className="wc-lb-me-s">
              <span>내 획득 점수</span>
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

      {/* 비등록자 안내 — 디자인 시스템 화이트 카드 + 와인 CTA */}
      {!myInfo && (
        <div
          style={{
            ...cardStyle,
            padding: 24,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--wc-ink)" }}>
              아직 참가 신청 전이에요
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--wc-ink-2)", marginTop: 4 }}>
              참가 신청하면 구너 평균과 내 위치를 볼 수 있어요.
            </p>
          </div>
          <a href="/worldcup/register" className="wc-hbtn wc-hbtn-primary" style={{ height: 44 }}>
            참가 신청하기
          </a>
        </div>
      )}

      <p className="text-center text-[11px]" style={{ color: "var(--wc-mute)" }}>
        실시간 구너 평균과 순위. 정식 집계는 32강부터 반영됩니다.
      </p>
    </div>
  )
}
