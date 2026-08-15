/**
 * 라인업 데이터 경로 검증 CLI — 프로덕션 코드 경로 아님.
 *
 *   pnpm exec tsx scripts/probe-lineup.ts <candidate_url>
 *   pnpm exec tsx scripts/probe-lineup.ts --event <eventId>
 *
 * candidate_url → HTML 앵커에서 eventId 후보 → 각 후보의 라인업 API 응답 요약.
 * `_hash`(persisted query) 가 soccerway 배포로 깨졌는지 1분 안에 판별하는 용도.
 */
import "dotenv/config"
import { fetchMatchPage, extractLivesportEventIds } from "@/lib/soccerway/match-page"
import { fetchLineup, LINEUP_HASH } from "@/lib/soccerway/lineup"

async function main() {
  const args = process.argv.slice(2)
  console.log(`LINEUP_HASH = ${LINEUP_HASH}`)

  let eventIds: string[] = []
  if (args[0] === "--event" && args[1]) {
    eventIds = [args[1]]
  } else if (args[0]) {
    console.log(`\n① 경기 페이지 fetch: ${args[0]}`)
    const fetched = await fetchMatchPage(args[0])
    console.log(`   HTTP ${fetched.httpStatus} / HTML ${fetched.html?.length ?? 0} bytes`)
    if (!fetched.html) process.exit(1)
    eventIds = extractLivesportEventIds(fetched.html)
    console.log(`   eventId 후보: ${eventIds.join(", ") || "(없음)"}`)
  } else {
    console.log("사용법: tsx scripts/probe-lineup.ts <candidate_url> | --event <eventId>")
    process.exit(1)
  }

  for (const id of eventIds) {
    console.log(`\n② 라인업 API — eventId=${id}`)
    const lu = await fetchLineup(id)
    if (!lu) {
      console.log("   응답 없음/미발표/파싱 실패 (fail-open 경로)")
      continue
    }
    for (const side of [lu.home, lu.away]) {
      console.log(
        `   [${side.side}] ${side.teamNameEn} (${side.formation ?? "포메이션 없음"}) — 선발 ${side.starters.length} / 벤치 ${side.bench.length}`
      )
      console.log(
        "     " +
          side.starters
            .map((p) => `${p.number ?? "-"} ${p.name}`)
            .join(", ")
            .slice(0, 160)
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
