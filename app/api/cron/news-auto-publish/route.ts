import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import {
  publishNewsDraft,
  isContentFreeDraft,
  NEWS_BOT_USER_ID,
  type NewsReservoirItem,
} from "@/lib/news/publish"
import { rehostExternalImage } from "@/lib/images/rehost"
import { canonicalSourceUrl } from "@/lib/news/canonical-url"
import {
  inspectDraft,
  inspectImage,
  unknownPlayerNames,
  PERSONAL_BLOG_RE,
  isWomensFootball,
} from "@/lib/news/quality-gate"
import { UNKNOWN_PLAYER_PREFIX } from "@/lib/news/alias-suggest"
import { resolveUnknownPlayersViaNaver } from "@/lib/news/naming-verify-loop"
import { NAMING_CATEGORIES } from "@/lib/news/naming-normalize"
import { fetchDictionaryRows } from "@/lib/news/dictionary-fetch"
import { requeueDraftsUnblockedByDictionary } from "@/lib/news/dictionary-recheck"
import {
  isBreakingNewsItem,
  isRetryableGateReasons,
  corroborateOfficialViaNaver,
  findClubInTitle,
} from "@/lib/news/breaking"
import { stripUnevidencedAmounts } from "@/lib/news/amount-evidence"
import { naverNewsCount } from "@/lib/naming/verify"
import { notifyDiscordOps } from "@/lib/discord-notify"
import {
  newsCandidateRunId,
  recordNewsCandidateEvents,
  type NewsCandidateEvent,
  type NewsCandidateState,
} from "@/lib/news/candidate-ledger"
import { titleSimilarity } from "@/lib/saga/cluster"

export const dynamic = "force-dynamic"

/**
 * 뉴스 자동발행 cron (30분 주기) — 검수 없이 나가는 유일한 경로라 조건이 문이다.
 *
 * 게이트 (운영자 승인 2026-07-29):
 *   1. 시각 자료(이미지/임베드) 있는 초안만 — "사진 없음(떡밥 제외)" 기준과 동일
 *   2. 24시간 이내 초안만 — 뉴스는 시의성이 생명 (오래된 건 24h 자동반려가 처리)
 *   3. 회당 상한 — 몰아서 발행하지 않고 하루에 걸쳐 분산
 *   (일일 총량·자동 상한은 2026-08-04 운영자 "무제한" 지시로 제거 — 품질 게이트가 문)
 *
 * 끄기: Vercel env NEWS_AUTO_PUBLISH=off (배포 없이 즉시).
 * 자동발행분은 reservoir publish.auto=true 로 표시 — 사후 구분·회수용.
 * 검수 편집이 없으므로 교정 학습은 안 태운다 — 발행 후 운영자가 글을 고치면
 * 배치 학습기(hermes learn-news-edits, 매일 21시)가 diff 로 줍는다.
 */

/** 회당 발행 상한 — 유일하게 남은 페이싱 장치. 일일 상한(총 20·자동 10)은 2026-08-04
 *  운영자 "무제한으로" 지시로 제거 — 30분 주기 × 2건 = 이론 최대 96건/일이 실공급
 *  (이미지 초안 ~80건/일)을 웃돌아 사실상 무제한이면서 몰아치기만 막는다 */
const PER_RUN_CAP = 2
/** 초안 신선도 (시간) */
const MAX_AGE_HOURS = 24
/**
 * 회차마다 훑는 초안 수. 30이었는데 실제 대기열이 90~100건이라 **창 밖 후보는 조회조차
 * 되지 않았다** — 2026-08-05 실측: 만료된 30건 전부가 자동발행에게 한 번도 스캔되지 않은
 * 채 24시간을 넘겨 죽었고, 검사관까지 간 건 0건이었다. 품질 때문에 떨어진 게 아니라
 * 쳐다보지도 못한 것이다(BBC 비니시우스 기사 사례).
 * 스캔은 대부분 LLM 없는 값싼 필터라 창을 넓히는 비용은 조회 1회뿐이다.
 */
const DRAFT_WINDOW = 120
/**
 * 만료까지 이만큼 남으면 '임박'으로 보고 먼저 처리한다. 회차 주기가 30분이라 4시간이면
 * 8번의 기회가 남은 셈 — 이보다 짧게 잡으면 이미 늦고, 길게 잡으면 큐 전체가 임박군이
 * 되어 신선도 우선이 무의미해진다.
 */
const EXPIRY_SOON_HOURS = 4
/** 오피셜(브레이킹) 기본 이미지 — 원문 무이미지 시 붙여서 발행 (2026-08-08 오너 위임) */
const OFFICIAL_FALLBACK_IMAGE = "/images/news-official-default.png"

function kstMidnightUtcIso(): string {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  return new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString()
}

async function run(request: NextRequest) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  // ⚠️ 2026-07-30 운영자 정지 — 기본값을 꺼짐으로 뒤집음 (opt-in).
  // 사유: 무검수 발행분에서 오타·영어 미번역·이미지 없는 글이 그대로 나감.
  // 검수(빠른검수 화면)가 품질 게이트였는데 자동발행이 그걸 우회한 것.
  // 재개 조건: 발행 전 품질 게이트(LLM 한국어/오타 검사 + 실제 이미지 필수)를
  // 붙인 뒤 Vercel env NEWS_AUTO_PUBLISH=on 으로만 재개.
  if (process.env.NEWS_AUTO_PUBLISH !== "on") {
    return NextResponse.json({
      ok: true,
      skipped: "자동발행 정지 (opt-in — env NEWS_AUTO_PUBLISH=on 필요)",
    })
  }

  const supabase = createServiceRoleClient()
  const ledgerRunId = newsCandidateRunId("news-auto-publish")

  // 오늘 발행량 집계 — 상한 아님, 응답 리포트용 (디스코드/로그에서 하루 흐름 관찰).
  // 자동분은 publish.published_at 기준: updated_at 은 학습 배치(edit-learner)의 audit
  // 갱신에도 튀어서 집계가 왜곡된다 (2026-08-04 실측).
  const { count: publishedToday } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", NEWS_BOT_USER_ID)
    .gte("created_at", kstMidnightUtcIso())
  const { count: autoToday } = await supabase
    .from("news_reservoir")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .contains("publish", { auto: true })
    .gte("publish->>published_at", kstMidnightUtcIso())

  const freshCutoff = new Date(Date.now() - MAX_AGE_HOURS * 3600 * 1000).toISOString()
  const { data: drafts, error } = await supabase
    .from("news_reservoir")
    .select("id, status, urls, draft, raw, entities, tags, decision, created_at")
    .eq("status", "drafted")
    .gte("created_at", freshCutoff)
    .order("created_at", { ascending: false }) // 최신 우선 — 뉴스는 신선한 것부터
    .limit(DRAFT_WINDOW)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 창만 넓혀서는 부족하다. 회당 발행 상한에서 break 하므로 최신순으로만 훑으면
  // 뒤쪽(오래된 것)은 매 회차 밀리다가 그대로 만료된다 — 실측된 손실이 정확히 이 모양이다.
  // 그래서 **만료 임박분을 먼저** 처리한다. 임박군 안에서는 진짜 곧 죽는 것부터(오래된 순),
  // 그 밖에서는 기존대로 최신 우선(뉴스 신선도)을 유지한다.
  const urgentCutoff = Date.now() - (MAX_AGE_HOURS - EXPIRY_SOON_HOURS) * 3600 * 1000
  const at = (row: { created_at: string }) => new Date(row.created_at).getTime()
  const queue = [
    ...((drafts ?? []) as (NewsReservoirItem & {
      status: string
      decision: Record<string, unknown> | null
      created_at: string
      /** 원문 스냅샷 — 금액 증거 검사(오피셜)용 (2026-08-08) */
      raw: { source_text?: string } | null
    })[]),
  ].sort((a, b) => {
    const [ua, ub] = [at(a) <= urgentCutoff, at(b) <= urgentCutoff]
    if (ua !== ub) return ua ? -1 : 1
    return ua ? at(a) - at(b) : at(b) - at(a)
  })

  // 표기 사전 (선수 + 감독) — 미등재 인물명 기사는 자동발행 제외 (환각 음차 차단)
  // id·romanized·surfaces 는 검증 루프의 "기존 항목 흡수" 판정용 (비니시우스 실사고)
  // ⚠️ 전량 조회 필수 — 1,000행 무음 절단에 걸리면 사전에 있는 이름이 '미등재'로
  // 판정돼 멀쩡한 기사가 반려된다 (사전은 자동 등재로 매일 자란다)
  const dict = await fetchDictionaryRows<{
    id: string
    preferred_ko: string
    hangul_alts: string[] | null
    romanized: string | null
    surfaces: string[] | null
  }>(supabase, "id, preferred_ko, hangul_alts, romanized, surfaces", NAMING_CATEGORIES).catch(
    () => null
  )

  // 발행 전 표기 검증 루프의 런 단위 캐시 — 같은 이름을 기사마다 재검증하지 않는다
  const namingCache = new Map<string, { preferred: string } | "unknown" | "infra">()
  let namingRegistered = 0
  // 브레이킹 자가 재평가 상한 (P0-2) — 게이트 재실행은 LLM 비용이라 회당 제한
  const BREAKING_RETRY_CAP = 3
  let breakingRetries = 0

  // 오피셜 웹 대조용 클럽 한글 표기 (팀 사전 — 제목에서 클럽 찾기)
  const { data: clubRows } = await supabase.from("team_dictionary").select("name_kr, aliases_kr")
  const clubNamesKr = (
    (clubRows ?? []) as { name_kr: string | null; aliases_kr: string[] | null }[]
  )
    .flatMap((c) => [c.name_kr, ...(c.aliases_kr ?? [])])
    .filter((n): n is string => !!n)
    .map((name) => ({ name }))

  // 중복 차단 재료 — 최근 48시간 발행 제목 + 원문 URL (실사고 2026-08-04: 레딧에 같은
  // 소식이 여러 개 올라와 '헨더슨 첼시 합류'가 3번 발행됨 / 2026-08-06: 같은 가디언
  // 원문의 초안 3벌 중 제목을 바꿔 쓴 1벌이 유사도 0.40 으로 제목 게이트를 빠져나가
  // 같은 기사가 2번 발행됨 — 같은 URL 은 제목이 아무리 달라도 같은 기사다)
  const { data: recentPosts } = await supabase
    .from("posts")
    .select("title, source_url")
    .eq("user_id", NEWS_BOT_USER_ID)
    .is("deleted_at", null)
    .gte("created_at", new Date(Date.now() - 48 * 3600 * 1000).toISOString())
  const recentTitles = (recentPosts ?? []).map((p) => p.title as string)
  const recentUrls = new Set(
    (recentPosts ?? [])
      .map((p) => p.source_url as string | null)
      .filter((u): u is string => Boolean(u))
      .map(canonicalSourceUrl)
  )

  // 이미 원장에 같은 판정이 찍힌 후보는 재기록하지 않는다 (2026-08-05 실측: 24시간
  // 이벤트 744건 중 601건이 정체 후보 52개의 needs_human 재기록 — 11~12회/후보).
  // 매 회차 같은 30건 window 를 다시 스캔하므로 상태가 안 변한 후보는 계속 다시 찍혔다.
  // "아무 일도 안 일어났다"는 append-only 감사의 기록 대상이 아니다 — 정체는 상태
  // (news_candidates.state + updated_at)로 보고, 회차별 집계는 cron 응답으로 본다.
  const draftIds = queue.map((row) => row.id)
  const { data: knownStates } = draftIds.length
    ? await supabase
        .from("news_candidates")
        .select("candidate_id, state, last_reason_code")
        .in("candidate_id", draftIds)
    : { data: [] as { candidate_id: string; state: string; last_reason_code: string | null }[] }
  const lastVerdict = new Map(
    (knownStates ?? []).map((row) => [
      row.candidate_id,
      `${row.state}:${row.last_reason_code ?? ""}`,
    ])
  )

  const budget = PER_RUN_CAP
  let published = 0
  let ledgerHealthy = true
  const publishedIds: string[] = []
  const gated: string[] = []
  const errors: string[] = []
  const skipped: string[] = []
  const skipCounts: Record<string, number> = {}
  let repeatedVerdicts = 0
  const ledgerEvents: NewsCandidateEvent[] = []

  // ── 브레이킹 판별 메모 (개선 P0, 2026-08-07 비니시우스 실사고) ──
  const rowById = new Map(queue.map((r) => [r.id, r]))
  const breakingMemo = new Map<string, boolean>()
  const isBreaking = (id: string): boolean => {
    const memo = breakingMemo.get(id)
    if (memo !== undefined) return memo
    const row = rowById.get(id)
    const v = row
      ? isBreakingNewsItem({
          draftTitle: row.draft?.title ?? null,
          originalTitle: row.draft?.original?.title ?? null,
          sourceUrl: row.urls?.source ?? null,
        })
      : false
    breakingMemo.set(id, v)
    return v
  }
  // P0-1: 브레이킹이 검수 큐로 떨어지는 순간 알림 — 상태 전이 시 1회만 (반복 억제 공유)
  const alertBreakingHeld = (id: string, reason: string) => {
    if (!isBreaking(id)) return
    const row = rowById.get(id)
    notifyDiscordOps({
      title: `브레이킹 막힘 — ${reason}`,
      description: `${row?.draft?.title?.slice(0, 120) ?? id}\n오피셜급 뉴스가 자동발행되지 못하고 검수 대기입니다.`,
      level: "alert",
      url: "/admin/news-review",
    }).catch(() => {})
  }

  const noteSkip = (id: string, reason: string, state: NewsCandidateState = "held") => {
    skipCounts[reason] = (skipCounts[reason] ?? 0) + 1
    skipped.push(`${id}: ${reason}`)
    if (lastVerdict.get(id) === `${state}:${reason}`) {
      repeatedVerdicts++
      return
    }
    if (state === "needs_human") alertBreakingHeld(id, reason)
    ledgerEvents.push({
      candidate_id: id,
      reservoir_id: id,
      to_state: state,
      actor: "news-auto-publish",
      reason_code: reason,
      run_id: ledgerRunId,
    })
  }

  for (const row of queue) {
    if (published >= budget) break

    const title = row.draft?.title?.trim()
    const content = sanitizeTipTapJSON(row.draft?.content)
    if (!title || !content) {
      noteSkip(row.id, "invalid_draft")
      continue
    }
    // 개인 블로그·뉴스레터 출처는 자동발행 금지 (2026-08-04 Substack 실사고)
    if (row.urls?.source && PERSONAL_BLOG_RE.test(row.urls.source)) {
      noteSkip(row.id, "personal_blog")
      continue
    }
    // 여자 축구 — 서비스 커버리지 밖 (운영자 확정 2026-08-04). 관심도 필터가 1차
    // 반려하지만 필터 사이클 전에 발행되는 걸 막는 이중 방어. 한국어 번역 제목에선
    // 성별 표기가 지워지는 실사고(몰리 바트립 — 구단 URL 에만 women 표기)가 있어
    // **출처 URL·영문 원제까지** 함께 검사한다.
    if (isWomensFootball(title, row.urls?.source, row.draft?.original?.title)) {
      noteSkip(row.id, "womens_football")
      continue
    }
    // 실제 이미지 필수 (2026-07-30 강화) — 기존 hasVisualContent 는 X/유튜브 임베드도
    // 통과시켜 "이미지 파일 없는 글"이 자동으로 나갔다. 임베드-온리 글은 사람 검수로만.
    // 예외 (2026-08-08 오너 위임 결정): **브레이킹(오피셜)은 기본 이미지를 붙여 발행** —
    // 구단 공식 발표는 원문에 이미지가 없는 경우가 흔한데(비니시우스 실사고: 가장 큰
    // 뉴스가 no_image 무덤행), 오피셜은 사실 오류 위험이 가장 낮은 등급이다.
    let workingContent = content
    let firstImage = extractFirstImageSrcFromTipTapJSON(content)
    let usedFallbackImage = false
    if (!firstImage) {
      if (isBreaking(row.id)) {
        const doc = workingContent as { type?: string; content?: unknown[] }
        workingContent = {
          ...doc,
          content: [
            { type: "image", attrs: { src: OFFICIAL_FALLBACK_IMAGE, alt: "공식 발표" } },
            ...(doc.content ?? []),
          ],
        } as typeof content
        firstImage = OFFICIAL_FALLBACK_IMAGE
        usedFallbackImage = true
      } else {
        noteSkip(row.id, "no_image", "needs_human")
        continue
      }
    }
    // 무내용 초안 차단 (2026-07-30) — 원문 0자로 생성돼 "세부 사항은 기사에서 확인"류
    // 필러만 있는 글 (hermes-reddit-1vank7k 사례). 80자 미만·자기지시 문구 = 자동발행 금지.
    if (isContentFreeDraft(content)) {
      noteSkip(row.id, "content_free")
      continue
    }

    // 검사관 불통과 이력 → 재검사 안 함 (사람 검수 대기 중 — 비용·루프 방지)
    // 예외 (P0-2, 비니시우스 실사고): **브레이킹**은 해소 가능한 사유(사전 미등재)에
    // 한해 매 사이클 재평가 — 사전이 등재되는 순간 스스로 살아난다. 회당 3건 상한.
    const priorGate = (row.decision?.auto_gate ?? null) as {
      pass?: boolean
      reasons?: unknown
    } | null
    if (priorGate?.pass === false) {
      const selfHealEligible =
        breakingRetries < BREAKING_RETRY_CAP &&
        isBreaking(row.id) &&
        isRetryableGateReasons(priorGate.reasons)
      if (!selfHealEligible) {
        noteSkip(row.id, "prior_gate_rejected", "needs_human")
        continue
      }
      breakingRetries++
      // fall through — 게이트 전체 재실행 (표기 루프가 사전·흡수로 해소 시도)
    }

    // 중복 차단 1 — **같은 원문 URL 은 제목이 아무리 달라도 같은 기사다** (결정론, 최우선).
    // 2026-08-06 실사고: 같은 가디언 원문의 초안 3벌 중 표현을 바꿔 쓴 1벌이 제목
    // 유사도(0.40 < 0.5)를 빠져나가 같은 기사가 11초 간격으로 2번 발행됐다.
    const srcCanonical = row.urls?.source ? canonicalSourceUrl(row.urls.source) : null
    if (srcCanonical && recentUrls.has(srcCanonical)) {
      const { error: gateWriteError } = await supabase
        .from("news_reservoir")
        .update({
          decision: {
            ...(row.decision ?? {}),
            auto_gate: {
              pass: false,
              reasons: [`중복 기사 (동일 원문 URL 기발행)`],
              at: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      if (gateWriteError) {
        errors.push(`${row.id}: URL 중복 게이트 기록 실패 — ${gateWriteError.message}`)
        ledgerEvents.push({
          candidate_id: row.id,
          reservoir_id: row.id,
          to_state: "retry_wait",
          actor: "news-auto-publish",
          reason_code: "duplicate_gate_write_failed",
          details: { error: gateWriteError.message },
          run_id: ledgerRunId,
        })
      } else {
        ledgerEvents.push({
          candidate_id: row.id,
          reservoir_id: row.id,
          to_state: "duplicate",
          actor: "news-auto-publish",
          reason_code: "same_source_url",
          details: { url: srcCanonical },
          run_id: ledgerRunId,
        })
      }
      gated.push(`${row.id}: URL 중복`)
      continue
    }

    // 중복 차단 2 — 최근 발행 기사와 제목이 비슷하면 같은 소식의 재탕 (다른 URL 대비)
    const dup = recentTitles.find((t) => titleSimilarity(t, title) >= 0.5)
    if (dup) {
      const { error: gateWriteError } = await supabase
        .from("news_reservoir")
        .update({
          decision: {
            ...(row.decision ?? {}),
            auto_gate: {
              pass: false,
              reasons: [`중복 기사 (기발행: ${dup.slice(0, 40)})`],
              at: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      if (gateWriteError) {
        errors.push(`${row.id}: 중복 게이트 기록 실패 — ${gateWriteError.message}`)
        ledgerEvents.push({
          candidate_id: row.id,
          reservoir_id: row.id,
          to_state: "retry_wait",
          actor: "news-auto-publish",
          reason_code: "duplicate_gate_write_failed",
          details: { error: gateWriteError.message },
          run_id: ledgerRunId,
        })
      } else {
        ledgerEvents.push({
          candidate_id: row.id,
          reservoir_id: row.id,
          to_state: "duplicate",
          actor: "news-auto-publish",
          reason_code: "recent_title_match",
          details: { matched_title: dup.slice(0, 120) },
          run_id: ledgerRunId,
        })
      }
      gated.push(`${row.id}: 중복`)
      continue
    }

    // 루머 티어 + 이적 맥락 차단은 2026-08-04 운영자 확정으로 **제거**했다
    // ("오보 어차피 루머니까 상관 없어"). 여름 이적시장엔 축구 기사 대부분이 이적
    // 루머라 이 규칙 하나가 큐의 46%(67건 중 31건)를 잡아먹고 있었다.
    // 남은 문: 검사관(본문·이미지)·표기 사전·중복·개인 블로그·여자 축구.
    // 사가 쪽 D7(미확정 루머 noindex + 배너)은 그대로 유효하다.

    // 품질 검사관 (작성과 별도 LLM) — fail-closed, 불통과는 사유와 함께 강등.
    // ⚠️ 이 전이만 즉시 기록한다. publishNewsDraft 가 발행 성공 시 published 를 자체
    // flush 하므로, 여기서 배치 배열에 담으면 run 끝 flush 가 published 를 덮어
    // 발행된 후보가 fact_checking 으로 남는다 (2026-08-05 실측 8건). 순서를 지키려면
    // "검사 시작"은 검사 전에 원장에 닿아야 한다 — 진행 중 상태의 의미와도 맞다.
    ledgerHealthy =
      (await recordNewsCandidateEvents(supabase, [
        {
          candidate_id: row.id,
          reservoir_id: row.id,
          to_state: "fact_checking",
          actor: "news-auto-publish",
          reason_code: "quality_gate_started",
          run_id: ledgerRunId,
        },
      ])) && ledgerHealthy
    const verdict = await inspectDraft(title, content)
    let failReasons = verdict.pass ? [] : verdict.reasons
    if (verdict.pass) {
      // ── 발행 전 표기 검증 루프 (2026-08-07 운영자: "루프 다 돌고 무결 검증 후 발행") ──
      // 미등재 이름을 곧장 보류하지 않고 네이버 검증 루프를 먼저 돈다. 승자가 나오면
      // 사전에 등재되고(기사 표기는 alt), 발행 초크의 사전 치환이 본문을 대표 표기로
      // 정리한 뒤 발행된다. 근거 없는 이름만 기존대로 보류(사람 검수).
      //
      // 선수와 감독을 같은 루프에 태우되 **등재 category 만** 가른다. 2026-08-09 실사고:
      // 감독이 검사관 추출 단계에서 빠져 이 루프에 들어오지도 못했고, 그 결과
      // 'Xabi Alonso → 하비 알론소'(정: 사비)가 3건 발행됐다. category 를 가르는 이유는
      // 감독을 player 로 등재하는 것이 무인 사서를 폐지시킨 바로 그 오염이기 때문이다.
      const stillUnknown: string[] = []
      let infraBlocked = false
      for (const { names, category } of [
        { names: verdict.playerNamesKr, category: "player" as const },
        { names: verdict.coachNamesKr, category: "coach" as const },
      ]) {
        if (names.length === 0) continue
        const unknown = unknownPlayerNames(names, dict ?? [])
        if (unknown.length === 0) continue
        const loop = await resolveUnknownPlayersViaNaver(
          supabase,
          unknown,
          title,
          namingCache,
          dict ?? [],
          category
        )
        if (loop.registered.length > 0) {
          namingRegistered += loop.registered.length
          // 이번 런의 뒷 기사들이 같은 이름에 다시 막히지 않도록 사전 캐시 갱신
          for (const r of loop.registered) {
            dict?.push({
              id: `runtime_${namingRegistered}`,
              preferred_ko: r.preferred,
              hangul_alts: r.name !== r.preferred ? [r.name] : [],
              romanized: null,
              surfaces: null,
            })
          }
        }
        if (loop.infraFailed.length > 0) infraBlocked = true
        stillUnknown.push(...loop.stillUnknown)
      }
      if (infraBlocked && stillUnknown.length === 0) {
        // 검증 자체를 못 했다(네이버 미가동 등) — 판정이 아니므로 낙인 없이 다음 회차 재시도
        noteSkip(row.id, "naming_check_unavailable", "retry_wait")
        continue
      }
      if (stillUnknown.length > 0) {
        // 접두사는 상수 — 사전 후보 화면이 이 문자열을 파싱해 1클릭 등재를 제안한다
        failReasons = [`${UNKNOWN_PLAYER_PREFIX}${stillUnknown.join(", ")}`]
      }
    }
    // 이미지 적합성 (vision) — 배너·로고·광고 이미지 차단 (Substack 실사고).
    // 우리가 붙인 기본 이미지는 검사하지 않는다 (자체 로고 카드 — 검사기가 '로고'로 반려함)
    if (failReasons.length === 0 && !usedFallbackImage) {
      const imgUrl = firstImage.startsWith("/") ? `https://gongnori.fan${firstImage}` : firstImage
      let img = await inspectImage(imgUrl)
      // 인프라 실패는 판정이 아니다 (2026-08-06 실측: 이미지 반려 7건 중 5건이 가디언
      // 계열 HTTP 400 — 원본 서버가 OpenAI 페처를 차단). 우리 스토리지로 복사한 사본으로
      // 한 번 더 검사한다 — 원본이 막혀도 사본은 열린다.
      if (!img.pass && img.infra && /^https?:\/\//i.test(firstImage)) {
        try {
          const rehosted = await rehostExternalImage(firstImage, NEWS_BOT_USER_ID)
          if (rehosted !== firstImage) {
            img = await inspectImage(
              rehosted.startsWith("/") ? `https://gongnori.fan${rehosted}` : rehosted
            )
          }
        } catch (e) {
          console.error("[news-auto-publish] 검사용 이미지 재호스팅 실패", row.id, e)
        }
      }
      if (!img.pass && img.infra) {
        // 여전히 검사 불가 — "부적합" 낙인(auto_gate) 없이 다음 회차 재시도.
        // 판정을 못 받은 기사가 사람 검수 무덤으로 떨어져 만료되는 것을 막는다.
        noteSkip(row.id, "image_check_unavailable", "retry_wait")
        continue
      }
      if (!img.pass) failReasons = [`이미지 부적합: ${img.reason}`]
    }
    if (failReasons.length > 0) {
      const { error: gateWriteError } = await supabase
        .from("news_reservoir")
        .update({
          decision: {
            ...(row.decision ?? {}),
            auto_gate: { pass: false, reasons: failReasons, at: new Date().toISOString() },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
      if (gateWriteError) {
        errors.push(`${row.id}: 품질 게이트 기록 실패 — ${gateWriteError.message}`)
        ledgerEvents.push({
          candidate_id: row.id,
          reservoir_id: row.id,
          to_state: "retry_wait",
          actor: "news-auto-publish",
          reason_code: "quality_gate_write_failed",
          details: { reasons: failReasons, error: gateWriteError.message },
          run_id: ledgerRunId,
        })
      } else {
        ledgerEvents.push({
          candidate_id: row.id,
          reservoir_id: row.id,
          to_state: "needs_human",
          actor: "news-auto-publish",
          reason_code: "quality_gate_rejected",
          details: { reasons: failReasons },
          run_id: ledgerRunId,
        })
        // P0-1: 브레이킹이 게이트에서 막히면 즉시 알림 (전이 시 1회 — lastVerdict 억제)
        if (lastVerdict.get(row.id) !== "needs_human:quality_gate_rejected") {
          alertBreakingHeld(row.id, failReasons[0] ?? "quality_gate_rejected")
        }
      }
      gated.push(`${row.id}: ${failReasons.join(" / ")}`)
      continue
    }

    // ── 오피셜 최종 관문 (2026-08-08 오너: "오피셜 웹 대조를 해야함 당연히" +
    //     "금액은 굳이 없으면 빼도 좋아 — 영입 오피셜 사실만 전해도 돼") ──
    let publishTitle = title
    if (isBreaking(row.id)) {
      const playerKr = verdict.playerNamesKr[0] ?? null
      if (playerKr) {
        const club = findClubInTitle(title, clubNamesKr)
        const cor = await corroborateOfficialViaNaver(playerKr, club, naverNewsCount)
        if (cor.verdict === "infra") {
          // 네이버 미가동 = 판정 아님 — 낙인 없이 다음 회차 재시도 (이미지 infra 규율)
          noteSkip(row.id, "official_check_unavailable", "retry_wait")
          continue
        }
        if (cor.verdict === "unverified") {
          // 한국 언론 실보도가 아직 없음 — 사실 오류(디오망데형) 또는 초속보.
          // 둘 다 사람이 봐야 한다 (noteSkip 이 브레이킹 알림까지 발화)
          noteSkip(row.id, "official_unverified", "needs_human")
          continue
        }
      }
      // 금액 증거: 원문에 없는 금액은 제목에서 제거 — 환산·창작 금액 게재 금지
      const sourceText = `${row.raw?.source_text ?? ""} ${row.draft?.original?.title ?? ""}`
      const strippedTitle = stripUnevidencedAmounts(title, sourceText)
      if (strippedTitle.removed.length > 0) {
        publishTitle = strippedTitle.title
        console.info(
          "[news-auto-publish] 근거 없는 금액 제거",
          row.id,
          strippedTitle.removed.join(" | ")
        )
      }
    }

    const result = await publishNewsDraft(supabase, row, {
      title: publishTitle,
      content: workingContent,
      auto: true,
    })
    if (result.error) {
      // 실패 항목은 drafted 로 남는다 — 다음 run 재시도 또는 수동 검수로 처리 가능
      errors.push(`${row.id}: ${result.error}`)
      ledgerEvents.push({
        candidate_id: row.id,
        reservoir_id: row.id,
        to_state: "retry_wait",
        actor: "news-auto-publish",
        reason_code: "publish_failed",
        details: { error: result.error },
        run_id: ledgerRunId,
      })
      continue
    }
    published++
    publishedIds.push(result.postId!)
    // 같은 run 안의 다음 후보도 방금 발행분과 중복 검사되도록 (제목 + 원문 URL)
    recentTitles.push(title)
    if (srcCanonical) recentUrls.add(srcCanonical)
  }

  if (skipped.length > 0 || gated.length > 0 || errors.length > 0) {
    console.info("[news-auto-publish] 처리 요약", {
      skipped: skipCounts,
      repeatedVerdicts,
      gated: gated.length,
      namingRegistered,
      errors,
    })
  }
  ledgerHealthy = (await recordNewsCandidateEvents(supabase, ledgerEvents)) && ledgerHealthy

  // 검증 루프가 이름을 등재했다면, 같은 이름에 막혀 잠든 다른 초안들도 깨운다
  // (admin 1클릭 등재와 동일한 후처리 — dictionary-recheck)
  if (namingRegistered > 0) {
    try {
      await requeueDraftsUnblockedByDictionary(supabase)
    } catch (e) {
      console.error("[news-auto-publish] 사전 등재 후 재큐 실패", e)
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    published,
    postIds: publishedIds,
    todayTotal: (publishedToday ?? 0) + published,
    autoToday: (autoToday ?? 0) + published,
    observability: ledgerHealthy ? "ok" : "degraded",
    ...(namingRegistered > 0 ? { namingRegistered } : {}),
    // 창이 120으로 넓어져 개별 목록은 100건을 넘길 수 있다 — 사유별 집계(skipCounts)가
    // 전량이고 목록은 표본이다. 잘랐다는 사실을 응답에 남겨 오독을 막는다.
    ...(skipped.length > 0
      ? {
          skipped: skipped.slice(0, 25),
          ...(skipped.length > 25 ? { skippedTruncated: skipped.length - 25 } : {}),
          skipCounts,
        }
      : {}),
    // 판정이 그대로라 원장에 다시 안 남긴 수 — 정체 규모를 회차마다 보이게 유지
    ...(repeatedVerdicts > 0 ? { repeatedVerdicts } : {}),
    ...(gated.length > 0 ? { gated } : {}),
    ...(errors.length > 0 ? { errors } : {}),
  })
}

export async function GET(request: NextRequest) {
  return withCronLog("news-auto-publish", run)(request)
}
export async function POST(request: NextRequest) {
  return run(request)
}
