/**
 * 타로 리딩 고정 시험지 — "중언부언"을 숫자로 잡는다 (2026-08-30).
 *
 * 왜: 운영자 평가가 "모호하다 = 무슨 말인지 모르겠다"였고, 실물을 보니 원인은 헤지보다
 * **같은 말을 여러 번 다르게 반복하는 것**이었다. 카드 문단을 요약이 다시 서술하고,
 * 그 요약 안에서 또 반복한다. 주관어로 다투지 않으려고 셀 수 있는 것만 센다.
 *
 * 지표
 * - 재탕률: `루나의 한마디`의 내용어 중 카드 문단에 이미 나온 비율 (요약인가 재서술인가)
 * - 자체반복: 한마디 안에서 같은 내용어가 다시 나오는 비율
 * - 헤지: "~것 같아요/수 있어요/가능성/보여요" 류 개수
 * - 구체어: 눈에 보이는 축구 실체어 (전반·교체·세트피스·압박…) 개수
 * - 분량: 문장 수 / 평균 문장 길이
 *
 * 기준선 (2026-08-30 말투 개편 직후, gpt-5.6-luna):
 *   재탕률 11% · 자체반복 0% · 헤지 1회 · 대조구문 0회 · 어려운말 0회
 *   구체어 3종 · 문장 13개 · 평균 43자 · 총 555자
 * 개편 전은 헤지 7회 · 대조구문 2회 · 구체어 1종 · 평균 68자 · 총 833자 였다.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_eval-tarot.ts
 *   ... --models gpt-4o,gpt-5.6-luna     (모델 비교)
 *   ... --print 3                        (n번째 리딩 원문 출력)
 */
import "dotenv/config"
import { SYSTEM_PROMPT, buildUserPrompt, splitExpressionTag } from "@/lib/tarot/prompt"
import { drawCards } from "@/lib/tarot/draw"
import { chatParams } from "@/lib/llm/openai-params"


/** 실제 들어올 법한 질문 12개. 종류를 흩어 한 유형에 최적화되지 않게 한다. */
const QUESTIONS = [
  "이번 주말 아스널이 토트넘 잡을 수 있을까요?",
  "우리 팀이 이번 시즌 유럽대회 티켓 딸 수 있을까요?",
  "손흥민 이번 시즌 몇 골이나 넣을까요?",
  "감독을 바꾸는 게 나을까요?",
  "우리 팀 이번 겨울 이적시장 어떨까요?",
  "10년째 응원 중인데 이제 그만 봐야 할까요?",
  "리버풀 원정 갔다 오면 후회할까요?",
  "우리 팀 유스 출신 그 선수, 주전 될 수 있을까요?",
  "다음 시즌 강등 걱정해야 하나요?",
  "라이벌 팀 팬인 친구랑 내기해도 될까요?",
  "새로 온 공격수가 적응할 수 있을까요?",
  "올 시즌 우승 노려봐도 되나요?",
]

const HEDGE = /(것 같아요|것 같네요|수 있어요|수 있겠|가능성|보여요|보입니다|가리키네요|듯해요|아닐까요|일지도)/g
/** 눈에 보이는 축구 실체어 — 추상어("흐름·기운·분위기")와 대비되는 쪽 */
const CONCRETE =
  /(전반|후반|추가시간|교체|세트피스|코너|프리킥|페널티|압박|역습|점유|빌드업|원정|홈|더비|부상|경고|퇴장|라인|템포|측면|중원|수비진|공격진|골키퍼|스리백|포백|킥오프|승점|리드|동점|선제골)/g
/** 부정 대조 — "A라기보다 B" 류. 읽는 사람이 A를 붙들고 부정한 뒤 B를 받아야 해서 더 어렵다 */
const CONTRAST = /(라기보다|이라기보다|보다는|에 가까워요|에 가깝습니다|가 아니라|은 아니고|기보다는)/g
/** 일상어로 바꿀 수 있는데 굳이 쓰는 한자어·추상어 */
const HARD = /(정체|양자택일|상반|국면|기조|형국|여지|조율|균형점|귀결|기점|본질적|근원적|내재|함의|이면|맥락상|전제)/g

const STOP = new Set(["카드", "루나", "경기", "이번", "지금", "그리고", "하지만", "그런", "이런", "저런", "정도", "때문", "우리", "여기", "다시", "조금", "가장", "모든", "같은", "라면", "쪽으로"])

const words = (s: string): string[] =>
  (s.match(/[가-힣]{2,}/g) ?? []).filter((w) => !STOP.has(w) && !HEDGE.test(w))

interface Metrics {
   재탕: number; 자체반복: number; 헤지: number; 대조: number; 어려운말: number; 구체어: number; 문장: number; 평균길이: number; 글자: number
}

function measure(body: string): Metrics {
  const idx = body.lastIndexOf("### 루나의 한마디")
  const cardPart = idx >= 0 ? body.slice(0, idx) : body
  const summary = idx >= 0 ? body.slice(idx).replace(/^###[^\n]*\n?/, "") : ""
  const cardWords = new Set(words(cardPart))
  const sumWords = words(summary)
  const seen = new Set<string>()
  let dup = 0
  for (const w of sumWords) { if (seen.has(w)) dup++; else seen.add(w) }
  const recycled = sumWords.filter((w) => cardWords.has(w)).length
  const sentences = body.split(/[.!?。]\s|\n\n/).map((s) => s.trim()).filter((s) => s.length > 6)
  return {
    재탕: sumWords.length ? Math.round((recycled / sumWords.length) * 100) : 0,
    자체반복: sumWords.length ? Math.round((dup / sumWords.length) * 100) : 0,
    헤지: (body.match(HEDGE) ?? []).length,
    대조: (body.match(CONTRAST) ?? []).length,
    어려운말: (body.match(HARD) ?? []).length,
    구체어: new Set(body.match(CONCRETE) ?? []).size,
    문장: sentences.length,
    평균길이: sentences.length ? Math.round(body.length / sentences.length) : 0,
    글자: body.length,
  }
}

async function read(model: string, question: string, i: number): Promise<string> {
  // 결정적 시드 — 모델·회차가 달라도 같은 카드를 준다
  let s = 1000 + i * 7919
  const rng = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const cards = drawCards("three", true, rng)
  const extra: Record<string, unknown> = /^gpt-5/.test(model)
    ? { reasoning_effort: "low", verbosity: "high" }
    : {}
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      ...chatParams(model, { temperature: 0.85, max_tokens: 1400 }),
      ...extra,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt({ question, spreadId: "three", cards }) },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  })
  const j: { choices?: { message?: { content?: string } }[]; error?: { message?: string } } = await r.json()
  if (!r.ok) throw new Error(`${model}: ${j.error?.message}`)
  return splitExpressionTag(j.choices?.[0]?.message?.content ?? "")[1]
}

async function main() {
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
  const models = (arg("--models") ?? "gpt-5.6-luna").split(",")
  const printIdx = Number(arg("--print") ?? -1)

  for (const model of models) {
    const rows: Metrics[] = []
    for (let i = 0; i < QUESTIONS.length; i++) {
      const body = await read(model, QUESTIONS[i], i)
      rows.push(measure(body))
      if (i === printIdx) console.log(`\n──── ${model} · "${QUESTIONS[i]}" ────\n${body}\n`)
    }
    const avg = (k: keyof Metrics) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length)
    console.log(
      `■ ${model}\n` +
        `   재탕률 ${avg("재탕")}%   자체반복 ${avg("자체반복")}%   헤지 ${avg("헤지")}회\n` +
        `대조구문 ${avg("대조")}회   어려운말 ${avg("어려운말")}회
` +
        `   구체어 ${avg("구체어")}종   문장 ${avg("문장")}개   평균 ${avg("평균길이")}자   총 ${avg("글자")}자`
    )
  }
}
main()
