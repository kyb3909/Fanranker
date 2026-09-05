import { STAT_LABELS } from "@/lib/lfa/stat-labels"

/** UI 확인용 가상 경기. 운영 피드/API를 호출하지 않는다. */
const names = [
  "알렉산더 골키퍼",
  "오른쪽 수비수",
  "중앙 수비수",
  "중앙 수비수",
  "왼쪽 수비수",
  "수비형 미드필더",
  "중앙 미드필더",
  "오른쪽 윙어",
  "공격형 미드필더",
  "왼쪽 윙어",
  "중앙 공격수",
]
export const previewLineup = {
  status: "ready" as const,
  kickoff: "2026-09-05T14:00:00Z",
  fetchedAt: "2026-09-05T13:10:00Z",
  home: {
    teamLabel: "홈 유나이티드",
    formation: "4-2-3-1",
    starters: names.map((label, i) => ({
      label,
      number: i + 1,
      ...(i === 10 ? { goals: 1, goalMinutes: ["23′"] } : {}),
    })),
    bench: [
      { label: "교체 공격수", number: 19 },
      { label: "교체 미드필더", number: 24 },
    ],
  },
  away: {
    teamLabel: "어웨이 시티",
    formation: "4-3-3",
    starters: names.map((label, i) => ({ label, number: i + 12 })),
    bench: [
      { label: "교체 수비수", number: 32 },
      { label: "교체 공격수", number: 28 },
    ],
  },
}
export const previewStats = STAT_LABELS.map((def, i) => ({
  label: def.ko,
  home: i === 0 ? "1.42" : def.percent ? "58%" : String(i % 7),
  away: i === 0 ? "0.68" : def.percent ? "42%" : String(i % 4),
  homeNum: i === 0 ? 1.42 : def.percent ? 58 : i % 7,
  awayNum: i === 0 ? 0.68 : def.percent ? 42 : i % 4,
}))
