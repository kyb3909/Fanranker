import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { chatParams } from "@/lib/llm/openai-params"

/**
 * 운영 인사이트 — "무엇을 주목하고, 다음에 무엇을 할지".
 *
 * 왜 만드나: 기존 주간 리포트의 summary 는 숫자를 나열한 템플릿이라 신호를 못 짚는다.
 * 실제로 월드컵 이벤트 종료 후 예측 참여가 58%→2% 로 붕괴한 주에도 요약문은
 * "참여율 2.3%" 라고만 적고 지나갔다. 사람이 세 주치를 나란히 놓고 봐야 보이는 걸
 * 대신 짚어주는 게 목적이다.
 *
 * 설계 원칙:
 *  - **GA4 단독으로는 부족하다.** 트래픽만 보면 "왜 떨어졌나"를 못 본다. 내부 지표
 *    (가입·글·댓글·예측·발행·검수 대기)를 같이 넣어야 원인 추정이 가능하다.
 *  - **추이가 핵심.** 한 주 스냅샷이 아니라 최근 3주를 준다. 변화가 신호다.
 *  - **노이즈를 명시적으로 분리**시킨다. 1~2인 팀에서 "안 봐도 되는 것"을 알려주는 게
 *    "봐야 할 것"만큼 가치 있다.
 */

const DEFAULT_MODEL = process.env.ADMIN_INSIGHT_MODEL || "gpt-4.1"

interface InsightItem {
  title: string
  detail: string
}
interface ActionItem {
  title: string
  why: string
  /** 대략적 규모 — 1~2인 팀이 착수 여부를 판단하는 기준 */
  effort: "작음" | "보통" | "큼"
}
export interface Insight {
  headline: string
  watch: InsightItem[]
  actions: ActionItem[]
  noise: string[]
}

const PROMPT = `너는 1~2인이 운영하는 한국 스포츠 커뮤니티(축구 뉴스 + 승부예측)의 데이터 분석 파트너다.
주간 지표를 받아 **운영자가 이번 주에 실제로 할 일**을 짚어준다.

## 판단 원칙
1. **변화가 신호다.** 절대값보다 추이를 본다. 급변이 있으면 원인을 데이터 안에서 추정해라.
2. **GA4 와 내부 지표를 교차해서 읽어라.** 예: 트래픽은 유지인데 예측 참여가 급락 → 유입 문제가 아니라 동기 문제.
3. **1~2인 팀이 실제로 할 수 있는 것**만 제안해라. "마케팅 예산 증액" 같은 건 쓸모없다.
4. **모르면 모른다고 해라.** 데이터가 부족하면 "무엇을 측정해야 알 수 있는지"를 말해라. 지어내지 마라.
5. 표본이 작으면(주간 활성 유저 100명 미만) 비율 변화를 과대해석하지 마라 — 그 사실을 명시해라.

## 출력 (JSON only)
{
  "headline": "이번 주를 한 문장으로. 숫자 하나는 포함할 것",
  "watch": [ {"title": "주목할 것 (짧게)", "detail": "왜 주목해야 하는지 + 근거 수치"} ],   // 2~4개, 중요한 순
  "actions": [ {"title": "할 일", "why": "이걸 하면 무엇이 달라지나", "effort": "작음|보통|큼"} ],  // 2~4개
  "noise": ["이번 주에 신경 안 써도 되는 것 + 이유"]   // 0~3개
}

한국어로. 과장·격려·수사 금지. 운영자는 바쁘다 — 각 항목 2문장 이내.`

/** 최근 N주 GA4 리포트 + 내부 지표를 모아 LLM 입력 스냅샷을 만든다 */
export async function buildInsightInput(supabase: SupabaseClient, weeks = 3) {
  const since = new Date(Date.now() - weeks * 7 * 24 * 3600_000).toISOString()

  const [ga4Reports, signups, posts, comments, slips, botPosts, drafted] = await Promise.all([
    supabase
      .from("weekly_analytics_reports")
      .select("period_start, period_end, report_data, summary")
      .order("period_start", { ascending: false })
      .limit(weeks),
    supabase.from("profiles").select("created_at").gte("created_at", since),
    supabase
      .from("posts")
      .select("created_at, user_id, view_count, comment_count")
      .gte("created_at", since)
      .is("deleted_at", null),
    supabase.from("comments").select("created_at").gte("created_at", since).is("deleted_at", null),
    supabase.from("prediction_slips").select("created_at, stake").gte("created_at", since),
    supabase
      .from("posts")
      .select("created_at, view_count")
      .eq("user_id", "user_bot_soccer_kr")
      .gte("created_at", since)
      .is("deleted_at", null),
    supabase
      .from("news_reservoir")
      .select("id", { count: "exact", head: true })
      .eq("status", "drafted"),
  ])

  /** ISO 주 시작(월요일) 키로 묶어 주간 추이를 만든다 */
  const weekKey = (iso: string) => {
    const d = new Date(iso)
    const day = (d.getUTCDay() + 6) % 7 // 월=0
    d.setUTCDate(d.getUTCDate() - day)
    return d.toISOString().slice(0, 10)
  }
  const countByWeek = (rows: { created_at: string }[] | null) => {
    const m: Record<string, number> = {}
    for (const r of rows ?? []) m[weekKey(r.created_at)] = (m[weekKey(r.created_at)] ?? 0) + 1
    return m
  }

  const botRows = botPosts.data ?? []
  const botViews = botRows.reduce((s, p) => s + (Number(p.view_count) || 0), 0)
  const userPosts = (posts.data ?? []).filter((p) => p.user_id !== "user_bot_soccer_kr")

  return {
    ga4주간: (ga4Reports.data ?? []).map((r) => ({
      기간: `${r.period_start}~${r.period_end}`,
      요약: r.summary,
      상세: r.report_data,
    })),
    내부지표: {
      설명: "주 시작(월요일) 기준 주간 집계",
      신규가입_주간: countByWeek(signups.data),
      유저글_주간: countByWeek(userPosts),
      댓글_주간: countByWeek(comments.data),
      예측슬립_주간: countByWeek(slips.data),
      봇기사_주간: countByWeek(botRows),
      봇기사_총조회: botViews,
      봇기사_평균조회: botRows.length > 0 ? Number((botViews / botRows.length).toFixed(2)) : 0,
      검수대기_현재: drafted.count ?? 0,
    },
    맥락: {
      단계: "정식 오픈 전. EPL 개막(8/21) 맞춰 유튜버 채널 홍보 예정",
      최근이벤트: "월드컵 예측 이벤트가 7월 중순 종료됨",
      팀규모: "운영자 1명",
    },
  }
}

/** LLM 호출. 실패하면 null — 인사이트가 없다고 화면이 죽으면 안 된다. */
export async function generateInsight(
  input: unknown
): Promise<{ insight: Insight; model: string; ms: number } | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const started = Date.now()
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams(DEFAULT_MODEL, { temperature: 0.3, max_tokens: 1600 }),
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: JSON.stringify(input) },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) {
      console.error("[insight] OpenAI HTTP", res.status)
      return null
    }
    const json = await res.json()
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as Partial<Insight>

    // 형태 검증 — LLM 이 스키마를 어겨도 화면이 깨지지 않게 정규화한다
    const insight: Insight = {
      headline: String(parsed.headline ?? "").trim() || "요약을 생성하지 못했습니다.",
      watch: (parsed.watch ?? [])
        .filter((w) => w?.title)
        .slice(0, 4)
        .map((w) => ({ title: String(w.title), detail: String(w.detail ?? "") })),
      actions: (parsed.actions ?? [])
        .filter((a) => a?.title)
        .slice(0, 4)
        .map((a) => ({
          title: String(a.title),
          why: String(a.why ?? ""),
          effort: (["작음", "보통", "큼"] as const).includes(a.effort as never)
            ? (a.effort as ActionItem["effort"])
            : "보통",
        })),
      noise: (parsed.noise ?? []).filter(Boolean).slice(0, 3).map(String),
    }
    return { insight, model: DEFAULT_MODEL, ms: Date.now() - started }
  } catch (e) {
    console.error("[insight] 생성 실패:", e)
    return null
  }
}
