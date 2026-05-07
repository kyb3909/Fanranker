"use client"

import { useState } from "react"
import { Crown } from "lucide-react"

const GROUPS = [
  { slug: "gooner", name: "Gooner", clubKor: "아스날", color: "#EF0107" },
  { slug: "kop", name: "Kopite", clubKor: "리버풀", color: "#C8102E" },
  { slug: "blues", name: "Blue", clubKor: "첼시", color: "#034694" },
] as const

type GroupSlug = (typeof GROUPS)[number]["slug"]

const GROUP_AVG: Record<
  GroupSlug,
  { accuracy: number; profitRate: number; members: number; rank: 1 | 2 | 3 }
> = {
  gooner: { accuracy: 61, profitRate: 17, members: 521, rank: 2 },
  kop: { accuracy: 58, profitRate: 12, members: 432, rank: 3 },
  blues: { accuracy: 64, profitRate: 21, members: 387, rank: 1 },
}

const RANKINGS: Record<
  GroupSlug,
  { rank: number; nickname: string; accuracy: number; profitRate: number }[]
> = {
  gooner: [
    { rank: 1, nickname: "고너스1886", accuracy: 76, profitRate: 51 },
    { rank: 2, nickname: "벵거유산", accuracy: 73, profitRate: 44 },
    { rank: 3, nickname: "에미레이츠99", accuracy: 70, profitRate: 38 },
    { rank: 4, nickname: "아르테타볼", accuracy: 68, profitRate: 32 },
    { rank: 5, nickname: "AFC4ever", accuracy: 66, profitRate: 27 },
    { rank: 6, nickname: "헨리시그니처", accuracy: 64, profitRate: 23 },
    { rank: 7, nickname: "노스런던빨강", accuracy: 62, profitRate: 19 },
    { rank: 8, nickname: "구너의자존심", accuracy: 60, profitRate: 15 },
    { rank: 9, nickname: "Highbury", accuracy: 58, profitRate: 12 },
    { rank: 10, nickname: "Gunner4Life", accuracy: 57, profitRate: 10 },
  ],
  kop: [
    { rank: 1, nickname: "콥팬123", accuracy: 78, profitRate: 56 },
    { rank: 2, nickname: "유클롭", accuracy: 75, profitRate: 48 },
    { rank: 3, nickname: "안필드의왕", accuracy: 71, profitRate: 41 },
    { rank: 4, nickname: "YNWA98", accuracy: 69, profitRate: 35 },
    { rank: 5, nickname: "리버풀러", accuracy: 67, profitRate: 30 },
    { rank: 6, nickname: "스카우저FC", accuracy: 65, profitRate: 26 },
    { rank: 7, nickname: "콥123", accuracy: 64, profitRate: 22 },
    { rank: 8, nickname: "안필드킹", accuracy: 62, profitRate: 18 },
    { rank: 9, nickname: "RedKop", accuracy: 60, profitRate: 14 },
    { rank: 10, nickname: "메르시사이드", accuracy: 58, profitRate: 11 },
  ],
  blues: [
    { rank: 1, nickname: "블루스영원히", accuracy: 81, profitRate: 64 },
    { rank: 2, nickname: "스탬포드98", accuracy: 77, profitRate: 52 },
    { rank: 3, nickname: "킹스로드", accuracy: 74, profitRate: 45 },
    { rank: 4, nickname: "체프시", accuracy: 71, profitRate: 38 },
    { rank: 5, nickname: "코스타1", accuracy: 69, profitRate: 32 },
    { rank: 6, nickname: "프랭크람파드", accuracy: 67, profitRate: 28 },
    { rank: 7, nickname: "블루이즈더컬러", accuracy: 65, profitRate: 24 },
    { rank: 8, nickname: "시저2007", accuracy: 63, profitRate: 20 },
    { rank: 9, nickname: "이즐링턴제이크", accuracy: 61, profitRate: 16 },
    { rank: 10, nickname: "체후크", accuracy: 59, profitRate: 13 },
  ],
}

const MY_INFO = {
  groupSlug: "gooner" as GroupSlug,
  rank: 14,
  totalInGroup: 521,
  accuracy: 64,
  profitRate: 18,
  nickname: "(나)",
}

/** Q7 트렌드 카드 — 어제→오늘 순위 변동 mock */
const TREND_DATA: ReadonlyArray<{
  nickname: string
  group: GroupSlug
  deltaRank: number
  prevRank: number
  currRank: number
}> = [
  { nickname: "벵거유산", group: "gooner", deltaRank: 12, prevRank: 14, currRank: 2 },
  { nickname: "코스타1", group: "blues", deltaRank: 9, prevRank: 14, currRank: 5 },
  { nickname: "리버풀러", group: "kop", deltaRank: 7, prevRank: 12, currRank: 5 },
  { nickname: "Highbury", group: "gooner", deltaRank: 6, prevRank: 15, currRank: 9 },
  { nickname: "체후크", group: "blues", deltaRank: 5, prevRank: 15, currRank: 10 },
]

export function LeaderboardClient() {
  const [activeTab, setActiveTab] = useState<GroupSlug>(MY_INFO.groupSlug)
  const activeGroup = GROUPS.find((g) => g.slug === activeTab)!
  const rankings = RANKINGS[activeTab]
  const isMyGroup = activeTab === MY_INFO.groupSlug

  // 그룹 평균 카드 정렬 — rank 순
  const sortedGroups = [...GROUPS].sort((a, b) => GROUP_AVG[a.slug].rank - GROUP_AVG[b.slug].rank)

  return (
    <div className="wc-lb">
      {/* Z3.2 그룹 평균 카드 (3 카드, 1/2/3위 표시, mine ring) */}
      <div className="wc-lbg-grid">
        {sortedGroups.map((g) => {
          const stats = GROUP_AVG[g.slug]
          const isMine = g.slug === MY_INFO.groupSlug
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
                <b>+{stats.profitRate}%</b>
                <span>평균 수익률</span>
              </div>
              <div className="wc-lbg-meta">
                <span>
                  적중 <b>{stats.accuracy}%</b>
                </span>
                <span>{stats.members}명</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Q7 트렌드 grid — 어제→오늘 큰 변동 5명 */}
      <div>
        <div className="wc-lb-trend-h">
          <h3>오늘 가장 많이 오른 5명</h3>
          <span>어제 → 오늘 순위 변동</span>
        </div>
        <div className="wc-lb-trend-grid">
          {TREND_DATA.map((t) => {
            const g = GROUPS.find((x) => x.slug === t.group)!
            const isUp = t.deltaRank > 0
            return (
              <div
                key={t.nickname}
                className="wc-lbt-c"
                style={{ ["--gp" as string]: g.color } as React.CSSProperties}
              >
                <div className={`wc-lbt-c-up ${isUp ? "" : "wc-lbt-c-down"}`}>
                  {isUp ? "↑" : "↓"} {Math.abs(t.deltaRank)}계단
                </div>
                <div className="wc-lbt-c-name">{t.nickname}</div>
                <div className="wc-lbt-c-meta">
                  {g.name} · #{t.currRank} (어제 #{t.prevRank})
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Z3.4 내 순위 — 활성 탭=내 그룹일 때만 (베이스라인 invariant 5 보존) */}
      {isMyGroup && (
        <div
          className="wc-lb-me"
          style={{ ["--gp" as string]: activeGroup.color } as React.CSSProperties}
        >
          <div className="wc-lb-me-l">
            <Crown className="h-7 w-7 shrink-0" />
            <div>
              <div className="wc-lb-me-h">
                내 순위 #{MY_INFO.rank}
                <span className="wc-lb-me-handle"> / {MY_INFO.totalInGroup}명</span>
              </div>
              <div className="wc-lb-me-sub">
                {activeGroup.name} · {activeGroup.clubKor} 팬덤
              </div>
            </div>
          </div>
          <div className="wc-lb-me-stats">
            <div className="wc-lb-me-s">
              <span>적중률</span>
              <b>{MY_INFO.accuracy}%</b>
            </div>
            <div className="wc-lb-me-s">
              <span>수익률</span>
              <b className="up">+{MY_INFO.profitRate}%</b>
            </div>
            <div className="wc-lb-me-s">
              <span>그룹 평균</span>
              <b>+{GROUP_AVG[activeGroup.slug].profitRate}%</b>
            </div>
            <div className="wc-lb-me-s">
              <span>그룹 인원</span>
              <b>{MY_INFO.totalInGroup}</b>
            </div>
          </div>
        </div>
      )}

      {/* Z3.3 그룹 탭 + Z3.5 TOP 10 테이블 */}
      <div className="wc-lb-table-card">
        <div className="wc-lb-tabs">
          {GROUPS.map((g) => (
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

        <div className="wc-lb-table-h">
          <div>RANK</div>
          <div>NAME</div>
          <div className="r">적중</div>
          <div className="r">수익</div>
        </div>
        {rankings.map((r) => {
          const isMe = isMyGroup && r.rank === MY_INFO.rank
          const rankClass =
            r.rank === 1 ? "top1" : r.rank === 2 ? "top2" : r.rank === 3 ? "top3" : ""
          return (
            <div key={r.rank} className={`wc-lb-tr ${isMe ? "you" : ""}`}>
              <div className={`wc-lb-rk ${rankClass}`}>{r.rank}</div>
              <div className="wc-lb-nm">
                <span className="truncate">{r.nickname}</span>
                {isMe && <span className="wc-lb-you-tag">YOU</span>}
              </div>
              <div className="acc r">{r.accuracy}%</div>
              <div className={`roi r ${r.profitRate >= 0 ? "up" : "down"}`}>
                {r.profitRate >= 0 ? "+" : ""}
                {r.profitRate}%
              </div>
            </div>
          )
        })}
      </div>

      {/* Z3.6 mock 푸터 */}
      <p className="text-center text-[11px]" style={{ color: "var(--wc-mute)" }}>
        * 표시된 데이터는 디자인 확인용 mock입니다. 실제 데이터는 이벤트 시작 후 갱신됩니다.
      </p>
    </div>
  )
}
