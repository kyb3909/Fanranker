/**
 * 사가 추출 — 이적 기사 제목에서 {선수, 방향, 클럽, 단계 신호}를 뽑는다 (PRD §5 A2).
 *
 * 설계:
 * - 입력은 제목(+한글 헤드라인)만. 본문 전문은 쓰지 않는다 — 티커가 주는 건
 *   제목뿐이고, 이적 기사 제목은 관례적으로 자기완결적이다 (D5 저작권과도 정합).
 * - 20건 배치 1콜 (gpt-4o-mini) — 드라이런 300건 = 15콜 수준.
 * - 티어는 LLM 에 맡기지 않는다 — lib/saga/tier.ts 규칙 판정이 단일 소스.
 *   LLM 몫은 언어 이해가 필요한 것(선수 식별·방향·단계)뿐.
 * - 실패는 null 로 격리 (배치 하나 죽어도 나머지 진행) — 드라이런 리포트에 집계.
 */

export interface ExtractInput {
  /** 원제목 ([브래킷 출처] 포함 가능) */
  title: string
  headlineKr?: string | null
}

export interface ExtractedTransfer {
  /** 이적 기사가 아니면 false — 경기 결과·부상 등은 사가 재료가 아님 */
  is_transfer: boolean
  /** 영문 선수명 (기사 표기 그대로, 풀네임 우선). 미상이면 null */
  player: string | null
  /** 한국어 표기 (확신 없으면 null — 환각 음차 금지, alias 사전이 후처리) */
  player_kr: string | null
  /** in = 영입 드라마(클럽이 선수를 쫓음) / out = 이탈 드라마(선수·클럽이 결별) */
  direction: "in" | "out"
  /** 언급된 클럽들 (영문). [0] = 이야기의 중심 클럽 */
  clubs: string[]
  /** 단계 신호 — lib/saga/stages.ts transfer 플로우 값 또는 null(신호 없음) */
  stage_signal: "interest" | "contact" | "bid" | "negotiation" | "medical" | "done" | null
  /** 0~1 — 낮으면 검수 화면에서 눈에 띄게 */
  confidence: number
}

const SYSTEM_PROMPT = `너는 축구 이적 뉴스 분류기다. 번호 매겨진 기사 제목 목록을 받아 각 항목에서 이적 정보를 추출한다.

각 항목에 대해:
- i: 입력 항목의 번호 (반드시 입력의 번호를 그대로. 건너뛰는 항목 없이 전 항목 출력)
- is_transfer: 선수 이적/영입/이탈에 관한 기사인가 (경기·부상·재계약 단신은 false. 단 재계약 "협상"은 잔류 드라마이므로 true, direction=out)
- player: 이적 대상 선수의 영문 이름 (제목 표기 그대로, 가능하면 풀네임). 선수가 특정되지 않으면 null
- player_kr: 그 선수의 한국어 표기. 확실히 아는 경우만. 모르면 null (음차를 지어내지 말 것)
- direction: 목적지 후보 클럽이 하나라도 등장하면 무조건 "in" — 제안 거절, 매각 합의, 파는 쪽 관점 서술 전부 "in"이다.
  "out"은 목적지 클럽이 전혀 없는 순수 이탈(결별 통보·방출·떠나고 싶다·재계약 거부)만.
  예시: "Newcastle reject Arsenal's bid for X" → in (목적지 Arsenal 존재)
       "Tottenham agree fee to sell X to Inter" → in (목적지 Inter 존재)
       "Club rejected €60m offer from Spurs for X" → in (목적지 Spurs 존재)
       "X wants to leave Napoli" (목적지 없음) → out
       "X, 재계약 거부하고 결별 수순" (목적지 없음) → out
- clubs: 언급된 클럽 영문명 배열. 첫 번째 = 영입 추진(목적지) 클럽, 없으면 소속 클럽
- stage_signal: "interest"(관심·후보 거론) | "contact"(접촉·문의) | "bid"(공식 제안·오퍼, 거절 포함) | "negotiation"(개인합의·클럽간 협상) | "medical"(메디컬 예정·진행) | "done"(오피셜·완료) | null(신호 없음)
- confidence: 0~1

JSON만 출력: {"items": [{"i": 1, ...}, {"i": 2, ...}, ...]}`

/** 20건 배치 1콜. 실패 시 해당 배치 전부 null */
export async function extractTransferBatch(
  inputs: ExtractInput[]
): Promise<(ExtractedTransfer | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || inputs.length === 0) return inputs.map(() => null)

  const list = inputs
    .map((x, i) => `${i + 1}. ${x.title}${x.headlineKr ? ` / (한글) ${x.headlineKr}` : ""}`)
    .join("\n")

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: list },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) return inputs.map(() => null)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      items?: unknown[]
    }
    const items = Array.isArray(parsed.items) ? parsed.items : []
    // 위치가 아니라 항목이 자기 번호(i)로 자기 자리를 찾는다 — LLM 이 항목을
    // 건너뛰거나 순서를 바꾸면 위치 매핑은 전부 한 칸씩 밀린다 (드라이런 1차 실사고:
    // 허재원 사가에 바르코 기사가 origin 으로 붙음)
    const byIndex = new Map<number, unknown>()
    for (const it of items) {
      const idx = (it as Record<string, unknown> | null)?.i
      if (typeof idx === "number") byIndex.set(idx, it)
    }
    return inputs.map((_, i) => sanitize(byIndex.get(i + 1)))
  } catch {
    return inputs.map(() => null)
  }
}

const STAGES = new Set(["interest", "contact", "bid", "negotiation", "medical", "done"])

/** LLM 출력 방어 정규화 — 스키마 밖 값은 버린다 */
function sanitize(raw: unknown): ExtractedTransfer | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const stage =
    typeof r.stage_signal === "string" && STAGES.has(r.stage_signal)
      ? (r.stage_signal as ExtractedTransfer["stage_signal"])
      : null
  return {
    is_transfer: r.is_transfer === true,
    player: typeof r.player === "string" && r.player.trim() ? r.player.trim() : null,
    player_kr: typeof r.player_kr === "string" && r.player_kr.trim() ? r.player_kr.trim() : null,
    direction: r.direction === "out" ? "out" : "in",
    clubs: Array.isArray(r.clubs) ? r.clubs.filter((c): c is string => typeof c === "string") : [],
    stage_signal: stage,
    confidence: typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.5,
  }
}
