/**
 * 리포트 원문 고르기 재현 — **"기사가 없다"와 "슬러그가 안 맞는다"를 가른다** (2026-09-09).
 *
 * ## 왜 필요한가
 * 원장(`match_report_attempts`)이 남기는 사유는 `전용 리포트 기사 없음 (soccerway 목록)`
 * 하나뿐인데, 이 문장은 **두 가지 완전히 다른 상황을 덮는다.**
 *
 *   ① 소커웨이가 아직 그 경기 리포트를 안 냈다 → 기다리면 된다
 *   ② 기사는 멀쩡히 있는데 팀 슬러그가 안 맞아 버려졌다 → 코드를 고쳐야 한다
 *
 * 9/9 실측에서 운영자 제보("사커웨이는 전부 다 올라와 있거든")가 없었으면 ①로 닫을 뻔했다.
 * 실제로는 ②였다 — 경기 URL 은 `fc-porto`, 기사는 `…-porto-manchester-city-report-…`.
 * 사유만 보고 판단하지 말고 이걸 돌릴 것.
 *
 * ## 읽는 법
 * - `팀 슬러그` 가 매치 URL 에서 뽑힌 두 토큰이다. 기사 슬러그에 이 **둘 다** 하이픈
 *   경계로 들어 있어야 채택된다 (`lib/soccerway/report-article.ts`).
 * - `킥오프 필터 통과` 가 0 이면 기사가 아직 안 붙은 것이다 (①).
 * - 통과한 목록에 `…-report-…` 가 보이는데 `pickReportArticle → null` 이면 슬러그
 *   불일치다 (②). 그 경기 팀을 `NEWS_TEAM_SLUGS` 에 추가한다.
 *
 * ⚠️ 별칭은 **실측하고 넣을 것.** 뉴스 데스크가 줄이는지 아닌지 규칙이 없다 —
 *    `fc-porto`→`porto` 는 줄었지만 `ac-milan`·`manchester-city` 는 그대로다.
 *
 * ## 실행
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_sw-pick.ts
 *   ... --event SYL9LRdk --url https://www.soccerway.com/match/a-XXXXXXXX/b-YYYYYYYY/ \
 *       --kickoff 2026-09-08T19:00:00Z
 *
 * eventId 는 `match_report_attempts.event_id` · `match_reports.event_id` 에 있고,
 * 매치 URL 은 `match_mapping_attempts.candidate_url` 에 있다.
 */
import "dotenv/config"
import {
  fetchEventArticleRefs,
  fetchArticleMeta,
  findReportArticle,
} from "@/lib/soccerway/match-extras"
import { pickReportArticle, teamSlugsFromMatchUrl } from "@/lib/soccerway/report-article"

/** [라벨, eventId, 매치 URL, 킥오프 ISO] */
type Case = [string, string, string, string]

/** 인자를 안 주면 도는 실측 표본 — 위 ①②를 한 번에 보여준다 */
const SAMPLES: Case[] = [
  // ② 슬러그 불일치였던 경기 (fc-porto ↔ porto). 지금은 별칭이 있어 통과한다.
  [
    "포르투 vs 맨체스터 시티",
    "SYL9LRdk",
    "https://www.soccerway.com/match/fc-porto-S2NmScGp/manchester-city-Wtn9Stg0/",
    "2026-09-08T19:00:00Z",
  ],
  // 별칭이 필요 없는 쪽 — 뉴스도 `ac-milan` 을 그대로 쓴다
  [
    "유벤투스 vs AC밀란",
    "G4XZ0kFD",
    "https://www.soccerway.com/match/ac-milan-8Sa8HInO/juventus-C06aJvIB/",
    "2026-09-06T18:45:00Z",
  ],
]

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const iso = (ms: number) => new Date(ms).toISOString().slice(5, 16)

async function probe([label, eventId, url, kickoffIso]: Case) {
  const kickoffMs = Date.parse(kickoffIso)
  if (!Number.isFinite(kickoffMs)) {
    console.log(`\n=== ${label}\n  킥오프를 읽을 수 없다: ${kickoffIso}`)
    return
  }
  const slugs = teamSlugsFromMatchUrl(url)
  console.log(`\n=== ${label}  (event ${eventId})`)
  console.log(`  팀 슬러그: ${slugs ? slugs.join(" + ") : "추출 실패 — 매치 URL 모양 확인"}`)
  if (!slugs) return

  const refs = await fetchEventArticleRefs(eventId)
  const kept = refs.filter((r) => r.sortKeyMs >= kickoffMs)
  console.log(`  기사 참조 ${refs.length}건 → 킥오프 이후 ${kept.length}건`)

  const metas = []
  for (const r of kept.slice(0, 8)) {
    const m = await fetchArticleMeta(r.id).catch(() => null)
    if (m) metas.push(m)
  }
  // 판정은 파이프라인 함수에 그대로 묻는다 — 여기서 규칙을 흉내내면 진단이 거짓말을 한다
  for (const m of metas) {
    const ok = pickReportArticle([m], slugs, kickoffMs) !== null
    console.log(`    ${iso(m.publishedAtMs)}  ${ok ? "채택가능" : "  버림  "}  ${m.slug}`)
  }

  const picked = pickReportArticle(metas, slugs, kickoffMs)
  console.log(`  pickReportArticle → ${picked?.slug ?? "null"}`)
  if (!picked) {
    console.log(
      metas.length === 0
        ? "  → 기사가 아직 안 붙었다. 기다리면 된다 (킥오프 +24h 창 안에서)."
        : "  → 기사는 있는데 안 골랐다. 위 목록에 리포트가 보이면 NEWS_TEAM_SLUGS 를 볼 것."
    )
  }
  const viaPipeline = await findReportArticle(eventId, url, kickoffMs)
  console.log(`  findReportArticle → ${viaPipeline?.slug ?? "null"}`)
}

async function main() {
  const eventId = arg("event")
  const url = arg("url")
  const kickoff = arg("kickoff")
  const cases: Case[] =
    eventId && url && kickoff
      ? [["요청한 경기", eventId, url, kickoff]]
      : ((eventId || url || kickoff) &&
          console.log("⚠️ --event · --url · --kickoff 는 셋 다 있어야 한다. 표본으로 돈다."),
        SAMPLES)
  for (const c of cases) await probe(c)
}
main()
