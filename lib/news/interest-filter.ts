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
통과:
- **EPL 은 전 구단 통과** (승격팀·하위권 포함 — 한국에서 리그 전체가 소비된다)
- 그 외 리그는 **빅클럽**(레알·바르사·아틀레티코·바이에른·도르트문트·유벤투스·인터·밀란·
  나폴리·PSG 등) 또는 **이름이 알려진 선수·감독**이 걸릴 때
- 한국인 선수 (무조건)

⚠️ **유명 클럽과 유명 선수는 각각 독립된 관심 요소다. 하나만 걸려도 통과.**
무명 구단·마이너 리그가 등장한다는 이유로 반려하지 마라. 유명 선수는 **어느 리그에 있든**
계속 조명한다 — 이적설이든 그 뒤의 활약이든 마찬가지다.
  · "트라브존스포르, 살라 영입 추진" → **살라**가 걸리므로 통과
  · "살라, 터키 리그 데뷔전 2골" → 리그가 마이너여도 **살라**가 걸리므로 통과

반려:
- 하부리그·마이너리그
- **빅리그 소속이어도 중소 구단의 무명 선수** (예: 게타페·엘체의 이름 모를 선수).
  리그가 1부라는 이유만으로 통과시키지 마라 — 한국 독자는 그 선수를 모른다.
- 지역성 사건사고, 이름 없는 코치·스태프·행정 인사

⚠️ 축①에서 걸러지면 축②가 아무리 강해도(부상·이적 확정이라도) **drop 이다.**

[빅클럽] 은 **제목에 빅클럽 이름이 들어 있다**는 사실만 알려주는 표시다. 그 클럽이 이 소식의
**주체**라면 축①은 통과이고, "관심 없는 팀/선수"를 이유로 절대 반려하지 마라.
다만 빅클럽이 **스쳐 지나가는 언급**일 뿐이고 실제 주체가 무명 팀·무명 선수라면
(예: "미들즈브러, 맨유에서 무명 선수 영입" — 주체는 미들즈브러다) 축①을 직접 판단하라.

## 축② 소재 — 팬이 쫓는 소재인가 (**모든 항목이 받는다**)
**keep — 하나라도 걸리면 유지:**
- **이적·거취에 관한 것이면 전부.** 확정이든 소문이든 가리지 않는다:
  오피셜·계약·메디컬·개인 합의, 이적료·제안·거절, 구단 간 협상, 영입 경쟁,
  그리고 **"관심 있다더라·주시한다·후보로 거론된다" 같은 맹탕 가십까지 전부 keep.**
  이적설을 진전 없다는 이유로 반려하지 마라 — 이 커뮤니티의 핵심 장르다.
  이적설에 관한 감독·선수·기자의 발언도 이적 가십이므로 keep.
- **유명 선수·유명 클럽의 경기 활약**: 득점·도움·해트트릭, 데뷔전, 결승골, 기록 수립,
  경기 결과와 그 안에서의 활약. **소속 리그가 마이너여도 마찬가지다** — 유명 선수가
  어디서 뛰든 팬은 그를 쫓는다 (예: "살라, 터키 리그 데뷔전 2골").
- **선수의 가용 여부가 바뀐 것**: 부상, 수술, 결장, 복귀, 훈련·소집 불참, 출전정지
  (다음 경기에 나오냐 마냐가 달라지면 keep 이다. 이걸 '훈련장 잡담'으로 읽지 마라)
- 감독 선임·경질, 징계
- 한국인 선수 관련 (무조건 유지)
- **선수·감독 본인의 인터뷰**: 내용이 있는 발언이면 유지한다. 거취·목표·팀 상황 진단,
  갈등·불화, 커리어 회고, 심경 등. 본인 목소리가 실린 기사는 팬이 읽는다.
- **그라운드 밖이라도 큰 소식이면 유지** (2026-08-10 운영자):
  · 경기장 신축·재건축·이전·증축 — 홈구장이 바뀌는 건 구단의 미래다
  · 구단 인수·매각·구단주 교체 등 소유 구조 변화
  · FIFA·UEFA·협회의 **부패·비리·수사·기소, 회장 선거, 거버넌스 권력 다툼**
  · 리그 전체에 적용되는 규정·제도 변경 (경기 룰, 재정 규제와 그에 따른 제재)

**drop — 아무것도 달라지지 않는 잡음만 버린다:**
- 신변잡기: 이동·일정·투어 동선, SNS 반응, 사생활, "팬들이 열광" 류
- 알맹이 없는 코멘트: 한 줄짜리 컨디션 평, 의례적 덕담, 해설자의 원론적 감상 등
  아무 정보도 없는 말
  ⚠️ **누가 말했느냐로 자르지 마라.** 해설자·전 선수의 논평이라도 **이적·거취에 관한
  것이면 이적 가십이므로 keep 이다** (예: "캐러거, 살라의 터키행은 수준이 너무 낮다").
  결장·복귀, 내용 있는 인터뷰도 마찬가지로 keep 이 우선한다.
- **단순 상업·실무 소식**: 스폰서십·용품·중계권 계약 액수, 통상 재무 공시와 지출 여력
  분석, 등록 마감·서류 절차 같은 실무 공지
  ⚠️ 위 keep 의 '큰 소식'과 헷갈리지 마라. 가르는 기준은 그라운드 안팎이 아니라
  **구단·리그의 앞날이 달라지느냐**다. 경기장 재건축·부패 수사는 달라지고,
  유니폼 스폰서 갱신은 달라지지 않는다.
- 이미 보도된 사실의 재탕·후속 없는 반복 (새 발언·새 사실이 있으면 재탕이 아니다)

## 판정
축① 또는 축② 어느 하나라도 drop 이면 drop.
**유명 선수·유명 클럽의 이적·거취·활약·인터뷰는 애매해도 keep**, 그 외에는 애매하면 drop.
[빅클럽] 항목을 반려할 땐 이유에 반드시 소재 근거를 적어라 (예: "투어 동선, 이적 무관").
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
