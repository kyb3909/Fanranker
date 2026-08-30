/**
 * 사가 추출 — 이적 기사 제목에서 {선수, 방향, 클럽, 단계 신호}를 뽑는다 (PRD §5 A2).
 *
 * 설계:
 * - 입력은 제목(+한글 헤드라인)만. 본문 전문은 쓰지 않는다 — 티커가 주는 건
 *   제목뿐이고, 이적 기사 제목은 관례적으로 자기완결적이다 (D5 저작권과도 정합).
 * - 20건 배치 1콜 (gpt-5.6-luna) — 드라이런 300건 = 15콜 수준.
 * - 티어는 LLM 에 맡기지 않는다 — lib/saga/tier.ts 규칙 판정이 단일 소스.
 *   LLM 몫은 언어 이해가 필요한 것(선수 식별·방향·단계)뿐.
 * - 실패는 null 로 격리 (배치 하나 죽어도 나머지 진행) — 드라이런 리포트에 집계.
 */

import { chatParams } from "@/lib/llm/openai-params"
import { logUsage } from "@/lib/llm/usage-log"

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
  /** 타임라인 엔트리용 한국어 한 줄 헤드라인 (드라이 톤) — 검수 화면에서 수정 가능 */
  headline_ko: string | null
  /** 0~1 — 낮으면 검수 화면에서 눈에 띄게 */
  confidence: number
}

const SYSTEM_PROMPT = `너는 축구 이적 뉴스 분류기다. 번호 매겨진 기사 제목 목록을 받아 각 항목에서 이적 정보를 추출한다.

각 항목에 대해:
- i: 입력 항목의 번호 (반드시 입력의 번호를 그대로. 건너뛰는 항목 없이 전 항목 출력)
- is_transfer: 선수 이적/영입/이탈에 관한 기사인가 (경기·부상·재계약 단신은 false. 단 재계약 "협상"은 잔류 드라마이므로 true, direction=out)
- player: 이적 대상 선수의 영문 이름. **제목에 있는 철자를 그대로 복사하라.**
  ⚠️ 한글 표기에서 영문을 **역추정하지 마라.** 실사고(2026-08-25): 제목에 "Savinho" 가
     있는데 "Fabinho"(다른 선수)를 냈고, 그 이름으로 사가가 하나 더 생겼다.
     제목에 영문 이름이 없으면 **null** 이다 — 지어내는 것보다 비우는 게 낫다.
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
- headline_ko: 기사 내용을 한국어 한 줄로 (40자 이내, 팩트만, 감상·물음표 금지. 예: "갈라타사라이, 토트넘의 6,000만 유로 제안 거절"). is_transfer=false 면 null
- confidence: 0~1

JSON만 출력: {"items": [{"i": 1, ...}, {"i": 2, ...}, ...]}`

/** 20건 배치 1콜. 실패 시 해당 배치 전부 null */
export async function extractTransferBatch(
  inputs: ExtractInput[],
  opts: { teamIndex?: TeamEvidenceIndex } = {}
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
        ...chatParams("gpt-5.6-luna", { temperature: 0 }),
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
    logUsage("saga-extract", "gpt-5.6-luna", data)
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
    return inputs.map((x, i) => {
      const item = sanitize(byIndex.get(i + 1))
      if (!item || item.clubs.length === 0) return item
      // 클럽 증거 검사 — 원제목에 없는 클럽은 환각 가능성 (디오망데 실사고)
      const { clubs, dropped } = filterClubsByEvidence(item.clubs, x.title, opts.teamIndex)
      if (dropped.length === 0) return item
      return {
        ...item,
        clubs,
        // 클럽을 지어냈다면 나머지 판단도 의심 — 검수 화면에서 눈에 띄게
        confidence: Math.min(item.confidence, 0.4),
      }
    })
  } catch {
    return inputs.map(() => null)
  }
}

const STAGES = new Set(["interest", "contact", "bid", "negotiation", "medical", "done"])

/**
 * 클럽 증거 검사 (2026-08-07 디오망데 실사고).
 *
 * VPS 요약기가 클럽명 없는 원제("Comunicado Oficial: Yan Diomande")에 "바르사"를
 * 환각으로 채웠고, 그 한글 헤드라인이 이 추출기의 입력으로 들어와
 * clubs=["Barcelona"] confidence 1 로 전파됐다 — 실제 오피셜은 레알 마드리드.
 *
 * 방어: LLM 이 낸 클럽은 **영문 원제목에 실제로 등장할 때만** 채택한다.
 * 한글 헤드라인은 증거로 쓰지 않는다(그게 오염원). 증거 없는 클럽은 버리고
 * 신뢰도를 깎아 검수 눈에 띄게 한다 — 클럽 미상은 사가 연결(선수 identity)에
 * 지장이 없고, 단정보다 공란이 낫다 (fail-closed).
 */
const CLUB_EVIDENCE_ALIASES: Record<string, string[]> = {
  barcelona: ["barcelona", "barca", "barça", "fcb"],
  "real madrid": ["real madrid", "madrid"],
  "manchester united": ["manchester united", "man utd", "man united", "manchester utd"],
  "manchester city": ["manchester city", "man city"],
  tottenham: ["tottenham", "spurs"],
  "tottenham hotspur": ["tottenham", "spurs"],
  "paris saint-germain": ["paris saint-germain", "psg", "paris"],
  "bayern munich": ["bayern", "munich"],
  "atletico madrid": ["atletico", "atlético"],
  inter: ["inter"],
  "inter milan": ["inter"],
  "ac milan": ["milan"],
  "rb leipzig": ["leipzig"],
  newcastle: ["newcastle"],
  "newcastle united": ["newcastle"],
  "west ham": ["west ham"],
  "west ham united": ["west ham"],
  wolves: ["wolves", "wolverhampton"],
  wolverhampton: ["wolves", "wolverhampton"],
}

/**
 * 팀 표기 증거 색인 — 표기 하나로 그 팀의 **모든 표기**를 찾게 하는 사전.
 *
 * 왜 필요한가: 위 하드코딩 표는 손으로 적은 20팀뿐이라, 5세대 모델이 클럽명을 정본형으로
 * 펴 쓰기 시작하자(`PSG`→`Paris Saint-Germain`, `Forest`→`Nottingham Forest`) 원제목
 * 대조가 줄줄이 실패했다. 실측(고정 시험지, luna 전 실행 합집합): 클럽 언급 220건 중
 * **71건 탈락**. 별명까지 세면 더 벌어진다 — 기사는 "the Cherries"라 쓰고 모델은
 * "Bournemouth"라 낸다.
 *
 * 그래서 표를 늘리는 대신 **이미 있는 팀 사전**(team_dictionary 310팀 + 뉴스 표기 사전
 * team 항목)을 증거원으로 쓴다. 운영자가 사전에 별명을 넣으면 배포 없이 반영된다.
 * 같은 시험지에서 71 → 30 으로 줄었고, **반드시 탈락해야 하는 사례는 하나도 통과하지
 * 않았다**(제목에 클럽이 없는 기사 · 디오망데 실사고 재현 포함).
 *
 * ⚠️ 이건 표기 **치환**이 아니라 **증거 대조**다. notation 모듈이 사가를 제외하는 이유는
 *    인물(선수/감독) 표기 오염이라, 팀 증거에는 해당하지 않는다.
 */
export type TeamEvidenceIndex = ReadonlyMap<string, readonly string[]>

const TEAM_AFFIX = /^(fc|afc|cf|sc|as|ss|ssc|sl|rc|ac|sk|vfb|1\.)\s+|\s+(fc|afc|cf|sc|fk|sk)$/g
const HANGUL = /[가-힣]/

const normKey = (s: string): string => s.trim().toLowerCase()
const stripAffix = (s: string): string => normKey(s).replace(TEAM_AFFIX, " ").trim()

/**
 * 표기 하나를 대조 가능한 조각으로 쪼갠다.
 * - 한글 토큰: 라틴 접두·접미를 떼고 2자 이상 ("FC마치다" → "마치다", "강원FC" → "강원")
 * - 라틴 토큰: 5자 이상만 — "Real"·"City" 류 일반 토큰이 남의 기사에 걸리는 걸 막는다
 *   (기존 시험 "The real story behind the transfer" 가 이 선을 지킨다)
 */
function surfaceParts(surface: string): string[] {
  return stripAffix(surface)
    .split(/\s+/)
    .map((t) => (HANGUL.test(t) ? t.replace(/^[a-z0-9.]+/, "").replace(/[a-z0-9.]+$/, "") : t))
    .filter((t) => (HANGUL.test(t) ? t.length >= 2 : t.length >= 5))
}

/** 한 팀의 표기 묶음들을 받아 색인을 만든다. 어느 표기로 찾아도 그 팀의 전체 표기가 나온다. */
export function buildTeamEvidenceIndex(
  groups: readonly (readonly (string | null | undefined)[])[]
): TeamEvidenceIndex {
  const index = new Map<string, string[]>()
  for (const group of groups) {
    const surfaces = [...new Set(group.filter((s): s is string => !!s && !!s.trim()).map(normKey))]
    if (surfaces.length === 0) continue
    for (const surface of surfaces) {
      for (const key of [surface, stripAffix(surface)]) {
        if (!key) continue
        index.set(key, [...new Set([...(index.get(key) ?? []), ...surfaces])])
      }
    }
  }
  return index
}

export function filterClubsByEvidence(
  clubs: string[],
  title: string,
  teamIndex?: TeamEvidenceIndex
): { clubs: string[]; dropped: string[] } {
  const haystack = title.toLowerCase()
  const kept: string[] = []
  const dropped: string[] = []
  for (const club of clubs) {
    const key = club.trim().toLowerCase()
    if (!key) continue
    const candidates = new Set(CLUB_EVIDENCE_ALIASES[key] ?? [key])
    // 폴백: 전체명 또는 첫 토큰(5자 이상 — "Real"류 짧은 토큰 오폭 방지)
    const firstToken = key.split(/\s+/)[0]
    if (firstToken.length >= 5) candidates.add(firstToken)
    // 첫 토큰만 보면 "Eintracht Frankfurt"가 "Frankfurt" 제목에서 죽는다 — 전 토큰을 본다
    for (const part of surfaceParts(key)) candidates.add(part)
    if (teamIndex) {
      // 모델이 풀네임을 내고 사전은 축약형으로 등재된 경우까지 잇는다
      // ("Daejeon Hana Citizen" → 사전 키 "daejeon" → 표기 "대전 하나시티즌" → 조각 "대전")
      const lookups = [
        key,
        stripAffix(key),
        ...stripAffix(key)
          .split(/\s+/)
          .filter((t) => t.length >= 5),
      ]
      for (const lookup of lookups) {
        for (const surface of teamIndex.get(lookup) ?? []) {
          candidates.add(surface)
          for (const part of surfaceParts(surface)) candidates.add(part)
        }
      }
    }
    if ([...candidates].some((n) => haystack.includes(n))) kept.push(club)
    else dropped.push(club)
  }
  return { clubs: kept, dropped }
}

/** LLM 출력 방어 정규화 — 스키마 밖 값은 버린다 */
function sanitize(raw: unknown): ExtractedTransfer | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const stage =
    typeof r.stage_signal === "string" && STAGES.has(r.stage_signal)
      ? (r.stage_signal as ExtractedTransfer["stage_signal"])
      : null
  const player = typeof r.player === "string" && r.player.trim() ? r.player.trim() : null
  const playerKr = typeof r.player_kr === "string" && r.player_kr.trim() ? r.player_kr.trim() : null
  return {
    is_transfer: r.is_transfer === true,
    // ⚠️ 영문 이름이 없으면 **한글 표기로 대체한다** (2026-08-30, 모델을 gpt-5.6-luna 로
    //    올리면서 추가). 5세대 모델은 "제목에 영문 이름이 없으면 null" 지시를 곧이곧대로
    //    지켜서 한국 기사에 전부 player=null 을 낸다. 그런데 cron 의 `!ex.player` 분기가
    //    그걸 곧장 discarded 로 보내서 **한국발 이적 기사가 통째로 사라진다** (실측: 고정
    //    시험지 40건 중 한글 기사 6건 전부 소멸. luna·terra·sol 모두 동일 — 모델 결함이
    //    아니라 파이프라인에 한글 경로가 없던 것이다).
    //    4o-mini 는 애초에 한글 이름을 이 칸에 넣고 있었으므로 하류(canonicalizePlayer·
    //    normalizePlayerKey·transferClusterKey)는 한글 값을 이미 받아왔다 — 복원이지 신규가 아니다.
    //    ⚠️ 지어내기와는 무관하다. 여기 들어오는 한글은 **제목에 실재하는 표기**이고,
    //       없으면 여전히 null 이라 fail-closed 는 그대로다.
    player: player ?? playerKr,
    player_kr: playerKr,
    direction: r.direction === "out" ? "out" : "in",
    clubs: Array.isArray(r.clubs) ? r.clubs.filter((c): c is string => typeof c === "string") : [],
    stage_signal: stage,
    headline_ko:
      typeof r.headline_ko === "string" && r.headline_ko.trim()
        ? r.headline_ko.trim().slice(0, 80)
        : null,
    confidence: typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.5,
  }
}
