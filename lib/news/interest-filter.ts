/**
 * 관심도 판정 — "한국 독자가 관심 가질 것만 낸다" (2026-08-10 운영자).
 *
 * 라우트(app/api/cron/news-interest-filter)에서 분리한 이유: 이 판정이 **발행 여부를
 * 결정하는 마지막 관문**이 됐다. 프롬프트를 바꿀 때마다 실제 큐로 미리 돌려보고
 * (scripts/_dryrun-interest-filter.ts) 회귀를 테스트로 잡을 수 있어야 한다.
 *
 * 판정 기준의 배경은 라우트 상단 주석 참조 (클럽 가드가 심사를 건너뛰던 문제).
 */
import { chatParams } from "@/lib/llm/openai-params"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import type { TipTapNode } from "@/types/post"

/** LLM 에 딸려 보낼 본문 앞부분 — 제목만으론 농도를 못 가린다 */
export const LEAD_CHARS = 180

export const INTEREST_SYSTEM_PROMPT = `너는 한국 축구 팬 커뮤니티(EPL 중심)의 데스크다. 지면은 한정돼 있다.
**"한국 독자가 관심 가질 것만 낸다"** 가 원칙이다 — 유지에 근거가 필요하고, 없으면 반려다.

각 항목은 [빅클럽] 표시 유무와 제목, 본문 앞부분으로 주어진다. 두 축으로 본다.

## 축① 주체 — 한국 독자가 아는 대상인가
통과: EPL·유럽 빅클럽, 이름이 알려진 선수·감독, 한국인 선수(무조건).
반려: 무명 하부리그·마이너리그, 지역성 사건사고, 이름 없는 코치·스태프·행정 인사.

[빅클럽] 은 **제목에 빅클럽 이름이 들어 있다**는 사실만 알려주는 표시다. 그 클럽이 이 소식의
**주체**라면 축①은 통과이고, "관심 없는 팀/선수"를 이유로 절대 반려하지 마라.
다만 빅클럽이 **스쳐 지나가는 언급**일 뿐이고 실제 주체가 무명 팀·무명 선수라면
(예: "미들즈브러, 맨유에서 무명 선수 영입" — 주체는 미들즈브러다) 축①을 직접 판단하라.

## 축② 농도 — 읽을 값이 있는 소식인가 (**모든 항목이 받는다**)
**keep — 사실이 움직인 것:**
- 오피셜·계약 체결·메디컬·개인 합의 등 확정 단계
- 이적료·계약기간 같은 구체 수치가 있는 진전, 공식 제안·거절
- 감독 선임·경질, 징계
- **선수의 가용 여부가 바뀐 것**: 부상, 수술, 결장, 복귀, 훈련·소집 불참, 출전정지
  (다음 경기에 나오냐 마냐가 달라지면 keep 이다. 이걸 '훈련장 잡담'으로 읽지 마라)
- 스타 선수 본인의 거취 발언 (남겠다/떠나겠다 등 방향이 있는 것)
- 한국인 선수 관련 (무조건 유지)

**drop — 사실이 안 움직인 것:**
- **맹탕 이적설**: "관심 있다·주시한다·후보로 거론된다" 뿐이고 그 이상이 없는 것
  ⚠️ 이적설이라고 다 버리는 게 아니다. 이적설은 이 커뮤니티의 핵심 장르다.
  아래 중 **하나라도** 있으면 위 keep 의 '구체 수치가 있는 진전'으로 보고 유지하라:
  이적료·연봉 액수, 구단의 공식 제안·요구액·거절, 구단 간 접촉·협상 진행,
  영입 경쟁 구도(어느 팀들이 붙었는지), 메디컬·개인 조건 등 절차 단계
- 제3자 논평·감상: 타 팀 감독·전 선수·해설자가 남 얘기에 한마디 (예: "플릭, 아라우호 이적설 언급")
- FIFA·UEFA·협회의 행정·정치·규정·징계지침 — 팬이 안 읽는다
- 훈련장 잡담(전술 소감·컨디션 평), SNS 반응, 신변잡기, 이동·일정, "팬들이 열광" 류
  (단 위 keep 의 '가용 여부가 바뀐 것'이 우선한다 — 결장·복귀는 잡담이 아니다)
- 이미 알려진 사실의 재탕·후속 없는 반복

## 판정
축① 또는 축② 어느 하나라도 drop 이면 drop. **애매하면 drop** (지면은 한정이고, 다음 기사가 온다).
단 [빅클럽] 항목을 반려할 땐 이유에 반드시 농도 근거를 적어라 (예: "관심 단계 루머, 진전 없음").
각 판정에 한 줄 이유.
JSON만: {"items": [{"i": 1, "keep": true, "reason": "..."}, ...]} — 입력 번호 그대로, 전 항목.`

export interface InterestItem {
  title: string
  lead: string
  bigClub: boolean
}

export interface InterestVerdict {
  keep: boolean
  reason: string
}

/**
 * 초안 행에서 판정 입력을 만든다 — 라우트와 드라이런이 **같은** 입력을 쓰게 하는 지점.
 *
 * ⚠️ `content` 는 문자열이 아니라 **TipTap JSON 객체**다 (news_reservoir.draft.content,
 * posts.content 둘 다). 문자열로 가정하면 런타임 TypeError 로 매시간 크론이 죽는다 —
 * 도입 당일 드라이런에서 실제로 났다.
 */
export function toInterestItem(
  draft: { title?: string; content?: unknown } | null,
  bigClub: boolean
): InterestItem {
  const raw =
    typeof draft?.content === "string"
      ? draft.content
      : extractTextFromTipTapJSON(draft?.content as TipTapNode)
  return {
    title: draft?.title ?? "",
    lead: raw.replace(/\s+/g, " ").trim().slice(0, LEAD_CHARS),
    bigClub,
  }
}

export function renderInterestInput(items: InterestItem[]): string {
  return items
    .map(
      (it, i) =>
        `${i + 1}. ${it.bigClub ? "[빅클럽] " : ""}${it.title}` +
        (it.lead ? `\n   본문: ${it.lead}` : "")
    )
    .join("\n")
}

/**
 * 판정 모델. 2축 판정(주체 × 농도)에 예외 규칙이 얹혀 있어 작은 모델은 못 따라간다 —
 * 실측(2026-08-10): gpt-4o-mini 는 사유를 "관심 단계 루머, 진전 없음" 하나로 뭉개고,
 * 심판 규칙 변경·훈련 불참에까지 같은 사유를 붙였다. 사유는 검수 화면에서 사람이
 * 기사를 되살릴 때 읽는 근거라 뭉개지면 안 된다.
 */
export const INTEREST_MODEL = process.env.INTEREST_FILTER_MODEL || "gpt-4o"

/**
 * 판정. 실패는 `null` — 호출부는 **유지**로 처리해야 한다 (잘못 버리는 게 더 나쁘다).
 */
export async function judgeInterest(
  items: InterestItem[],
  model: string = INTEREST_MODEL
): Promise<(InterestVerdict | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return items.map(() => null)
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams(model, { temperature: 0 }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INTEREST_SYSTEM_PROMPT },
          { role: "user", content: renderInterestInput(items) },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) {
      console.error("[news-interest-filter] LLM HTTP", res.status)
      return items.map(() => null)
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      items?: { i?: number; keep?: boolean; reason?: string }[]
    }
    const byIndex = new Map<number, InterestVerdict>()
    for (const it of parsed.items ?? []) {
      if (typeof it.i === "number") {
        byIndex.set(it.i, {
          keep: it.keep !== false,
          reason: String(it.reason ?? "").slice(0, 100),
        })
      }
    }
    return items.map((_, i) => byIndex.get(i + 1) ?? null)
  } catch (e) {
    console.error("[news-interest-filter] 판정 실패", e)
    return items.map(() => null)
  }
}
