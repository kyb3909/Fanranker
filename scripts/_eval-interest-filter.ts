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
  // ── drop: 사실이 안 움직였다 ──
  {
    title: '[야후 스포츠] 한지 플릭, 아라우호 리버풀 임대 이적 관련 발언 "새로운 도전을 원했고"',
    lead: "바르셀로나 감독 한지 플릭이 아라우호의 임대 이적설에 대해 언급했다.",
    bigClub: true,
    expect: false,
    rule: "축② 제3자 논평",
  },
  {
    title: "[TeamTalk] 에버턴과 풀럼, 바르셀로나의 헥터 벨레린 영입에 관심",
    lead: "에버턴과 풀럼이 벨레린 영입에 관심을 보이고 있는 것으로 알려졌다.",
    bigClub: true,
    expect: false,
    rule: "축② 관심 단계 루머",
  },
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
    expect: false,
    rule: "축② 협회 행정·규정",
  },
  {
    title: "[가디언] 무리뉴, 2013년 맨체스터 유나이티드 감독 계약 체결 후 파기하고 첼시 복귀 밝혀",
    lead: "무리뉴가 2013년 당시 맨유행을 택하지 않고 첼시로 돌아간 이유를 회고했다.",
    bigClub: true,
    expect: false,
    rule: "축② 과거사 재탕",
  },
  // ── drop: 주체가 무명 (축① — 빅클럽이 스쳐 지나가는 언급인 경우 포함) ──
  {
    title: "[게타페] 크리스탄투스 우체, 모나코전 태클 부상으로 시즌 아웃",
    lead: "게타페의 크리스탄투스 우체가 모나코전에서 부상으로 시즌 아웃됐다.",
    bigClub: false,
    expect: false,
    rule: "축① 무명 주체 (가용 변경이어도 주체가 안 걸린다)",
  },
  {
    title: "알타이 바이딘르, 맨체스터 유나이티드에서 셀타 비고로 임대 이적",
    lead: "맨유의 알타이 바이딘르가 셀타 비고로 임대 이적한다.",
    bigClub: true,
    expect: false,
    rule: "축① 빅클럽은 스친 언급, 주체는 무명 선수",
  },
  {
    title: "[BBC] 미들즈브러, 맨유에서 라데크 비테크 영입",
    lead: "미들즈브러가 맨유로부터 라데크 비테크를 영입했다.",
    bigClub: true,
    expect: false,
    rule: "축① 주체는 미들즈브러 + 무명 선수",
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
