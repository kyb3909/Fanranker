import "server-only"
import { notifyDiscordOps } from "@/lib/discord-notify"

// 프로세스 내 동일 라벨 장애는 1시간에 한 번만 알린다. 인스턴스 간 중복까지 보장하지 않는다.
const notices = new Map<string, number>()
export async function reportStatCoverageGap(
  matchId: string,
  given: number,
  recognized: number,
  unknown: string[]
) {
  // 실사고는 9개 중 8개 소실이었다. 10개 이상이라는 종전 조건은 그 사고를 놓쳤다.
  if (given < 9 || recognized > 2) return
  const labels = [...new Set(unknown)].sort().slice(0, 30)
  const key = JSON.stringify(labels)
  const now = Date.now()
  const previous = notices.get(key)
  if (previous != null && now - previous < 3600_000) return
  for (const [oldKey, at] of notices) if (now - at >= 3600_000) notices.delete(oldKey)
  if (notices.size >= 100) return // 잘못된 피드가 무한히 새 라벨을 보내도 알림·메모리를 제한한다.
  notices.set(key, now)
  const description = `LFA ${given}개 중 ${recognized}개만 인식. match_id=${matchId}, 미인식: ${labels.join(", ")}`
  console.warn(`[lfa] 스탯 라벨 대조 실패 — ${description}`)
  await notifyDiscordOps({
    title: "경기 스탯 라벨 대조 실패",
    level: "warn",
    description,
    where: `LFA 경기 ${matchId}`,
    impact: "매치센터에서 주요 스탯 대부분이 누락될 수 있다",
    action: "lib/lfa/stat-labels.ts의 별칭과 원본 응답 라벨을 대조한다",
    url: "/admin/operations",
  })
}
