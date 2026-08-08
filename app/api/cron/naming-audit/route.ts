import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { NAMING_CATEGORIES } from "@/lib/news/naming-normalize"
import { fetchSourceLabelMap, normalizeSourceLabel } from "@/lib/news/source-label"
import { notifyDiscordOps } from "@/lib/discord-notify"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifySpelling } from "@/lib/naming/verify"
import { isClubName, plausibleCorrection } from "@/lib/naming/pick"
import { registerVerifiedPlayer } from "@/lib/news/naming-verify-loop"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import type { TipTapNode } from "@/types/post"
import { chatParams } from "@/lib/llm/openai-params"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * 표기 소급 교정 (매일 23:20 KST 자동 + 수동 호출 겸용, CRON_SECRET 필수).
 * "지금까지 발행된 떡밥들도 모두 검수해서 바꿔줘" (2026-08-04 운영자).
 *
 * 발행된 봇 기사에서 인물명을 추출 → 사전·네이버로 올바른 표기 확정 →
 * 제목·본문·사가 연표 헤드라인까지 일괄 교정. 실사례: '코디 갓포'(네이버 0건)
 * → '코디 각포'(3,966건).
 *
 * 2026-08-09 자동화: 운영자 지시("내가 말해주지 않아도 알아서 네이버와 대조해라").
 * 그전까지는 수동 도구라 아무도 부르지 않으면 오표기가 그대로 남았고, 실제로
 * '하비 알론소'(정: 사비)가 3건 발행된 채 방치됐다. 발행 전 게이트는 미등재 이름만
 * 잡으므로, **이미 발행된 글**의 오표기를 잡는 건 이 소급 경로뿐이다.
 *
 * 호출: GET ?limit=10&offset=0&dry=1   (dry=1 이면 보고만, 수정 없음)
 * fail-closed: 네이버 근거가 없는 이름은 건드리지 않는다.
 */

const NEWS_BOT = "user_bot_soccer_kr"

/** TipTap 트리의 텍스트 노드에 교정 쌍 적용 (긴 표기 먼저 — '코디 갓포' > '갓포') */
function applyToContent(node: unknown, pairs: [string, string][]): unknown {
  if (Array.isArray(node)) return node.map((n) => applyToContent(n, pairs))
  if (!node || typeof node !== "object") return node
  const n = node as Record<string, unknown>
  const out: Record<string, unknown> = { ...n }
  if (typeof n.text === "string") {
    let t = n.text
    for (const [from, to] of pairs) t = t.split(from).join(to)
    out.text = t
  }
  if (n.content) out.content = applyToContent(n.content, pairs)
  return out
}

function applyToText(text: string, pairs: [string, string][]): string {
  let t = text
  for (const [from, to] of pairs) t = t.split(from).join(to)
  return t
}

/**
 * 기사에서 인물 한글 표기 추출 (mini — 이름만 뽑는 단순 작업).
 * 선수/감독을 나눠 받는다 — 등재 category 가 갈리기 때문 (감독을 player 로 등재하면
 * 무인 사서를 폐지시킨 그 오염이 재발한다). 2026-08-09 이전에는 감독을 아예 제외해서
 * 'Xabi Alonso → 하비 알론소'(정: 사비) 같은 오표기가 소급 교정에서도 안 잡혔다.
 */
async function extractNames(
  title: string,
  body: string
): Promise<{ players: string[]; coaches: string[] }> {
  const empty = { players: [], coaches: [] }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return empty
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        ...chatParams("gpt-4o-mini", { temperature: 0 }),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              '기사에 등장하는 축구 인물 이름의 한글 표기를 기사에 적힌 그대로 추출하라 (구단·대회명 제외). 역할로 나눈다 — players=선수, coaches=감독·수석코치. 역할이 불확실하면 players 에 넣어라. JSON만: {"players": ["..."], "coaches": ["..."]}',
          },
          { role: "user", content: `제목: ${title}\n\n본문:\n${body.slice(0, 3000)}` },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return empty
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      players?: unknown[]
      coaches?: unknown[]
    }
    const clean = (v: unknown[] | undefined, cap: number) =>
      Array.isArray(v)
        ? [...new Set(v.map(String).filter((s) => /[가-힣]/.test(s)))].slice(0, cap)
        : []
    return { players: clean(parsed.players, 15), coaches: clean(parsed.coaches, 5) }
  } catch {
    return empty
  }
}

async function cronGet(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  const sp = request.nextUrl.searchParams
  // 자동 회차는 파라미터가 없다 — 기본값이 하루치 발행량(30~45건)의 절반을 덮도록 20
  const limit = Math.min(20, Math.max(1, Number(sp.get("limit") ?? 20)))
  const offset = Math.max(0, Number(sp.get("offset") ?? 0))
  const dry = sp.get("dry") === "1"

  const supabase = createServiceRoleClient()

  // 사전: 정표기·변형표기 매핑
  const { data: dict } = await supabase
    .from("news_alias_dictionary")
    .select("id, preferred_ko, hangul_alts")
    .in("category", [...NAMING_CATEGORIES])
  // 출처 라벨 사전 (매체·구단) — 인물 사전과 분류가 달라 따로 읽는다
  const sourceLabels = await fetchSourceLabelMap(supabase)

  const preferredSet = new Set((dict ?? []).map((d) => d.preferred_ko.replace(/\s+/g, "")))
  const altToPreferred = new Map<string, string>()
  for (const d of dict ?? []) {
    for (const alt of d.hangul_alts ?? []) {
      if (alt && alt !== d.preferred_ko) altToPreferred.set(alt, d.preferred_ko)
    }
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, content")
    .eq("user_id", NEWS_BOT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  const report: { post: string; changes: string[]; skipped: string[] }[] = []
  const verifiedCache = new Map<string, string | null>() // 이름 → 확정 표기(null=보류)

  for (const post of posts ?? []) {
    const body = extractTextFromTipTapJSON(post.content as TipTapNode)
    const extracted = await extractNames(post.title as string, body)
    const pairs: [string, string][] = []
    const skipped: string[] = []

    const targets = [
      ...extracted.players.map((name) => ({ name, category: "player" as const })),
      ...extracted.coaches.map((name) => ({ name, category: "coach" as const })),
    ]
    for (const { name, category } of targets) {
      // 클럽명 오탐 차단 (실사고: '리버풀'이 선수로 추출돼 '헨더슨'으로 치환됨)
      if (isClubName(name)) continue
      const compact = name.replace(/\s+/g, "")
      if (preferredSet.has(compact)) continue // 이미 정표기
      const viaAlt = altToPreferred.get(name)
      if (viaAlt) {
        if (viaAlt !== name) pairs.push([name, viaAlt])
        continue
      }
      // 사전에 없음 → 네이버 검증 (캐시)
      if (!verifiedCache.has(name)) {
        const v = await verifySpelling(name, post.title as string)
        if (v.winner && v.romanized) {
          // 등재 형태는 발행 게이트 루프와 공유 — lib/news/naming-verify-loop.ts
          await registerVerifiedPlayer(supabase, {
            articleName: name,
            preferred: v.winner,
            romanized: v.romanized,
            category,
            notes: `소급 감사 등재(${category}) — 네이버: ${v.counts.map((c) => `${c.candidate} ${c.total}건`).join(", ")}`,
          })
          preferredSet.add(v.winner.replace(/\s+/g, ""))
          verifiedCache.set(name, v.winner)
        } else {
          verifiedCache.set(name, null)
        }
      }
      const winner = verifiedCache.get(name)
      if (winner === null || winner === undefined) skipped.push(`${name} (근거 부족)`)
      else if (winner !== name) {
        // 교정 타당성 — 음차 차이만 허용, 다른 단어로의 교체·풀네임 축약은 거부
        if (plausibleCorrection(name, winner)) pairs.push([name, winner])
        else skipped.push(`${name} → ${winner} (교정 타당성 불통과)`)
      }
    }

    // 긴 표기 먼저 치환 ('코디 갓포'를 먼저, 그 다음 '갓포')
    pairs.sort((a, b) => b[0].length - a[0].length)

    const originalTitle = post.title as string
    const namedTitle = applyToText(originalTitle, pairs)
    // 출처 라벨 통일도 같은 회차에 — 발행 경로와 **같은 함수**를 써서 규칙이 두 벌 되지 않게
    const newTitle = normalizeSourceLabel(namedTitle, sourceLabels)
    const labelChanged = newTitle !== namedTitle

    if (pairs.length === 0 && !labelChanged) {
      if (skipped.length > 0) report.push({ post: originalTitle, changes: [], skipped })
      continue
    }

    const changes = pairs.map(([f, t]) => `${f} → ${t}`)
    if (labelChanged)
      changes.push(`출처 라벨: ${namedTitle.slice(0, 30)} → ${newTitle.slice(0, 30)}`)

    if (!dry) {
      // 이름 교정이 없으면 본문은 건드리지 않는다 (라벨은 제목에만 있다)
      const update: Record<string, unknown> = { title: newTitle }
      if (pairs.length > 0) update.content = applyToContent(post.content, pairs)
      await supabase.from("posts").update(update).eq("id", post.id)
      // 사가 연표 헤드라인도 같은 교정 적용 (이름 교정 한정 — 연표에는 출처 라벨이 없다)
      for (const [from] of pairs) {
        const { data: entries } = await supabase
          .from("saga_entries")
          .select("id, headline")
          .ilike("headline", `%${from}%`)
        for (const e of entries ?? []) {
          await supabase
            .from("saga_entries")
            .update({ headline: applyToText(e.headline as string, pairs) })
            .eq("id", e.id)
        }
      }
    }
    report.push({ post: originalTitle, changes, skipped })
  }

  const changedPosts = report.filter((r) => r.changes.length > 0)
  const unresolved = report.flatMap((r) => r.skipped)

  // ── 측정층 (2026-08-09) ──
  // 그전까지 표기 오류의 탐지기는 '운영자 눈'뿐이었고, 실제로 '하비 알론소' 4건이
  // 최대 5일 방치됐다. 무엇을 몇 건 고쳤는지 매일 보이면 오표기율이 추세가 된다.
  // **고칠 게 있었을 때만** 보낸다 — 조용한 날의 알림은 곧 무시당한다.
  if (!dry && (changedPosts.length > 0 || unresolved.length > 0)) {
    await notifyDiscordOps({
      title: `표기 감사 — ${changedPosts.length}건 교정 / ${unresolved.length}건 미해결`,
      description: changedPosts
        .slice(0, 8)
        .map((r) => `• ${r.changes.join(", ")}`)
        .join("\n")
        .slice(0, 1500),
      level: changedPosts.length > 0 ? "warn" : "info",
      url: "https://gongnori.fan/admin/news-review",
      fields: [
        { name: "검사", value: `${posts?.length ?? 0}건`, inline: true },
        { name: "교정", value: `${changedPosts.length}건`, inline: true },
        // 미해결 = 네이버 근거가 없어 손대지 않은 이름. 사전 등재 후보다.
        {
          name: "근거 부족",
          value: unresolved.slice(0, 5).join(", ").slice(0, 200) || "없음",
        },
      ],
    })
  }

  return NextResponse.json({
    ok: true,
    dry,
    scanned: posts?.length ?? 0,
    offset,
    changedPosts: changedPosts.length,
    report,
  })
}

export const GET = withCronLog("naming-audit", cronGet)
