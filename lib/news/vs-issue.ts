import type { createServiceRoleClient } from "@/lib/supabase/server"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import type { TipTapNode } from "@/types/post"
import { chatParams } from "@/lib/llm/openai-params"
import { isClubName } from "@/lib/naming/pick"
import { logUsage } from "@/lib/llm/usage-log"

/**
 * VS 쟁점 생성 — 발행된 뉴스에 찬반 대결 폴 + 3줄 요약을 붙인다.
 *
 * 왜: 담벼락의 죽은 지점은 "읽기 → 글쓰기" 사이의 절벽이다 (커뮤 전환 1.5% 실측).
 * VS 폴은 그 사이 계단: 읽기(3줄 요약) → 1탭 투표 → 진영 방어 댓글.
 * 투표는 3명만 해도 "67% vs 33%"가 살아 보여서 콜드스타트에 강하다.
 *
 * 생성 시점: 발행 직후 after() (lib/news/publish.ts). 실패해도 발행은 무사 —
 * 폴 없는 기사는 그냥 기사로 남는다.
 *
 * ⚠️ 가드: LLM 이 유도성/모욕성 프레임을 만들면 안 된다 — 프롬프트에서
 * "양쪽 다 팬이 실제로 할 법한 합리적 주장"을 강제하고, 만들 쟁점이 없으면
 * null 을 반환하게 한다 (억지 쟁점은 참여가 아니라 냉소를 만든다).
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

interface VsIssue {
  question: string
  option_a: string
  option_b: string
  summary: [string, string, string]
}

const SYSTEM_PROMPT = `너는 한국 축구 커뮤니티의 데스크 에디터다. 기사를 읽고 두 가지를 만든다.

1) 3줄 요약: 기사의 핵심 팩트만 3줄. 각 줄 40자 이내, 감상·평가 금지.
2) 찬반 쟁점: 팬들이 실제로 갈릴 만한 질문 하나(30자 이내)와 양측 입장 라벨.
   - 라벨은 짧은 구어체 단정문 (각 14자 이내, 예: "레전드다" / "아쉬운 커리어다")
   - 양쪽 모두 팬이 실제로 할 법한 합리적 주장이어야 한다. 한쪽이 명백히
     틀리거나 모욕적인 프레임 금지.
   - 선수/감독 개인의 신체·가족·사망을 소재로 삼지 않는다.
   - 기사가 단순 사실 전달(경기 일정, 부상 보고 등)이라 갈릴 쟁점이 없으면
     쟁점을 억지로 만들지 말고 no_issue 를 true 로.

JSON만 출력: {"no_issue": boolean, "question": "...", "option_a": "...", "option_b": "...", "summary": ["...", "...", "..."]}`

/** 기사에서 VS 쟁점 생성. 쟁점화 불가/실패 시 null (throw 하지 않음) */
async function generateVsIssue(title: string, content: unknown): Promise<VsIssue | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const bodyText = extractTextFromTipTapJSON(content as TipTapNode).slice(0, 2000)
  if (!bodyText || bodyText.length < 50) return null // 본문이 없으면 요약도 쟁점도 억지

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams("gpt-5.6-luna", { temperature: 0.4 }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `제목: ${title}\n\n본문:\n${bodyText}` },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    logUsage("news-vs-issue", "gpt-5.6-luna", data)
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      no_issue?: boolean
      question?: string
      option_a?: string
      option_b?: string
      summary?: string[]
    }
    if (
      parsed.no_issue ||
      !parsed.question ||
      !parsed.option_a ||
      !parsed.option_b ||
      !Array.isArray(parsed.summary) ||
      parsed.summary.length < 3
    ) {
      return null
    }
    return {
      question: parsed.question.slice(0, 60),
      option_a: parsed.option_a.slice(0, 20),
      option_b: parsed.option_b.slice(0, 20),
      summary: [
        String(parsed.summary[0]).slice(0, 60),
        String(parsed.summary[1]).slice(0, 60),
        String(parsed.summary[2]).slice(0, 60),
      ],
    }
  } catch {
    return null
  }
}

/**
 * 발행된 게시물에 VS 폴 생성·저장. 이미 있으면 스킵. 절대 throw 하지 않는다.
 * is_active=true 라야 기존 투표 API(/api/polls/[id]/vote)가 그대로 동작한다.
 * 사이드바 일반 폴과의 구분은 post_id 로 (active 조회가 post_id IS NULL 필터).
 */
export async function createVsPollForPost(
  supabase: ServiceClient,
  postId: string,
  title: string,
  content: unknown
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("polls")
      .select("id")
      .eq("post_id", postId)
      .maybeSingle()
    if (existing) return

    const issue = await generateVsIssue(title, content)
    if (!issue) return

    const { error } = await supabase.from("polls").insert({
      question: issue.question,
      options: [
        { key: "a", label: issue.option_a },
        { key: "b", label: issue.option_b },
      ],
      summary: issue.summary,
      post_id: postId,
      is_active: true,
      allow_reason: false, // "왜?"는 댓글이 담당 — 입력 이원화 방지
      created_by: "system_vs",
    })
    if (error) console.error("[vs-issue] 폴 저장 실패:", error.message)
  } catch (e) {
    console.error("[vs-issue] 생성 예외:", e)
  }
}

/** 스캐너가 초안에 실어 보내는 VS 제안 (news_reservoir.draft.vs) */
export interface VsDraftProposal {
  question: string
  option_a: string
  option_b: string
  summary: string[]
  confidence: number
}

/** 검수 화면의 결정 — enabled 미지정이면 confidence 기본값을 따른다 */
export interface VsReviewDecision {
  enabled?: boolean
  question?: string
  optionA?: string
  optionB?: string
}

/** 신뢰도 기본 켜짐 임계 (가설 — 2주 실측으로 교체 예정, VS-RESULT.md 결정 2) */
export const VS_AUTO_ON_CONFIDENCE = 0.7

/**
 * 일 쿼터 — 하루에 **켜진 채** 나가는 VS 폴 상한 (2026-08-12 운영자 결정).
 *
 * 배경: 실측 하루 24건(최근 7일 13~31건)이 붙어 피드 카드의 **61%가 질문을 걸고**
 * 있었다. 전부가 물으면 묻는 게 신호가 아니게 된다 — 눈이 배너로 학습해 건너뛴다.
 * 6건이면 피드 비중이 약 25%(네 장 중 한 장) 선으로 내려간다.
 *
 * 판정을 정교화하는 대신 상한으로 페이싱하는 건 이 저장소 관례다 — news-auto-publish
 * 의 PER_RUN_CAP, 스캐너의 MAX_LLM_PER_RUN 과 같은 철학이다. confidence 임계값을
 * 올리는 방식을 안 쓴 이유는 아래 게이트 주석 참조.
 */
export const VS_DAILY_QUOTA = 6

/**
 * KST 자정의 UTC ISO — 쿼터를 "하루"로 자르는 기준선.
 * ⚠️ app/api/cron/news-auto-publish/route.ts 에 같은 함수가 있다(그쪽이 원본).
 * 날짜 경계 규칙을 고칠 일이 생기면 **양쪽 다** 고칠 것.
 */
function kstMidnightUtcIso(): string {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  return new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString()
}

/** 오늘(KST) 켜진 채 만들어진 VS 폴 수 — 쿼터는 "보이는 밀도" 상한이라 is_active 만 센다 */
async function countTodayActiveVsPolls(supabase: ServiceClient): Promise<number> {
  const { count } = await supabase
    .from("polls")
    .select("id", { count: "exact", head: true })
    .eq("created_by", "system_vs")
    .eq("is_active", true)
    .gte("created_at", kstMidnightUtcIso())
  return count ?? 0
}

/**
 * 초안의 VS 제안 + 검수 결정 → 폴 생성 (2026-07-31, 발행 시 LLM 호출 제거).
 *
 * 기본값 정책 (3인 회의 결론 — fail-open):
 *   confidence >= 0.7 → 검수자가 안 끄면 켜진 채 발행
 *   0.4~0.7          → 제안 상태(꺼짐)로 저장 — 검수에서 켰을 때만 노출
 * 검수 결정(enabled/문구 수정)이 오면 그것이 우선한다. 절대 throw 하지 않는다.
 *
 * ## 관심도 게이트 + 일 쿼터 (2026-08-12 추가)
 *
 * **왜 confidence 로는 안 되는가.** 스캐너의 `judgeVsIssue()` 는 초안 작성과 *동시에*
 * 돌아서, 관심도 심사(별도 크론)가 있기도 전에 confidence 를 굳힌다. 그 프롬프트에는
 * 클럽·선수 유명도를 묻는 문항이 한 줄도 없고 함수 입력도 제목·본문 둘뿐이다 —
 * 즉 confidence 는 "갈등 구도가 서술 가능한가"만 재고 "그 갈등에 몇 명이 신경 쓰는가"는
 * 아무도 안 잰다. 두 축이 직교하므로 임계값을 올려봐야 "쟁점은 확실한데 아무도 관심
 * 없는 것"은 그대로 통과한다. 그래서 축을 하나 더 세운다.
 *
 * **왜 새 LLM 판정을 안 만드는가.** 뉴스 관심도 필터가 이미 쓰는 `isClubName()` 을
 * 그대로 재사용한다. 정규식이라 LLM 호출 0회고, 모델·프롬프트가 바뀌어도 판정이
 * 흔들리지 않는다. 여기서 판정 사전을 새로 세우면 표기 사전이 읽는 경로 7개로 갈라져
 * 사고가 반복되던 패턴을 VS 게이트에서 재현하게 된다.
 *
 * **사람이 이긴다.** 검수자가 명시적으로 켠 폴은 게이트·쿼터가 뒤집지 않는다 —
 * 자동 기본값만 조이는 장치다.
 *
 * ⚠️ 한계: 유명 선수가 무명 클럽에 있는 기사는 `isClubName()` 이 못 잡아 폴이 꺼진다.
 * 정규식으로 선수 목록까지 담는 건 불가능해서 남겨둔 사각지대다 — 개막 후 실트래픽으로
 * 폴 유형별 투표 패턴이 보이면 그때 다시 본다.
 */
export async function createVsPollFromDraft(
  supabase: ServiceClient,
  postId: string,
  title: string,
  proposal: VsDraftProposal,
  decision?: VsReviewDecision | null
): Promise<void> {
  try {
    if (decision?.enabled === false && !decision.question) {
      // 검수자가 명시적으로 껐고 문구 수정도 없으면 — 제안 자체를 기록할 가치는 있다
      // (off_reason 없이 is_active=false 로 저장 → 사후 켜기 가능, 기각 데이터로도 활용)
    }
    const { data: existing } = await supabase
      .from("polls")
      .select("id")
      .eq("post_id", postId)
      .maybeSingle()
    if (existing) return

    const question = (decision?.question ?? proposal.question).trim()
    const optionA = (decision?.optionA ?? proposal.option_a).trim()
    const optionB = (decision?.optionB ?? proposal.option_b).trim()
    if (!question || !optionA || !optionB) return

    // 검수자 결정이 최우선. 자동 경로만 관심도·쿼터를 통과해야 켜진다 —
    // && 단축 평가라 앞의 두 조건이 깨지면 쿼터 COUNT 질의 자체가 안 나간다.
    const isActive =
      decision?.enabled ??
      (proposal.confidence >= VS_AUTO_ON_CONFIDENCE &&
        isClubName(title) &&
        (await countTodayActiveVsPolls(supabase)) < VS_DAILY_QUOTA)

    const { error } = await supabase.from("polls").insert({
      question: question.slice(0, 80),
      options: [
        { key: "a", label: optionA.slice(0, 24) },
        { key: "b", label: optionB.slice(0, 24) },
      ],
      summary: proposal.summary.slice(0, 3),
      post_id: postId,
      is_active: isActive,
      confidence: proposal.confidence,
      allow_reason: false, // "왜?"는 댓글이 담당 — 입력 이원화 방지
      created_by: "system_vs",
    })
    if (error) console.error("[vs-issue] 폴 저장 실패:", error.message)
  } catch (e) {
    console.error("[vs-issue] 생성 예외:", e)
  }
}

/** 게시물의 VS 폴 + 집계 + 내 투표 조회 (상세 페이지 서버 렌더용) */
export interface VsPollData {
  pollId: string
  question: string
  summary: string[] | null
  options: { key: string; label: string }[]
  counts: Record<string, number>
  total: number
  myKey: string | null
  /** 댓글 진영 칩용 — user_id → option key */
  voterMap: Record<string, string>
}

export async function fetchVsPoll(
  supabase: ServiceClient,
  postId: string,
  myUserId: string | null
): Promise<VsPollData | null> {
  const { data: poll } = await supabase
    .from("polls")
    .select("id, question, options, summary, is_active")
    .eq("post_id", postId)
    .maybeSingle()
  if (!poll || !poll.is_active) return null

  const { data: votes } = await supabase
    .from("poll_votes")
    .select("user_id, option_key")
    .eq("poll_id", poll.id)
    .limit(5000)

  const counts: Record<string, number> = {}
  const voterMap: Record<string, string> = {}
  let myKey: string | null = null
  for (const v of votes ?? []) {
    counts[v.option_key] = (counts[v.option_key] ?? 0) + 1
    voterMap[v.user_id] = v.option_key
    if (myUserId && v.user_id === myUserId) myKey = v.option_key
  }

  return {
    pollId: poll.id,
    question: poll.question,
    summary: Array.isArray(poll.summary) ? (poll.summary as string[]) : null,
    options: (poll.options as { key: string; label: string }[]) ?? [],
    counts,
    total: (votes ?? []).length,
    myKey,
    voterMap,
  }
}
