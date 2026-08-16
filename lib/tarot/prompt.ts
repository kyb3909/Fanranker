/**
 * 해석 프롬프트 — 근거 주입으로 창작을 억제한다.
 *
 * 원칙(타로 서비스 READING_ENGINE 에서 가져옴):
 *   결정론은 코드, 판단은 LLM. 셔플·정역·포지션 매핑·의미 소환은 전부 코드가 하고,
 *   LLM 은 "이 질문 맥락에서 이 카드들이 함께 무슨 이야기를 하는가"만 맡는다.
 *   카드 의미는 반드시 cards.ts 값을 주입하고, 모델이 카드·방향을 바꾸지 못하게 못박는다.
 *
 * 축구 각색은 **여기서만** 한다 — 카드 의미(cards.ts)는 원본을 유지한다.
 * 근거를 미리 축구로 비틀면 모델이 두 번 각색해 카드 정체성이 무너진다.
 */
import { CARD_MEANINGS } from "./cards"
import type { DrawnCard } from "./draw"
import { getSpread, type SpreadId } from "./spreads"
import { EXPRESSION_BY_KO } from "./expression"

export const SYSTEM_PROMPT = `너는 '루나' — 공놀이판의 축구 점집을 지키는 타로 리더다.

## 정체성
축구를 아주 오래 본 사람이면서 카드를 읽는다. 전술 용어를 아는 팬의 말투로,
카드가 말하는 것을 축구의 언어로 옮긴다. 점잖은 신비주의보다 **경기장 옆 포장마차**에 가깝다.

## 말투
- 반말 금지, 과한 존대도 금지. 친근한 해요체.
- 단정하지 않는다: "~일 것 같아요", "카드는 ~쪽을 가리키네요". 예언이 아니라 관점이다.
- 축구 팬의 감정을 안다 — 불안, 기대, 체념, 근자감. 그걸 알아주는 문장이 먼저 온다.
- 이모지는 쓰지 않는다.

## 절대 규칙
1. **주어진 카드 목록과 정/역방향을 절대 바꾸지 마라.** 없는 카드를 지어내지 마라.
2. 카드 의미는 주어진 근거 안에서만 해석하라. 의미를 창작하지 마라.
3. **결과를 단정하지 마라.** "이깁니다"가 아니라 "카드는 ~한 흐름을 보여줘요".
   승부·이적의 확정적 예측은 하지 않는다 — 카드가 비추는 분위기와 관점만 말한다.
4. 돈이 걸린 판단이나 환전에 대한 조언은 절대 하지 마라. 물어봐도 화제를 경기 자체로 돌려라.
5. 의학·법률·재무 조언 금지. 특정 인물에 대한 비방·확정적 사실 주장 금지.
6. '실제 경기 일정'이 주어지면 **무대 배경으로만** 써라 — 날짜·대회·홈/원정·장소를
   자연스럽게 언급하는 것까지만. 전력·순위·최근 폼·부상을 아는 척 덧붙이지 마라.
   카드 밖 지식으로 결과를 추정하는 순간 점이 아니라 분석이 된다.
   질문과 경기 일정이 어긋나 보이면 일정 쪽을 조용히 무시하라.

## 출력 형식 (반드시 지킬 것)
첫 줄에 표정 태그 한 줄:
[표정: 평온|집중|미소|갸웃|걱정|놀람]

그다음 카드별 해석 — 카드마다 한 문단:
### {포지션 이름} · {카드 이름}{정역}
그 카드가 이 질문에서 뜻하는 바 (2~3문장)

마지막에 종합:
### 루나의 한마디
전체를 엮은 결론 (3~4문장). 카드들이 **함께** 무슨 이야기를 하는지.`

/** 카드 한 장을 근거 블록으로 */
function cardBlock(card: DrawnCard, positionName: string, positionMeaning: string): string {
  const m = CARD_MEANINGS.find((c) => c.arcana === card.arcanaNumber)
  if (!m) return ""
  const dir = card.reversed ? "역방향" : "정방향"
  const keywords = card.reversed ? m.keywordsReversed : m.keywordsUpright
  const meaning = card.reversed ? m.meaningReversed : m.meaningUpright
  return [
    `- 포지션 "${positionName}" (${positionMeaning})`,
    `  카드: ${m.nameKo} (${m.name}) — ${dir}`,
    `  키워드: ${keywords.join(", ")}`,
    `  의미: ${meaning}`,
  ].join("\n")
}

interface ReadingInput {
  question: string
  spreadId: SpreadId
  cards: DrawnCard[]
  /** 무대 배경 한 줄 (lib/tarot/fixture) — 일정 사실만, 전력 정보 없음 */
  fixtureLine?: string
}

/** 유저 메시지 — 질문 + 스프레드 + 뽑힌 카드 근거 */
export function buildUserPrompt({ question, spreadId, cards, fixtureLine }: ReadingInput): string {
  const spread = getSpread(spreadId)
  const blocks = cards
    .map((c) => {
      const pos = spread.positions[c.position]
      return pos ? cardBlock(c, pos.name, pos.meaning) : ""
    })
    .filter(Boolean)
    .join("\n\n")

  return [
    `질문: ${question}`,
    ``,
    ...(fixtureLine ? [`실제 경기 일정 (서버 확인 — 무대 배경으로만 사용):`, fixtureLine, ``] : []),
    `스프레드: ${spread.name} (${spread.count}장)`,
    ``,
    `뽑힌 카드 (서버가 확정 — 바꾸지 말 것):`,
    blocks,
    ``,
    `위 카드들을 이 질문의 맥락에서 함께 읽어 해석해줘.`,
    `표정 태그는 ${Object.keys(EXPRESSION_BY_KO).join("|")} 중 하나.`,
  ].join("\n")
}

/** 응답 첫 줄의 [표정: X] 를 떼어낸다. 반환: [표정문자열|null, 본문] */
export function splitExpressionTag(raw: string): [string | null, string] {
  const m = raw.match(/^\s*\[표정:\s*([^\]]+)\]\s*\n?/)
  if (!m) return [null, raw.trim()]
  return [m[1].trim(), raw.slice(m[0].length).trim()]
}
