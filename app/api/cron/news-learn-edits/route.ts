import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { learnFromDeskEdit } from "@/lib/news/learn-corrections"

// 60 이었다가 발행량이 늘며 실제 소요가 넘어섰다(36s→48s→초과). 일괄 조회로 원인은
// 없앴지만, 상한도 형제 뉴스 cron 과 맞춘다 — 타임아웃은 로그조차 안 남는다.
export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * 발행 후 수정 학습 cron (매일 22:30 KST) — 운영자가 발행된 봇 기사를 고치면
 * 발행 시점 스냅샷(news_reservoir.draft — publishNewsDraft 가 발행본으로 덮어씀)과
 * 현재 posts 를 diff 해서 표기 교정을 사전에 등록한다.
 *
 * 기존 배치(data/agents/scripts/learn-from-edits.js)는 로컬 Hermes cron 의존이라
 * gateway 미실행 시 조용히 멈춘다 — 이 cron 이 개입 없는 기본 경로가 되고,
 * VPS 스크립트는 안전망으로 남는다 (audit 해시 컨벤션이 같아 이중 학습 없음).
 *
 * 자동발행분(preEdit 없음)은 발행 시 즉시 학습이 안 태워지므로, 발행 후 수정을
 * 줍는 이 경로가 유일한 학습 루프다 (2026-08-04 운영자 요청).
 */

const LOOKBACK_DAYS = 14
/** LLM 호출 상한 (run 당) — 하루 발행 ≤20건이라 실제로는 닿지 않는다 */
const MAX_LEARN_PER_RUN = 20
/**
 * 훑을 발행분 상한. 14일 × 30~45건이면 500건을 넘고, 그게 타임아웃의 실제 원인이었다.
 * 최신순이라 잘리는 건 가장 오래된 것들이고, 그건 이미 이전 회차가 처리했다.
 */
const MAX_SCAN_PER_RUN = 300

/** TipTap JSON → 문단 텍스트 (learn-from-edits.js 와 같은 규칙 — 해시 호환) */
function tiptapText(node: unknown, out: string[] = []): string[] {
  const n = node as { type?: string; content?: unknown[]; text?: string } | null
  if (!n) return out
  if (n.type === "paragraph") {
    const t = ((n.content ?? []) as { text?: string }[]).map((c) => c.text ?? "").join("")
    if (t.trim()) out.push(t.trim())
  }
  for (const c of n.content ?? []) tiptapText(c, out)
  return out
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim()

type AuditEntry = { agent?: string; message?: string; action?: string; note?: string }
type Audit = AuditEntry[] | { edit_learner_runs?: AuditEntry[] } | null

// audit 형태가 발행 경로마다 다르다(배열 | 객체) — 기존 데이터를 덮지 않게 읽기/쓰기 분리
function auditEntries(audit: Audit): AuditEntry[] {
  if (Array.isArray(audit)) return audit
  if (audit && Array.isArray(audit.edit_learner_runs)) return audit.edit_learner_runs
  return []
}

function auditWithEntry(audit: Audit, entry: Record<string, unknown>): unknown {
  if (Array.isArray(audit)) return [...audit, entry]
  return {
    ...((audit as Record<string, unknown>) ?? {}),
    edit_learner_runs: [
      ...((audit as { edit_learner_runs?: unknown[] })?.edit_learner_runs ?? []),
      entry,
    ],
  }
}

async function cronGet(request: Request) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  const supabase = createServiceRoleClient()
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString()

  const { data: items, error } = await supabase
    .from("news_reservoir")
    .select("id, publish, audit, draft")
    .eq("status", "published")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(MAX_SCAN_PER_RUN)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── posts 일괄 조회 (2026-08-09 타임아웃 수리) ──
  // 예전에는 항목마다 posts 를 개별 조회했다(N+1). 14일치가 500건을 넘으면서 diff 를
  // 보기도 전에 왕복만 500회가 됐고, 실측 소요가 36s → 48s → **60s 초과**로 늘어
  // 3일간 회차가 통째로 사라졌다. 더 나쁜 건 `withCronLog` 가 로그를 finally 에 쓰기
  // 때문에 **타임아웃은 기록조차 남지 않는다** — "죽음"과 "미실행"이 구분되지 않았다.
  // (탐지 자체는 invariant-audit 의 cron_heartbeat 가 해냈다.)
  const postIds = (items ?? [])
    .map((i) => {
      const p = (i.publish ?? {}) as { post_id?: string; postId?: string }
      return p.post_id ?? p.postId
    })
    .filter((id): id is string => !!id)

  const postById = new Map<
    string,
    { id: string; title: string; content: unknown; deleted_at: string | null }
  >()
  for (let i = 0; i < postIds.length; i += 200) {
    const { data: rows } = await supabase
      .from("posts")
      .select("id, title, content, deleted_at")
      .in("id", postIds.slice(i, i + 200))
    for (const r of rows ?? []) {
      postById.set(r.id as string, r as never)
    }
  }

  let checked = 0
  let edited = 0
  let learnedRules = 0
  const learned: string[] = []

  for (const item of items ?? []) {
    if (edited >= MAX_LEARN_PER_RUN) break

    const publish = (item.publish ?? {}) as {
      post_id?: string
      postId?: string
    }
    const postId = publish.post_id ?? publish.postId
    const draft = (item.draft ?? null) as { title?: string; content?: unknown } | null
    // draft 미보유 행(VPS 파이프라인 발행분)은 VPS 배치 스크립트 몫 — 여기선 스킵
    if (!postId || !draft?.title || !draft.content) continue
    checked++

    const post = postById.get(postId)
    if (!post || post.deleted_at) continue

    const originalText = norm([draft.title, ...tiptapText(draft.content)].join("\n"))
    const currentText = norm([post.title, ...tiptapText(post.content)].join("\n"))
    if (!originalText || !currentText || originalText === currentText) continue

    // 같은 버전 재학습 방지 — VPS 스크립트와 같은 해시 컨벤션 (이중 학습 차단).
    // 수정 화면(published-fixes)이 즉시 학습에 성공하면 같은 해시를 남기므로 여기서 스킵된다.
    const contentHash = createHash("sha1").update(currentText, "utf8").digest("hex").slice(0, 12)
    const entries = auditEntries(item.audit as Audit)
    const already = entries.some(
      (a) => a?.agent === "edit_learner" && a?.message?.includes(contentHash)
    )
    if (already) continue

    // 운영자가 수정 화면에 적은 사유 — 표기/사실 분류의 근거로 학습기에 전달
    const operatorNote =
      entries
        .filter((a) => a?.agent === "operator" && a?.action === "edit_note" && a?.note)
        .map((a) => a.note)
        .join(" / ") || null

    edited++
    const res = await learnFromDeskEdit(supabase, {
      postId,
      originalTitle: draft.title,
      originalContent: draft.content,
      finalTitle: post.title as string,
      finalContent: post.content,
      operatorNote,
    })
    learnedRules += res.learned.length
    learned.push(...res.learned.map((r) => `${postId.slice(0, 8)}: ${r}`))

    // 추출이 완주 못 했으면(OpenAI 장애 등) 해시를 남기지 않는다 — 다음 밤에 재시도
    if (!res.ran) continue

    await supabase
      .from("news_reservoir")
      .update({
        audit: auditWithEntry(item.audit as Audit, {
          at: new Date().toISOString(),
          agent: "edit_learner",
          action: "learn",
          tier: "T2",
          message: `hash=${contentHash} corrections=${res.learned.length} factual=${res.factual.length}`,
          ...(res.factual.length > 0 ? { factual: res.factual } : {}),
        }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
  }

  return NextResponse.json({
    ok: true,
    checked,
    edited,
    learnedRules,
    ...(learned.length > 0 ? { learned } : {}),
  })
}

export const GET = withCronLog("news-learn-edits", cronGet)
