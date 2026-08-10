/**
 * 관심도 필터 드라이런 — 새 기준이 **이미 발행된 기사**에 어떤 판정을 내리는지 본다.
 *
 * 진짜 시험은 "조회 0인 기사를 버리면서 조회수가 붙은 기사는 살리는가"다.
 * 큐(drafted)만 보면 정답을 모르지만, 발행분은 조회수라는 사후 정답이 있다.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_dryrun-interest-filter.ts
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { isClubName } from "@/lib/naming/pick"
import { judgeInterest, toInterestItem } from "@/lib/news/interest-filter"

const BATCH = 20
const BOT = "user_bot_soccer_kr"

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from("posts")
    .select("id, title, content, view_count")
    .eq("user_id", BOT)
    .is("deleted_at", null)
    .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString())
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  const rows = data ?? []
  console.log(`발행분 ${rows.length}건 재심사\n`)

  const verdicts: (boolean | null)[] = []
  const reasons: string[] = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const out = await judgeInterest(
      chunk.map((r) => toInterestItem({ title: r.title, content: r.content }, isClubName(r.title)))
    )
    out.forEach((v) => {
      verdicts.push(v ? v.keep : null)
      reasons.push(v?.reason ?? "판정실패")
    })
    process.stdout.write(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`)
  }
  console.log("\n")

  // ── 사후 정답(조회수)과 대조 ──
  const bucket = (v: number) => (v === 0 ? "조회 0" : v <= 2 ? "조회 1~2" : "조회 3+")
  const tally: Record<string, { keep: number; drop: number; fail: number }> = {}
  rows.forEach((r, i) => {
    const b = bucket(r.view_count ?? 0)
    tally[b] ??= { keep: 0, drop: 0, fail: 0 }
    if (verdicts[i] === null) tally[b].fail++
    else if (verdicts[i]) tally[b].keep++
    else tally[b].drop++
  })
  console.log("조회수 구간별 판정")
  for (const b of ["조회 3+", "조회 1~2", "조회 0"]) {
    const t = tally[b]
    if (!t) continue
    const n = t.keep + t.drop + t.fail
    console.log(
      `  ${b.padEnd(9)} ${String(n).padStart(3)}건 → 유지 ${String(t.keep).padStart(3)} / 반려 ${String(t.drop).padStart(3)} (반려율 ${Math.round((100 * t.drop) / n)}%)`
    )
  }
  const kept = verdicts.filter((v) => v !== false).length
  console.log(
    `\n총 ${rows.length}건 → 유지 ${kept} (${Math.round((100 * kept) / rows.length)}%), 반려 ${rows.length - kept}`
  )

  // ── 이 필터가 실제로 무엇을 자르는가 (장르별) ──
  // 사유 문구를 거칠게 묶는다. "무엇을 잃는지"를 운영자가 알고 결정해야 한다.
  // ⚠️ 순서가 곧 우선순위다 (첫 매치가 이긴다). "무명 선수 부상, 한국 독자 관심 낮음" 같은
  // 사유가 '관심' 한 글자로 이적 루머에 잡히던 오분류가 있어 무명 주체를 앞에 둔다.
  const GENRE: [string, RegExp][] = [
    ["무명 주체", /무명|하부|마이너|관심 낮|관심도 낮|관심 부족|알려지지|인지도/],
    ["행정·규정·정치", /규정|행정|협회|징계|FIFA|UEFA|심판|정치|중재/],
    ["신변잡기·잡담", /잡담|신변|일정|이동|투어|동선|SNS|목격|컨디션|사생활/],
    ["재탕·과거사", /재탕|과거|이미 알려|회고/],
    // 이적 맥락 단어가 함께 있어야 루머로 센다
    [
      "이적 루머(진전 없음)",
      /(이적|영입|임대|계약|거취).*(관심|검토|루머|거론|연결|경쟁|주시|고려|진전)/,
    ],
    ["제3자 논평·발언", /논평|발언|언급|소감|인터뷰|평가/],
  ]
  const genreTally = new Map<string, number>()
  rows.forEach((r, i) => {
    if (verdicts[i] !== false) return
    const g = GENRE.find(([, re]) => re.test(reasons[i]))?.[0] ?? "기타"
    genreTally.set(g, (genreTally.get(g) ?? 0) + 1)
  })
  console.log("\n반려 사유 장르별")
  ;[...genreTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([g, n]) =>
      console.log(
        `  ${g.padEnd(24)} ${String(n).padStart(3)}건 (반려의 ${Math.round((100 * n) / (rows.length - kept))}%)`
      )
    )

  // ── 조회수가 붙었는데 반려된 것 = 오탐 후보. 사람이 봐야 한다 ──
  console.log("\n[오탐 점검] 조회 3+ 인데 반려된 기사")
  rows.forEach((r, i) => {
    if (verdicts[i] === false && (r.view_count ?? 0) >= 3)
      console.log(`  (${r.view_count}) ${r.title.slice(0, 60)} — ${reasons[i]}`)
  })

  // 이적 소재인데 반려된 것 = 운영자 방침("이적 가십은 모두 살려") 위반 후보
  console.log("\n[방침 점검] 제목이 이적 소재인데 반려된 기사")
  const TRANSFER_TITLE = /이적|영입|임대|계약|합류|잔류|방출|메디컬|오퍼|제안/
  const violations = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => verdicts[i] === false && TRANSFER_TITLE.test(r.title))
  console.log(`  ${violations.length}건`)
  violations
    .slice(0, 15)
    .forEach(({ r, i }) => console.log(`  ${r.title.slice(0, 58)} — ${reasons[i]}`))

  console.log("\n[유지 표본] 조회 0 인데 살아남은 것 (기준이 여전히 무른 지점)")
  rows
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => verdicts[i] === true && (r.view_count ?? 0) === 0)
    .slice(0, 12)
    .forEach(({ r, i }) => console.log(`  ${r.title.slice(0, 58)} — ${reasons[i]}`))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
