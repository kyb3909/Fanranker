import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isClubName } from "@/lib/naming/pick"
import { isWomensFootball } from "@/lib/news/quality-gate"

export const maxDuration = 120
export const dynamic = "force-dynamic"

/**
 * 관심도 심사 에이전트 (매시간) — "도저히 아무도 관심 안 가질 기사는 자동 반려"
 * (2026-08-04 운영자).
 *
 * 검수 큐(drafted)의 초안을 한국 축구 팬 커뮤니티 관점에서 심사해, 관심 없을
 * 기사만 반려한다. 원칙:
 * - 애매하면 유지 (fail-closed 는 '반려 안 함' 방향 — 잘못 버리는 게 더 나쁨)
 * - 반려 사유는 decision 에 기록 (검수 화면에서 확인 가능, 복구는 사람 몫)
 * - 이미 심사한 항목은 재심사 안 함 (decision.interest 마킹)
 *
 * 호출: ?dry=1 이면 판정만 보고 반려하지 않음.
 */

const BATCH = 25

const SYSTEM_PROMPT = `너는 한국 축구 팬 커뮤니티(EPL 중심)의 데스크다. 기사 제목 목록을 보고 각각 "우리 독자가 관심 가질 기사인가"를 판정하라.

**keep (유지)** — 하나라도 해당하면 무조건 유지:
- EPL·빅클럽(레알/바르사/바이에른/PSG/유벤투스 등 포함) 관련
- 스타 선수·유명 감독의 이적/거취/발언
- 한국인 선수 관련 (무조건 유지)
- 굵직한 오피셜, 충격적 사건, 리그 전체에 영향 주는 소식

**drop (반려)** — 명백히 아무도 안 볼 것만:
- 무명 하부리그·마이너 리그의 소소한 이적/임대 (예: 르망 임대, 알제리 리그 계약)
- 지역성 사건사고 (예: 하부리그 경기장 관중 사망)
- 축구협회·연맹의 행정 공지 (징계 지침, 규정 변경 등 팬 무관심 사안)
- 무명 코치·스태프 인사

애매하면 keep. 각 판정에 한 줄 이유.
JSON만: {"items": [{"i": 1, "keep": true, "reason": "..."}, ...]} — 입력 번호 그대로, 전 항목.`

async function judge(titles: string[]): Promise<({ keep: boolean; reason: string } | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return titles.map(() => null)
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
          { role: "user", content: titles.map((t, i) => `${i + 1}. ${t}`).join("\n") },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) return titles.map(() => null)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      items?: { i?: number; keep?: boolean; reason?: string }[]
    }
    const byIndex = new Map<number, { keep: boolean; reason: string }>()
    for (const it of parsed.items ?? []) {
      if (typeof it.i === "number") {
        byIndex.set(it.i, {
          keep: it.keep !== false,
          reason: String(it.reason ?? "").slice(0, 100),
        })
      }
    }
    return titles.map((_, i) => byIndex.get(i + 1) ?? null)
  } catch {
    return titles.map(() => null)
  }
}

async function cronGet(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  {
    const dry = request.nextUrl.searchParams.get("dry") === "1"
    const supabase = createServiceRoleClient()

    const { data: drafts } = await supabase
      .from("news_reservoir")
      .select("id, draft, decision")
      .eq("status", "drafted")
      .order("created_at", { ascending: false })
      .limit(50)

    // 이미 심사한 항목 제외
    const pending = (drafts ?? []).filter(
      (r) => !(r.decision as { interest?: unknown } | null)?.interest
    )
    if (pending.length === 0) return NextResponse.json({ ok: true, judged: 0 })

    let dropped = 0
    let kept = 0
    const report: { title: string; verdict: string }[] = []

    // ── 철벽 가드: 제목에 EPL·빅클럽명이 있으면 LLM 심사 없이 무조건 유지 ──
    // (드라이런 실측: LLM 이 헨더슨 첼시 합류·래시포드까지 반려하려 함 — 판단
    // 권한 자체를 안 준다. LLM 은 빅클럽 무관 단신만 심사)
    const guarded: typeof pending = []
    for (const row of pending) {
      const title = (row.draft as { title?: string })?.title ?? ""
      // ── 여자 축구 — 서비스 커버리지 밖, 클럽명 가드보다 먼저 검사해야 한다
      // ("아스날 위민" 이 클럽 keep 에 걸리면 안 됨). 운영자 확정 2026-08-04.
      if (isWomensFootball(title, (row.draft as { summary?: string })?.summary)) {
        dropped++
        report.push({ title, verdict: "reject(여자 축구)" })
        if (!dry) {
          await supabase
            .from("news_reservoir")
            .update({
              status: "rejected",
              decision: {
                ...(row.decision ?? {}),
                action: "reject",
                reason: "womens_football",
                reviewer: "auto",
                interest: { keep: false, guard: "womens", at: new Date().toISOString() },
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
        }
        continue
      }
      if (isClubName(title)) {
        kept++
        if (!dry) {
          await supabase
            .from("news_reservoir")
            .update({
              decision: {
                ...(row.decision ?? {}),
                interest: { keep: true, guard: "club", at: new Date().toISOString() },
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
        }
      } else {
        guarded.push(row)
      }
    }

    for (let i = 0; i < guarded.length; i += BATCH) {
      const chunk = guarded.slice(i, i + BATCH)
      const titles = chunk.map((r) => (r.draft as { title?: string })?.title ?? "")
      const verdicts = await judge(titles)

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j]
        const v = verdicts[j]
        if (!v) continue // 판정 실패 = 유지 (다음 회차 재시도)

        const nowIso = new Date().toISOString()
        if (v.keep) {
          kept++
          if (!dry) {
            // keep 마킹 — 재심사 방지 (반려 아님)
            await supabase
              .from("news_reservoir")
              .update({
                decision: { ...(row.decision ?? {}), interest: { keep: true, at: nowIso } },
                updated_at: nowIso,
              })
              .eq("id", row.id)
          }
        } else {
          dropped++
          report.push({ title: titles[j], verdict: v.reason })
          if (!dry) {
            await supabase
              .from("news_reservoir")
              .update({
                status: "rejected",
                decision: {
                  ...(row.decision ?? {}),
                  reviewer: "auto",
                  action: "reject",
                  reason: "low_interest",
                  interest: { keep: false, reason: v.reason, at: nowIso },
                },
                updated_at: nowIso,
              })
              .eq("id", row.id)
          }
        }
      }
    }

    return NextResponse.json({ ok: true, dry, judged: pending.length, kept, dropped, report })
  }
}

export const GET = withCronLog("news-interest-filter", cronGet)
