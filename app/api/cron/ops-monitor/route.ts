import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { notifyDiscordOps } from "@/lib/discord-notify"
import { isBreakingNewsItem } from "@/lib/news/breaking"

export const dynamic = "force-dynamic"

/**
 * GET/POST /api/cron/ops-monitor  (CRON_SECRET, vercel.json 30분 주기)
 *
 * DB 헬스 신호를 점검해 이상 시 디스코드 운영 채널로 알림.
 * - 크롤링 이슈: betman 동기화 지연 / 뉴스 크롤러(티커) 지연 (Vultr cron 이 죽으면 DB가
 *   안 갱신되므로 신선도로 감지 — 민감한 Vultr 스크립트를 건드리지 않음)
 * - 미정산 이슈: 경기 결과 나왔는데 pending 인 고아 예측 (settle-pending 안전망이 못 잡은 것)
 * - 돈 정합성: 미해결 환불 큐 / 고아 슬립 / 배당 미기록 예측
 *   (볼 차감 3단계에 트랜잭션 경계가 없다 — 구조를 바꾸는 대신 새는 순간 감지한다)
 *
 * 이상 없으면 알림 없음. 지속 이상은 30분마다 재알림(아웃티지 리마인드).
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gongnori.fan"
const H = 3600000

export async function POST(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  const issues: { name: string; value: string }[] = []

  // 1) betman 동기화 지연 (> 3시간)
  try {
    const { data: sync } = await supabase
      .from("betman_sync_state")
      .select("last_checked_at, last_error")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ last_checked_at: string | null; last_error: string | null }>()
    const ageH = sync?.last_checked_at
      ? (Date.now() - new Date(sync.last_checked_at).getTime()) / H
      : Infinity
    if (ageH > 3) {
      issues.push({
        name: "🕷️ betman 동기화 지연",
        value: Number.isFinite(ageH)
          ? `마지막 체크 ${Math.round(ageH)}시간 전${sync?.last_error ? ` · ${sync.last_error}` : ""}`
          : "동기화 상태 없음",
      })
    }
  } catch (e) {
    console.error("ops-monitor betman check 실패:", e)
  }

  // 2) 뉴스 크롤러(티커) 지연 (> 2시간; Vultr 크롤러 10분 주기)
  try {
    const { data: ticker } = await supabase
      .from("news_ticker_items")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ updated_at: string | null }>()
    const ageH = ticker?.updated_at
      ? (Date.now() - new Date(ticker.updated_at).getTime()) / H
      : Infinity
    if (ageH > 2) {
      issues.push({
        name: "🕷️ 뉴스 크롤러 지연",
        value: Number.isFinite(ageH)
          ? `마지막 갱신 ${Math.round(ageH)}시간 전`
          : "티커 데이터 없음",
      })
    }
  } catch (e) {
    console.error("ops-monitor ticker check 실패:", e)
  }

  // 2b) 뉴스 스캐너(기사 초안) 정지 — VPS /opt/news-scanner 15분 주기.
  //     ⚠️ "cron 이 돈다 ≠ 파이프라인이 산다": 7-25 커뮤 크롤 정전은 cron 은 매시간
  //     돌면서 스크립트만 4일간 죽어 있었고 아무 알림이 없었다. 그래서 프로세스가
  //     아니라 **산출물(reservoir 신선도)** 을 본다. 자동발행까지 물려 있는 지금은
  //     여기가 조용히 죽으면 사이트 콘텐츠가 조용히 마른다.
  try {
    const { data: last } = await supabase
      .from("news_reservoir")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string | null }>()
    const ageH = last?.created_at
      ? (Date.now() - new Date(last.created_at).getTime()) / H
      : Infinity
    if (ageH > 3) {
      issues.push({
        name: "📰 뉴스 스캐너 정지 의심",
        value:
          `새 기사 수집이 ${Number.isFinite(ageH) ? `${Math.round(ageH)}시간` : "무기한"} 없음 (평소 15분 주기). ` +
          `VPS cron 이 죽었거나 스크립트 에러 — ssh 후 \`tail /opt/news-scanner/cron.log\` 확인. ` +
          `이게 죽으면 뉴스 자동발행도 내보낼 초안이 없어 같이 멈춘다`,
      })
    }
  } catch (e) {
    console.error("ops-monitor news_reservoir check 실패:", e)
  }

  // 2b+) 브레이킹 방치 — 오피셜급 뉴스가 needs_human 으로 6시간 넘게 잠겨 있으면 경보.
  //      막히는 순간의 1회 알림(news-auto-publish alertBreakingHeld)을 놓쳤을 때의
  //      안전망 (P1-3, 비니시우스 실사고: 오피셜이 하루 넘게 조용히 잠겨 있었다).
  //      브레이킹은 48시간 뒤 만료되므로 6시간 경보면 손쓸 시간이 남아 있다.
  try {
    const { data: stuckRows } = await supabase
      .from("news_candidates")
      .select("candidate_id, last_reason_code, updated_at")
      .eq("state", "needs_human")
      .lt("updated_at", new Date(Date.now() - 6 * H).toISOString())
      .order("updated_at", { ascending: true })
      .limit(50)
    const ids = (stuckRows ?? []).map((r) => r.candidate_id as string)
    if (ids.length > 0) {
      // 이미 발행/반려된 후보는 지나간 일 — 아직 검수 큐에 살아 있는 것만 센다
      const { data: rvRows } = await supabase
        .from("news_reservoir")
        .select("id, draft, urls")
        .eq("status", "drafted")
        .in("id", ids)
      const byId = new Map((rvRows ?? []).map((r) => [r.id as string, r]))
      const breaking = (stuckRows ?? []).filter((c) => {
        const rv = byId.get(c.candidate_id as string) as
          | {
              draft?: { title?: string; original?: { title?: string } } | null
              urls?: { source?: string | null } | null
            }
          | undefined
        if (!rv) return false
        return isBreakingNewsItem({
          draftTitle: rv.draft?.title ?? null,
          originalTitle: rv.draft?.original?.title ?? null,
          sourceUrl: rv.urls?.source ?? null,
        })
      })
      if (breaking.length > 0) {
        const oldest = breaking[0]
        const ageH = Math.round((Date.now() - new Date(oldest.updated_at as string).getTime()) / H)
        issues.push({
          name: "🚨 브레이킹 방치",
          value:
            `오피셜급 ${breaking.length}건이 검수 대기(needs_human)로 잠겨 있음 — 최장 ${ageH}시간. ` +
            `사유: ${breaking
              .slice(0, 3)
              .map((c) => (c.last_reason_code as string | null) ?? "?")
              .join(", ")}. ` +
            `/admin/news-review 에서 발행·반려할 것 (브레이킹은 48시간 뒤 만료)`,
        })
      }
    }
  } catch (e) {
    console.error("ops-monitor breaking stuck check 실패:", e)
  }

  // 2c) 커뮤 크롤(떡밥 초안) 정지 — VPS 매시 :20. 새벽엔 원소스가 조용할 수 있어
  //     임계값을 6시간으로 넉넉히 — 오탐으로 도배되면 진짜 알림도 무시된다.
  try {
    const { data: last } = await supabase
      .from("agg_reservoir")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ created_at: string | null }>()
    const ageH = last?.created_at
      ? (Date.now() - new Date(last.created_at).getTime()) / H
      : Infinity
    if (ageH > 6) {
      issues.push({
        name: "🍿 커뮤 크롤 정지 의심",
        value:
          `새 떡밥 수집이 ${Number.isFinite(ageH) ? `${Math.round(ageH)}시간` : "무기한"} 없음 (평소 매시 :20). ` +
          `ssh 후 \`tail /var/log/agg-cycle.log\` 확인 — 7-25 처럼 cron 은 돌아도 ` +
          `스크립트가 죽어 있을 수 있다(그땐 설정 파일 BOM 이 원인이었다)`,
      })
    }
  } catch (e) {
    console.error("ops-monitor agg_reservoir check 실패:", e)
  }

  // 3) 미정산 고아 — 경기 결과 확정 + 종료 1시간 경과인데 pending
  try {
    const cutoff = new Date(Date.now() - H).toISOString()
    const { count } = await supabase
      .from("betman_predictions")
      .select("id, betman_games!inner(result, match_time)", { count: "exact", head: true })
      .eq("status", "pending")
      .not("betman_games.result", "is", null)
      .lt("betman_games.match_time", cutoff)
    if ((count ?? 0) > 0) {
      issues.push({
        name: "💸 미정산(고아) 예측",
        value: `${count}건 — 경기 끝났는데 pending. settle-pending 점검 필요`,
      })
    }
  } catch (e) {
    console.error("ops-monitor orphan check 실패:", e)
  }

  // ── 돈 정합성 (2026-07-28 추가) ─────────────────────────────────────────
  // 볼 차감 → 슬립 → 예측 3단계에 트랜잭션 경계가 없다. 보상 로직(환불 재시도 + 큐)이
  // 실제로 동작해 슬립 1,419건 동안 관측된 피해는 0건이었지만, 트래픽이 늘면 달라질 수
  // 있다. 구조를 바꾸는 대신 새는 순간 바로 알 수 있게 감시만 둔다.
  // 판정 근거는 docs/refactor/risk-map.md #2 와 그 조사 결과.

  // 4) 미해결 환불 큐 — 자동 환불이 3회 재시도 후에도 실패해 사람이 처리해야 하는 건
  try {
    const { count } = await supabase
      .from("pending_refunds")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
    if ((count ?? 0) > 0) {
      issues.push({
        name: "💰 미해결 환불 큐",
        value: `${count}건 — 자동 환불 실패분. /admin/operations 에서 수동 처리 필요`,
      })
    }
  } catch (e) {
    console.error("ops-monitor pending_refunds check 실패:", e)
  }

  // 5) 고아 슬립 — 볼은 빠졌는데 예측이 안 달린 슬립.
  //    시드 더미(dummy_*)와 이벤트 슬립은 제외하고, 환불/삭제 유예를 위해 1시간 지난 것만.
  try {
    const cutoff = new Date(Date.now() - H).toISOString()
    const { data: recentSlips } = await supabase
      .from("prediction_slips")
      .select("id, user_id")
      .is("event_id", null)
      .lt("created_at", cutoff)
      .gt("created_at", new Date(Date.now() - 24 * H).toISOString())
    const realSlips = (recentSlips ?? []).filter((s) => !s.user_id?.startsWith("dummy"))
    if (realSlips.length > 0) {
      const { data: withPreds } = await supabase
        .from("betman_predictions")
        .select("slip_id")
        .in(
          "slip_id",
          realSlips.map((s) => s.id)
        )
      const linked = new Set((withPreds ?? []).map((p) => p.slip_id))
      const orphans = realSlips.filter((s) => !linked.has(s.id))
      if (orphans.length > 0) {
        issues.push({
          name: "🧾 고아 슬립",
          value: `최근 24시간 ${orphans.length}건 — 볼은 빠졌는데 예측 미저장. 환불 여부 확인 필요`,
        })
      }
    }
  } catch (e) {
    console.error("ops-monitor orphan slip check 실패:", e)
  }

  // 6) locked_odds 누락 — 정산 시 경기 배당으로 폴백되지만, 경기 행이 지워지면 0점이 된다
  try {
    const { count } = await supabase
      .from("betman_predictions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .or("locked_odds.is.null,locked_odds.eq.0")
    if ((count ?? 0) > 0) {
      issues.push({
        name: "🎲 배당 미기록 예측",
        value: `${count}건 — locked_odds 없음. 정산 시 경기 배당 폴백에 의존`,
      })
    }
  } catch (e) {
    console.error("ops-monitor locked_odds check 실패:", e)
  }

  // 7) 불변식 감사관 심박 — 감사관(invariant-audit)은 모든 크론의 심박을 감시하지만
  //    자기가 죽으면 보고할 수 없다 (감사관 함정). 그래서 ops-monitor 가 감사관을,
  //    감사관이 나머지를 본다 — 상호 감시 한 쌍. 매시 :44 주기라 3시간이면 3회 결번.
  //    "기록이 아예 없음"은 첫 배포 직후의 정상 상태일 수 있어 stale 만 경보한다.
  try {
    const { data: audit } = await supabase
      .from("cron_run_log")
      .select("started_at")
      .eq("job_name", "invariant-audit")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ started_at: string | null }>()
    if (audit?.started_at) {
      const ageH = (Date.now() - new Date(audit.started_at).getTime()) / H
      if (ageH > 3) {
        issues.push({
          name: "🧿 불변식 감사관 정지",
          value: `invariant-audit 마지막 실행 ${Math.round(ageH)}시간 전 (평소 매시 :44) — 2층 감사가 꺼져 있음`,
        })
      }
    }
  } catch (e) {
    console.error("ops-monitor invariant-audit check 실패:", e)
  }

  // 8) LFA 크레딧 — **남은 일수**로 본다 (2026-08-24 비용 감사).
  //    종전 경보는 클라이언트의 고정 임계값("잔여 20,000")이었는데, 소모율을 모르면
  //    그게 한 달 치인지 이틀 치인지 알 수 없다. 8/23 소진 사고가 아무 신호 없이
  //    일어난 것도 그래서다. 이제 lfa_usage_log 가 실측 소모율을 들고 있으므로
  //    "이 속도면 며칠" 을 계산해 알린다 — 충전은 사람이 하는 일이라 며칠 전에 알아야 한다.
  try {
    // ⚠️ 구간 전체를 받아 양 끝을 고르면 안 된다 — 하루 1,000~3,000행이라 어떤 limit 을
    //    걸어도 언젠가 잘리고, 오름차순으로 잘리면 "최신 잔여" 가 옛날 값이 된다.
    //    필요한 건 딱 두 행(구간의 처음과 끝)이므로 각각 1행씩 집어 온다.
    const since = new Date(Date.now() - 48 * H).toISOString()
    const pick = (asc: boolean) =>
      supabase
        .from("lfa_usage_log")
        .select("called_at, credits_remaining")
        .gte("called_at", since)
        .not("credits_remaining", "is", null)
        .order("called_at", { ascending: asc })
        .limit(1)
        .maybeSingle<{ called_at: string; credits_remaining: number }>()
    const [{ data: first }, { data: last }] = await Promise.all([pick(true), pick(false)])

    if (first && last) {
      const spanH = (new Date(last.called_at).getTime() - new Date(first.called_at).getTime()) / H
      const used = first.credits_remaining - last.credits_remaining
      // 충전이 구간에 끼면 used 가 음수다 — 그 구간은 소모율을 못 낸다.
      // 창이 48시간이라 충전 후 이틀이면 다시 계산된다 (7일이면 일주일간 감시가 죽는다).
      if (spanH >= 6 && used > 0) {
        const perDay = (used / spanH) * 24
        const days = last.credits_remaining / perDay
        if (days < 21) {
          issues.push({
            name: "⚽ 축구 API 크레딧 소진 임박",
            value:
              `잔여 ${last.credits_remaining.toLocaleString()} · 최근 ${Math.round(spanH)}시간 실측 ` +
              `하루 ${Math.round(perDay).toLocaleString()} → **약 ${Math.floor(days)}일 남음**. ` +
              `바닥나면 라인업·라이브 스코어·불판이 전부 멈춥니다.`,
          })
        }
      }
    }
  } catch (e) {
    console.error("ops-monitor lfa credit check 실패:", e)
  }

  // 9) LFA 소모 **속도 급변** (2026-08-25 크롤러 화재).
  //    §8 의 "남은 일수" 경보는 이 화재 때 정상 동작했다 — 오후 내내 "약 11일 남음" 을
  //    울리고 있었다. 그런데 잔여가 22만이라 그 문구가 급해 보이지 않았고, 평소의 32배로
  //    타고 있다는 사실이 어디에도 안 나왔다. 잔여가 많을수록 "일수" 는 둔해진다 —
  //    바닥이 며칠 남았는지보다 **갑자기 빨라진 것 자체**가 사고 신호다.
  try {
    const rate = async (fromH: number, toH: number): Promise<number | null> => {
      const { count } = await supabase
        .from("lfa_usage_log")
        .select("id", { count: "exact", head: true })
        .gte("called_at", new Date(Date.now() - fromH * H).toISOString())
        .lt("called_at", new Date(Date.now() - toH * H).toISOString())
      return count == null ? null : count / (fromH - toH)
    }
    // 직전 2시간 vs 그 앞 24시간 — 크롤 유입은 몇 분 안에 몇백 배로 뛴다.
    // ⚠️ 이건 **시작을 잡는** 경보다. 화재가 하루를 넘기면 비교 기준(24시간)이 화재로
    //    오염돼 배율이 떨어지고 조용해진다 — 그때부터는 §8 의 남은 일수가 받는다.
    //    실측 검증: 이번 화재 발생 2시간 뒤 시점이면 957/h vs 23/h = 41배로 울린다
    //    (실제로는 09:00 UTC 까지 시간당 8~48건이었다).
    const [recent, baseline] = await Promise.all([rate(2, 0), rate(26, 2)])
    if (recent != null && baseline != null && baseline >= 5 && recent >= 5 * baseline) {
      issues.push({
        name: "🚨 축구 API 호출 급증",
        value:
          `최근 2시간 시간당 ${Math.round(recent).toLocaleString()}건 · ` +
          `평소 ${Math.round(baseline).toLocaleString()}건 → **${Math.round(recent / baseline)}배**. ` +
          `유료 호출이라 방치하면 팩이 며칠 만에 바닥납니다. ` +
          `크롤러가 새 파라미터를 걸어 들어왔는지부터 보세요 (lfa_day_cache 의 date_utc 분포).`,
      })
    }
  } catch (e) {
    console.error("ops-monitor lfa rate check 실패:", e)
  }

  if (issues.length > 0) {
    await notifyDiscordOps({
      level: "alert",
      title: "⚠️ 운영 점검 필요",
      description: "자동 점검에서 이상이 감지됐어요. (30분마다 재확인)",
      url: `${SITE}/admin/operations`,
      fields: issues,
    })
  }

  return NextResponse.json({ ok: true, issues: issues.length, detail: issues })
}

// Vercel cron 은 GET 호출 (CRON_SECRET 헤더 동일 검증)
// 감시자 자신도 감시 대상 — cron_run_log 기록 (2026-08-06, gauntlet R16 / 단계 0-4)
export const GET = withCronLog("ops-monitor", (req: NextRequest) => POST(req))
