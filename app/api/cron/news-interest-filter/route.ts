import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isClubName } from "@/lib/naming/pick"
import { isWomensFootball } from "@/lib/news/quality-gate"
import { judgeInterest, toInterestItem } from "@/lib/news/interest-filter"
import {
  newsCandidateRunId,
  recordNewsCandidateEvents,
  type NewsCandidateEvent,
} from "@/lib/news/candidate-ledger"

// 클럽 가드가 심사를 건너뛰지 않게 되면서 LLM 이 보는 물량이 ~6배가 된다
export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * 관심도 심사 에이전트 (매시간) — "한국 독자가 관심 가질 만한 것들만 발행한다"
 * (2026-08-10 운영자. 2026-08-04 최초 도입 시엔 "아무도 안 볼 것만 반려").
 *
 * ## 왜 기준이 뒤집혔는가 (2026-08-10)
 * 7일 실측: 발행 234건 / 평균 조회 **0.57** / 조회 0건이 **151건(65%)**. 최고 조회수가 7이다.
 * 물량이 독자를 만들지 못한다는 게 데이터로 끝났다.
 *
 * 그런데 원인은 프롬프트가 아니라 **클럽명 가드**였다. 같은 7일 심사 경로:
 *   클럽 가드 keep 76  /  LLM keep 8  /  LLM drop 121  /  여자축구 20
 * LLM 은 본 것의 94%를 버린다 — 관대한 게 아니라 엄격하다. 문제는 **볼 기회가 없다**는 것.
 * 제목에 빅클럽명이 있으면 `isClubName()` 이 심사를 통째로 건너뛰었고, EPL·빅클럽이
 * 발행 대상의 거의 전부라 필터가 사실상 무력화돼 있었다. 통과 84건 중 90%가 무심사다.
 *
 * ## 그래서 축을 둘로 나눈다
 *   ① 주체 — 한국 독자가 아는 팀·선수인가  → 클럽 가드가 담당 (그대로 둔다)
 *   ② 농도 — 읽을 값이 있는 소식인가        → 신설. **모든 기사가 받는다**
 * 조회 0 기사들은 클럽이 없어서가 아니라 농도가 없어서 안 읽혔다:
 *   "플릭, 아라우호 임대 관련 **발언**" · "에버턴과 풀럼, 벨레린 영입에 **관심**"
 *
 * 클럽 가드를 없애지 않는 이유: "LLM 이 헨더슨 첼시 합류·래시포드까지 반려하려 함"이라는
 * 실사고의 산물이다. **심사 면제**에서 **주체 통과**로 의미만 바꾼다 — 빅클럽 기사는
 * '무관하다'는 이유로는 못 버리고, 오직 농도로만 버린다.
 *
 * 원칙:
 * - 판정 실패는 유지 (다음 회차 재시도) — 잘못 버리는 게 여전히 더 나쁘다
 * - 반려 사유는 decision 에 기록 (검수 화면에서 확인, 복구는 사람 몫)
 * - 이미 심사한 항목은 재심사 안 함 (decision.interest 마킹)
 *
 * 호출: ?dry=1 이면 판정만 보고 반려하지 않음.
 */

// 본문 앞부분까지 넣으므로 배치를 줄인다 (제목만 볼 땐 25였음)
const BATCH = 20

async function cronGet(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  {
    const dry = request.nextUrl.searchParams.get("dry") === "1"
    const supabase = createServiceRoleClient()
    const ledgerRunId = newsCandidateRunId("news-interest-filter")
    const ledgerEvents: NewsCandidateEvent[] = []

    const { data: drafts, error: draftError } = await supabase
      .from("news_reservoir")
      .select("id, draft, decision, urls")
      .eq("status", "drafted")
      .order("created_at", { ascending: false })
      .limit(50)
    if (draftError) {
      return NextResponse.json({ ok: false, error: draftError.message }, { status: 500 })
    }

    // 이미 심사한 항목 제외
    const pending = (drafts ?? []).filter(
      (r) => !(r.decision as { interest?: unknown } | null)?.interest
    )
    if (pending.length === 0) return NextResponse.json({ ok: true, judged: 0 })

    let dropped = 0
    let kept = 0
    let failed = 0
    const errors: string[] = []
    const report: { title: string; verdict: string }[] = []

    // ── 클럽 가드 = **주체 통과** 표시 (2026-08-10 의미 변경) ──
    // 이전엔 여기서 LLM 심사를 통째로 건너뛰었다. 그 결과 통과분의 90%가 무심사로
    // 나갔고 조회수가 죽었다(위 주석 참조). 이제는 건너뛰지 않고 [빅클럽] 으로 표시해
    // LLM 에 넘긴다 — 프롬프트가 "관심 없는 팀"을 사유로 한 반려를 금지하므로,
    // 원래 이 가드가 막으려던 실사고(헨더슨 첼시 합류 반려)는 그대로 막힌다.
    const toJudge: { row: (typeof pending)[number]; bigClub: boolean }[] = []
    for (const row of pending) {
      const title = (row.draft as { title?: string })?.title ?? ""
      // ── 여자 축구 — 서비스 커버리지 밖, 클럽명 가드보다 먼저 검사해야 한다
      // ("아스날 위민" 이 클럽 keep 에 걸리면 안 됨). 한국어 제목에선 성별 표기가
      // 지워지는 실사고(몰리 바트립)가 있어 출처 URL·영문 원제까지 검사. 2026-08-04.
      if (
        isWomensFootball(
          title,
          (row.draft as { summary?: string })?.summary,
          (row.urls as { source?: string } | null)?.source,
          (row.draft as { original?: { title?: string } })?.original?.title
        )
      ) {
        dropped++
        report.push({ title, verdict: "reject(여자 축구)" })
        if (!dry) {
          const { error } = await supabase
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
          if (error) {
            errors.push(`${row.id}: 여자 축구 반려 기록 실패 — ${error.message}`)
            ledgerEvents.push({
              candidate_id: row.id,
              reservoir_id: row.id,
              to_state: "retry_wait",
              actor: "news-interest-filter",
              reason_code: "rejection_write_failed",
              details: { error: error.message },
              run_id: ledgerRunId,
            })
          } else {
            ledgerEvents.push({
              candidate_id: row.id,
              reservoir_id: row.id,
              to_state: "rejected",
              actor: "news-interest-filter",
              reason_code: "womens_football",
              run_id: ledgerRunId,
            })
          }
        }
        continue
      }
      toJudge.push({ row, bigClub: isClubName(title) })
    }

    for (let i = 0; i < toJudge.length; i += BATCH) {
      const chunk = toJudge.slice(i, i + BATCH)
      const verdicts = await judgeInterest(
        chunk.map(({ row, bigClub }) =>
          toInterestItem(row.draft as { title?: string; content?: unknown } | null, bigClub)
        )
      )

      for (let j = 0; j < chunk.length; j++) {
        const { row, bigClub } = chunk[j]
        const title = (row.draft as { title?: string })?.title ?? ""
        const v = verdicts[j]
        if (!v) {
          failed++ // 판정 실패 = 유지 (다음 회차 재시도)
          if (!dry) {
            ledgerEvents.push({
              candidate_id: row.id,
              reservoir_id: row.id,
              to_state: "retry_wait",
              actor: "news-interest-filter",
              reason_code: "interest_judgement_failed",
              run_id: ledgerRunId,
            })
          }
          continue
        }

        const nowIso = new Date().toISOString()
        if (v.keep) {
          kept++
          if (!dry) {
            // keep 마킹 — 재심사 방지 (반려 아님)
            const { error } = await supabase
              .from("news_reservoir")
              .update({
                decision: {
                  ...(row.decision ?? {}),
                  // bigClub 을 남겨야 나중에 "빅클럽 표시가 판정을 얼마나 지켰나"를 잰다
                  interest: { keep: true, bigClub, at: nowIso },
                },
                updated_at: nowIso,
              })
              .eq("id", row.id)
            if (error) {
              errors.push(`${row.id}: 관심 유지 기록 실패 — ${error.message}`)
              ledgerEvents.push({
                candidate_id: row.id,
                reservoir_id: row.id,
                to_state: "retry_wait",
                actor: "news-interest-filter",
                reason_code: "interest_keep_write_failed",
                details: { error: error.message },
                run_id: ledgerRunId,
              })
            } else {
              ledgerEvents.push({
                candidate_id: row.id,
                reservoir_id: row.id,
                to_state: "assigned",
                actor: "news-interest-filter",
                reason_code: "interest_keep",
                details: { reason: v.reason },
                run_id: ledgerRunId,
              })
            }
          }
        } else {
          dropped++
          report.push({ title: `${bigClub ? "[빅클럽] " : ""}${title}`, verdict: v.reason })
          if (!dry) {
            const { error } = await supabase
              .from("news_reservoir")
              .update({
                status: "rejected",
                decision: {
                  ...(row.decision ?? {}),
                  reviewer: "auto",
                  action: "reject",
                  reason: "low_interest",
                  interest: { keep: false, bigClub, reason: v.reason, at: nowIso },
                },
                updated_at: nowIso,
              })
              .eq("id", row.id)
            if (error) {
              errors.push(`${row.id}: 관심도 반려 기록 실패 — ${error.message}`)
              ledgerEvents.push({
                candidate_id: row.id,
                reservoir_id: row.id,
                to_state: "retry_wait",
                actor: "news-interest-filter",
                reason_code: "rejection_write_failed",
                details: { error: error.message },
                run_id: ledgerRunId,
              })
            } else {
              ledgerEvents.push({
                candidate_id: row.id,
                reservoir_id: row.id,
                to_state: "rejected",
                actor: "news-interest-filter",
                reason_code: "low_interest",
                details: { reason: v.reason },
                run_id: ledgerRunId,
              })
            }
          }
        }
      }
    }

    const ledgerRecorded = dry ? true : await recordNewsCandidateEvents(supabase, ledgerEvents)

    return NextResponse.json({
      ok: errors.length === 0,
      dry,
      attempted: pending.length,
      judged: kept + dropped,
      kept,
      dropped,
      failed,
      observability: ledgerRecorded ? "ok" : "degraded",
      report,
      ...(errors.length > 0 ? { errors } : {}),
    })
  }
}

export const GET = withCronLog("news-interest-filter", cronGet)
