"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Crown, TrendingUp, Target } from "lucide-react"

const GROUPS = [
  { slug: "gooner", name: "구너", clubKor: "아스날", color: "#EF0107" },
  { slug: "kop", name: "콥", clubKor: "리버풀", color: "#C8102E" },
  { slug: "blues", name: "블루스", clubKor: "첼시", color: "#034694" },
] as const

type GroupSlug = (typeof GROUPS)[number]["slug"]

const GROUP_AVG: Record<GroupSlug, { accuracy: number; profitRate: number; members: number }> = {
  gooner: { accuracy: 61, profitRate: 17, members: 521 },
  kop: { accuracy: 58, profitRate: 12, members: 432 },
  blues: { accuracy: 64, profitRate: 21, members: 387 },
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

export function LeaderboardClient() {
  const [activeTab, setActiveTab] = useState<GroupSlug>(MY_INFO.groupSlug)
  const activeGroup = GROUPS.find((g) => g.slug === activeTab)!
  const rankings = RANKINGS[activeTab]
  const isMyGroup = activeTab === MY_INFO.groupSlug

  // 그룹 평균 수익률 1위 (축잘알 팬덤)
  const topGroup = [...GROUPS].sort(
    (a, b) => GROUP_AVG[b.slug].profitRate - GROUP_AVG[a.slug].profitRate
  )[0]
  const maxProfit = Math.max(...Object.values(GROUP_AVG).map((s) => s.profitRate))

  return (
    <div className="space-y-8">
      {/* 그룹 평균 비교 — 축잘알 팬덤 진단 */}
      <Card className="overflow-hidden">
        <div className="border-border border-b p-5">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="font-title text-foreground text-base font-bold">축잘알 팬덤</h2>
            <span className="text-muted-foreground text-[11px]">평균 수익률 기준</span>
          </div>
          <p className="text-muted-foreground mt-1 text-[12px] leading-[1.65]">
            현재 1위:{" "}
            <span className="font-semibold" style={{ color: topGroup.color }}>
              {topGroup.name}
            </span>
            <span className="ml-1">+{GROUP_AVG[topGroup.slug].profitRate}%</span>
          </p>
        </div>
        <div className="space-y-4 p-5">
          {GROUPS.map((g) => {
            const stats = GROUP_AVG[g.slug]
            const barW = maxProfit > 0 ? (stats.profitRate / maxProfit) * 100 : 0
            return (
              <div key={g.slug} className="space-y-1.5">
                <div className="flex items-center justify-between text-[13px]">
                  <span
                    className="font-title text-[15px] font-bold tracking-tight"
                    style={{ color: g.color }}
                  >
                    {g.name}
                    <span className="text-muted-foreground/70 ml-1.5 text-[11px] font-normal">
                      {g.clubKor}
                    </span>
                  </span>
                  <div className="text-muted-foreground flex gap-3 tabular-nums">
                    <span>
                      적중 <span className="text-foreground font-medium">{stats.accuracy}%</span>
                    </span>
                    <span>
                      수익{" "}
                      <span
                        className={`font-medium ${
                          stats.profitRate >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        +{stats.profitRate}%
                      </span>
                    </span>
                    <span className="hidden sm:inline">{stats.members}명</span>
                  </div>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${barW}%`, background: g.color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* 그룹 탭 */}
      <div className="border-border flex border-b">
        {GROUPS.map((g) => {
          const isActive = activeTab === g.slug
          return (
            <button
              key={g.slug}
              type="button"
              onClick={() => setActiveTab(g.slug)}
              className={`font-title relative flex-1 px-4 py-3 text-[14px] font-bold transition-colors ${
                isActive ? "" : "text-muted-foreground hover:text-foreground"
              }`}
              style={isActive ? { color: g.color } : undefined}
            >
              {g.name}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute right-0 -bottom-px left-0 h-[2px]"
                  style={{ background: g.color }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 내 순위 (활성 탭이 내 그룹일 때만) */}
      {isMyGroup && (
        <Card className="border-amber-200 bg-amber-50/40 p-5 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-title text-[11px] font-bold tracking-[0.1em] text-amber-700 uppercase dark:text-amber-300">
                내 순위
              </div>
              <div className="font-title text-foreground mt-1 text-3xl font-bold tabular-nums">
                #{MY_INFO.rank}
                <span className="text-muted-foreground text-[14px] font-normal">
                  {" "}
                  / {MY_INFO.totalInGroup}
                </span>
              </div>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <div className="text-muted-foreground flex items-center justify-end gap-1 text-[11px]">
                  <Target className="h-3 w-3" />
                  적중률
                </div>
                <div className="font-title text-foreground mt-1 text-xl font-bold tabular-nums">
                  {MY_INFO.accuracy}%
                </div>
              </div>
              <div>
                <div className="text-muted-foreground flex items-center justify-end gap-1 text-[11px]">
                  <TrendingUp className="h-3 w-3" />
                  수익률
                </div>
                <div
                  className={`font-title mt-1 text-xl font-bold tabular-nums ${
                    MY_INFO.profitRate >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {MY_INFO.profitRate >= 0 ? "+" : ""}
                  {MY_INFO.profitRate}%
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 그룹 내 TOP 10 */}
      <Card className="overflow-hidden">
        <div className="border-border border-b px-5 py-3">
          <h2 className="font-title text-foreground text-base font-bold">
            <span style={{ color: activeGroup.color }}>{activeGroup.name}</span> 그룹 TOP 10
          </h2>
        </div>
        <div className="divide-border divide-y">
          {rankings.map((r) => (
            <div key={r.rank} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-4">
                <div
                  className={`font-title w-8 text-center text-[18px] font-bold tabular-nums ${
                    r.rank === 1
                      ? "text-amber-500"
                      : r.rank === 2
                        ? "text-neutral-400"
                        : r.rank === 3
                          ? "text-amber-700 dark:text-amber-600"
                          : "text-muted-foreground"
                  }`}
                >
                  {r.rank}
                </div>
                <div className="text-foreground text-[14px] font-medium">{r.nickname}</div>
              </div>
              <div className="flex gap-5 text-[12px] tabular-nums">
                <div className="text-right">
                  <div className="text-muted-foreground text-[10px]">적중</div>
                  <div className="text-foreground font-medium">{r.accuracy}%</div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground text-[10px]">수익</div>
                  <div
                    className={`font-medium ${
                      r.profitRate >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    +{r.profitRate}%
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <p className="text-muted-foreground text-center text-[11px]">
        * 표시된 데이터는 디자인 확인용 mock입니다. 실제 데이터는 이벤트 시작 후 갱신됩니다.
      </p>
    </div>
  )
}
