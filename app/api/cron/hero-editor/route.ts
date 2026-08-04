import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * 편집장 에이전트 (30분 주기) — 메인 히어로 3장을 **편집 감각으로** 선정
 * (2026-08-04 운영자: "규칙 말고 에이전트가 판단을 내렸으면 좋겠어").
 *
 * 최근 24시간 기사 후보(제목·반응·사가 연결)를 보고 "지금 메인에 걸어야 할 3개"를
 * 고른다. 선정 **이유가 반드시 함께 기록**된다 (agent_picks.payload) — 근거 없는
 * 자동 행동 금지 원칙.
 *
 * 서열: 운영자 핀 > 이 에이전트의 픽 > 점수 규칙 폴백 (에이전트 죽어도 홈은 산다).
 */

const NEWS_BOT = "user_bot_soccer_kr"

async function cronGet(request: Request) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, skipped: "OPENAI_API_KEY 없음" })

    const supabase = createServiceRoleClient()

    // 후보: 최근 24h, 이미지 있는 봇 기사
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, title, image, comment_count, vote_count, created_at")
      .eq("user_id", NEWS_BOT)
      .is("deleted_at", null)
      .not("image", "is", null)
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(25)
    if (postsError) {
      return NextResponse.json({ ok: false, error: postsError.message }, { status: 500 })
    }
    if (!posts || posts.length === 0) {
      return NextResponse.json({ ok: true, skipped: "후보 없음" })
    }

    const { data: links, error: linksError } = await supabase
      .from("saga_article_links")
      .select("post_id, sagas!inner ( saga_type )")
      .in(
        "post_id",
        posts.map((p) => p.id)
      )
    if (linksError) {
      return NextResponse.json({ ok: false, error: linksError.message }, { status: 500 })
    }
    const sagaLinked = new Set(
      (links ?? [])
        .filter((l) => (l.sagas as unknown as { saga_type: string })?.saga_type === "transfer")
        .map((l) => l.post_id as string)
    )

    const candidateList = posts
      .map(
        (p, i) =>
          `${i + 1}. [id:${p.id}] ${p.title} (댓글 ${p.comment_count ?? 0}, 추천 ${p.vote_count ?? 0}${sagaLinked.has(p.id as string) ? ", 이적사가 연결" : ""})`
      )
      .join("\n")

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `너는 한국 축구 팬 커뮤니티의 편집장이다. 오늘의 기사 후보 중 메인 배너에 걸 3개를 골라라.

기준 (중요도 순):
1. 눈길 — 빅클럽·빅네임·오피셜 확정·충격적인 소식이 위
2. 논쟁 유발 — 팬들이 댓글로 싸우고 싶어질 소식 (이적 드라마, 라이벌 관련)
3. 다양성 — 같은 선수/같은 주제로 2개 이상 걸지 말 것
4. 반응 — 이미 댓글·추천이 붙은 기사는 가산점

각 선정에 한 줄 이유를 달아라 (운영자가 나중에 "왜 이게 메인?"을 확인한다).
JSON만: {"picks": [{"id": "...", "reason": "..."}, ...]} — 정확히 3개, id는 후보의 [id:...] 값 그대로.`,
          },
          { role: "user", content: candidateList },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: `LLM HTTP ${res.status}` })
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      picks?: { id?: string; reason?: string }[]
    }
    const validIds = new Set(posts.map((p) => p.id as string))
    const picks = (parsed.picks ?? [])
      .filter((p) => p.id && validIds.has(p.id))
      .slice(0, 3)
      .map((p) => ({ id: p.id as string, reason: String(p.reason ?? "").slice(0, 120) }))

    if (picks.length === 0) {
      // fail-closed: 판단 실패면 기존 픽 유지 (fetchHeroCards 가 규칙 폴백도 갖고 있음)
      return NextResponse.json({ ok: false, skipped: "유효한 픽 없음 — 기존 유지" })
    }

    const { error: pickError } = await supabase.from("agent_picks").upsert({
      kind: "hero",
      payload: { picks, decided_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    if (pickError) {
      return NextResponse.json({ ok: false, error: pickError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, picks })
  }
}

export const GET = withCronLog("hero-editor", cronGet)
