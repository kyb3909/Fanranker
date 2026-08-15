/**
 * 관심도 필터 고정 시험지 — 프롬프트/모델을 바꿀 때 회귀를 잡는다.
 *
 * 정답은 조회수가 아니라 **명세**에서 나온다 (lib/news/interest-filter 의 축①·축②).
 * 정식 오픈 전이라 조회수엔 정답이 없다 — 최고 7회, 조회 3+ 가 10건뿐이라 잡음이다.
 * 그래서 명세만 보면 답이 갈리지 않는 실제 발행 기사 12건을 골라 고정했다.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_eval-interest-filter.ts
 *   ... --models gpt-4o-mini,gpt-4o      (모델 비교)
 */
import "dotenv/config"
import { judgeInterest, type InterestItem } from "@/lib/news/interest-filter"

interface Case extends InterestItem {
  expect: boolean
  /** 명세 어느 조항으로 답이 정해지는가 */
  rule: string
}

/** 실제 발행분에서 가져온 제목. lead 는 판정에 필요한 최소한만 */
const CASES: Case[] = [
  // ── keep: 사실이 움직였다 ──
  {
    title:
      "[스카이 스포츠] 브루노 기마랑이스, 뉴캐슬 프리시즌 훈련 불참…맨유, 미드필더 보강 움직임",
    lead: "브루노 기마랑이스가 뉴캐슬의 프리시즌 훈련에 참여하지 않았다.",
    bigClub: true,
    expect: true,
    rule: "축② 가용 여부 변경(훈련 불참)",
  },
  {
    title: "[맨체스터 이브닝 뉴스] 캐릭, 래시포드 다음 주 복귀 확인",
    lead: "마이클 캐릭 감독이 마커스 래시포드가 다음 주 복귀한다고 확인했다.",
    bigClub: false,
    expect: true,
    rule: "축② 가용 여부 변경(복귀 확정)",
  },
  {
    title: "아스널, 브루노 기마랑이스 7,500만 파운드에 영입",
    lead: "아스널이 브루노 기마랑이스를 7,500만 파운드에 영입하며 계약을 체결했다.",
    bigClub: true,
    expect: true,
    rule: "축② 계약 체결 + 이적료 수치",
  },
  {
    title:
      "[모레토] 아틀레티코 마드리드, 크리스티안 로메로와 개인 합의 도달…토트넘과 이적료 협상 중",
    lead: "아틀레티코가 로메로와 개인 조건 합의에 도달했고 토트넘과 이적료를 협상 중이다.",
    bigClub: true,
    expect: true,
    rule: "축② 개인 합의 = 확정 단계",
  },
  // ── keep: 이적 가십은 진전이 없어도 전부 살린다 (2026-08-10 운영자: "이적설 가십들은 모두 살려줘") ──
  {
    title: "[TeamTalk] 에버턴과 풀럼, 바르셀로나의 헥터 벨레린 영입에 관심",
    lead: "에버턴과 풀럼이 벨레린 영입에 관심을 보이고 있는 것으로 알려졌다.",
    bigClub: true,
    expect: true,
    rule: "축② 맹탕 가십도 이적 소재면 keep",
  },
  {
    title: '[야후 스포츠] 한지 플릭, 아라우호 리버풀 임대 이적 관련 발언 "새로운 도전을 원했고"',
    lead: "바르셀로나 감독 한지 플릭이 아라우호의 임대 이적설에 대해 언급했다.",
    bigClub: true,
    expect: true,
    rule: "축② 이적설에 대한 발언도 이적 가십",
  },
  {
    title: "[풋 메르카토] 첼시 미하일로 무드릭, 스트라스부르·코번트리 임대 관심",
    lead: "무드릭의 임대 영입에 스트라스부르와 코번트리가 관심을 보인다.",
    bigClub: true,
    expect: true,
    rule: "축② 임대 관심설도 keep",
  },
  {
    title: "트라브존스포르, 다르윈 누녜스와 연봉 800만 유로 계약 합의",
    lead: "트라브존스포르가 리버풀의 다르윈 누녜스와 연봉 800만 유로에 합의했다.",
    bigClub: false,
    expect: true,
    rule: "축① 구단은 무명이어도 선수(누녜스)가 걸리면 통과",
  },
  {
    title: "모하메드 살라, 트라브존스포르 데뷔전에서 2골…터키 리그 데뷔부터 폭발",
    lead: "살라가 트라브존스포르 데뷔전에서 두 골을 넣으며 팀 승리를 이끌었다.",
    bigClub: false,
    expect: true,
    rule: "축①·② 유명 선수는 마이너 리그 활약도 조명 (2026-08-10 운영자)",
  },
  {
    title: "[ESPN] 제이미 캐러거, 모하메드 살라의 트라브존스포르 이적은 '수준이 너무 낮다'고 평가",
    lead: "캐러거는 살라가 터키 리그로 가는 것은 수준이 맞지 않는다고 평가했다.",
    bigClub: false,
    expect: true,
    rule: "축② 제3자 논평이어도 이적 소재면 keep — 말한 사람으로 자르지 않는다",
  },
  // ── drop: 이적·거취와 무관한 잡음 ──
  {
    title: "[BBC] 첼시, 프리시즌 투어에서 56시간 비행하며 24,561마일 이동",
    lead: "첼시가 프리시즌 투어에서 시드니·홍콩·자카르타를 거치며 총 24,561마일을 이동했다.",
    bigClub: true,
    expect: false,
    rule: "축② 이동·일정 신변잡기",
  },
  {
    title: "[마르카] 스페인 라리가, 2026-27 시즌부터 적용될 주요 심판 규칙 변경 발표",
    lead: "라리가가 다음 시즌부터 적용되는 심판 판정 관련 규정 변경을 발표했다.",
    bigClub: false,
    expect: true,
    rule: "축② 리그 전체에 적용되는 룰 변경 — 모든 경기가 달라진다",
  },
  {
    title: "[가디언] 무리뉴, 2013년 맨체스터 유나이티드 감독 계약 체결 후 파기하고 첼시 복귀 밝혀",
    lead: "무리뉴가 2013년 당시 맨유행을 택하지 않고 첼시로 돌아간 이유를 처음으로 밝혔다.",
    bigClub: true,
    expect: true,
    rule: "축② 본인 인터뷰 — 커리어 회고도 내용이 있으면 keep (2026-08-10 운영자)",
  },
  {
    title: "아인트라흐트 프랑크푸르트, 도이체 방크 파크 수용 인원 6만 100명으로 확대 발표",
    lead: "프랑크푸르트가 홈 구장 증축을 통해 수용 인원을 6만 100명으로 늘린다고 발표했다.",
    bigClub: false,
    expect: true,
    rule: "축② 경기장 증축 — 그라운드 밖이어도 구단의 앞날이 달라진다",
  },
  {
    title: "[AS] FIFA, 2030년 월드컵 결승전 모로코 개최 제안 부인…인판티노 로비 의혹 확산",
    lead: "FIFA가 인판티노 회장의 모로코 개최 제안 의혹을 부인했다.",
    bigClub: false,
    expect: true,
    rule: "축② FIFA 거버넌스·의혹 — 부패·선거는 중요 소식",
  },
  {
    title: "아스널, 에미레이트 항공과 스폰서십 계약 2033년까지 연장",
    lead: "아스널이 메인 스폰서 에미레이트 항공과의 계약을 2033년까지 연장했다.",
    bigClub: true,
    expect: false,
    rule: "축② 단순 상업 계약 — 구단의 앞날이 달라지지 않는다 (경기장 재건축과의 경계)",
  },
  {
    title: "[디 애슬레틱] 프리미어리그 구단별 2026년 여름 이적시장 지출 여력과 재정 규제 현황",
    lead: "프리미어리그 각 구단의 재정 상황과 이적시장 지출 여력을 정리했다.",
    bigClub: false,
    expect: false,
    rule: "축② 통상 재무 분석 — 제목에 '이적'이 있어도 가십이 아니다",
  },
  // ── drop: 주체가 무명 (축①) ──
  {
    title: "[게타페] 크리스탄투스 우체, 모나코전 태클 부상으로 시즌 아웃",
    lead: "게타페의 크리스탄투스 우체가 모나코전에서 부상으로 시즌 아웃됐다.",
    bigClub: false,
    expect: false,
    rule: "축① 무명 주체 (가용 변경이어도 주체가 안 걸린다)",
  },

  // ── drop: 남미 리그 (2026-08-15 운영자 "이상한 남미 리그들이 올라오고 있어") ──
  // 아래 4건은 전부 **실제 발행분**이다. 남미 리그가 새는 경로가 두 가지라 둘 다 고정한다.
  {
    title:
      "로사리오 센트랄, 휴고 소우자의 인종차별 주장에 반박하며 코린치안스 팬들의 인종차별 행위 비판",
    lead: "로사리오 센트랄이 코린치안스 팬들의 인종차별 행위를 비판하는 성명을 냈다.",
    bigClub: false,
    expect: false,
    rule: "축① 남미 리그 + 지역성 사건사고 — 한국 독자에게 주체가 안 걸린다",
  },
  {
    title: "[GE] 가브리엘 바르보사, 산투스에서 240경기 만에 100골 달성",
    lead: "가브리엘 바르보사가 산투스 소속으로 통산 100골을 기록했다.",
    bigClub: false,
    expect: false,
    rule: "축① 남미 리그 — '한때 유명'은 유명이 아니다 (유럽 빅리그 현역이 기준)",
  },
  {
    title: "Fenerbahçe, 브라질 미드필더 프레드 아틀레티코 미네이루로 이적",
    lead: "페네르바흐체의 프레드가 아틀레티코 미네이루로 이적한다.",
    bigClub: false,
    expect: false,
    rule: "축① 남미 리그 이적 — '아틀레티코'가 마드리드로 오인돼 새던 경로",
  },
  {
    title: "[르퀴프] 보르도, 프랑스 챔피언십 제외 결정 유지…청산 위기 임박",
    lead: "보르도가 프랑스 챔피언십에서 제외되는 결정이 유지되며 청산 위기에 놓였다.",
    bigClub: false,
    expect: false,
    rule: "축① 하부리그 — 구단 존폐라도 주체가 안 걸리면 drop",
  },
  // 대조군: 남미여도 **유럽 빅리그로 오는** 이적은 통과해야 한다 (과잉 차단 방지)
  {
    title: "[디 마르지오] 레알 마드리드, 플라멩구 유망주 영입 위해 4천만 유로 제안",
    lead: "레알 마드리드가 플라멩구의 유망주 영입을 위해 4천만 유로를 제안했다.",
    bigClub: true,
    expect: true,
    rule: "축① 빅클럽이 주체 — 상대가 남미 구단이어도 keep",
  },
]

async function main() {
  const mi = process.argv.indexOf("--models")
  const models =
    mi >= 0
      ? process.argv[mi + 1].split(",").map((s) => s.trim())
      : [undefined as unknown as string]

  for (const model of models) {
    const verdicts = await judgeInterest(CASES, model)
    let hit = 0
    const misses: string[] = []
    CASES.forEach((c, i) => {
      const v = verdicts[i]
      const got = v?.keep
      if (got === c.expect) hit++
      else
        misses.push(
          `    ${c.expect ? "유지" : "반려"}여야 하는데 ${got === undefined ? "판정실패" : got ? "유지" : "반려"}` +
            ` — ${c.title.slice(0, 46)}\n      [${c.rule}] 모델 사유: ${v?.reason ?? "-"}`
        )
    })
    console.log(`\n■ ${model ?? "기본"} — ${hit}/${CASES.length} 정답`)
    if (misses.length) console.log(misses.join("\n"))
    // 사유 문구가 뭉개지는지 — 같은 사유를 여러 건에 재사용하면 근거로 못 쓴다
    const reasons = verdicts.filter(Boolean).map((v) => v!.reason)
    const uniq = new Set(reasons).size
    console.log(
      `    사유 다양성 ${uniq}/${reasons.length}${uniq < reasons.length * 0.8 ? "  ⚠️ 보일러플레이트" : ""}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
