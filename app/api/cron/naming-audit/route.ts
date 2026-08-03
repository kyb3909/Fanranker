import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifySpelling } from "@/lib/naming/verify"
import { isClubName, plausibleCorrection } from "@/lib/naming/pick"
import { normalizePlayerKey } from "@/lib/saga/identity"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import type { TipTapNode } from "@/types/post"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * 표기 소급 교정 도구 (수동 — vercel.json 미등록, CRON_SECRET 필수).
 * "지금까지 발행된 떡밥들도 모두 검수해서 바꿔줘" (2026-08-04 운영자).
 *
 * 발행된 봇 기사에서 선수명을 추출 → 사전·네이버로 올바른 표기 확정 →
 * 제목·본문·사가 연표 헤드라인까지 일괄 교정. 실사례: '코디 갓포'(네이버 0건)
 * → '코디 각포'(3,966건).
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

/** 기사에서 선수 한글 표기 추출 (mini — 이름만 뽑는 단순 작업) */
async function extractNames(title: string, body: string): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              '기사에 등장하는 축구 선수 이름의 한글 표기를 기사에 적힌 그대로 전부 추출하라 (감독·구단 제외). JSON만: {"names": ["..."]}',
          },
          { role: "user", content: `제목: ${title}\n\n본문:\n${body.slice(0, 3000)}` },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { names?: unknown[] }
    return Array.isArray(parsed.names)
      ? [...new Set(parsed.names.map(String).filter((s) => /[가-힣]/.test(s)))].slice(0, 15)
      : []
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied

  const sp = request.nextUrl.searchParams
  const limit = Math.min(20, Math.max(1, Number(sp.get("limit") ?? 10)))
  const offset = Math.max(0, Number(sp.get("offset") ?? 0))
  const dry = sp.get("dry") === "1"

  const supabase = createServiceRoleClient()

  // 사전: 정표기·변형표기 매핑
  const { data: dict } = await supabase
    .from("news_alias_dictionary")
    .select("id, preferred_ko, hangul_alts")
    .eq("category", "player")
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
    const names = await extractNames(post.title as string, body)
    const pairs: [string, string][] = []
    const skipped: string[] = []

    for (const name of names) {
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
          const romanKey = normalizePlayerKey(v.romanized)
          await supabase.from("news_alias_dictionary").upsert(
            {
              id: `player_auto_${romanKey.replace(/-/g, "_")}`.slice(0, 60),
              category: "player",
              preferred_ko: v.winner,
              romanized: v.romanized,
              surfaces: [romanKey.replace(/-/g, " "), v.winner],
              hangul_alts: v.winner !== name ? [name] : [],
              confidence: 0.7,
              notes: `소급 감사 등재 — 네이버: ${v.counts.map((c) => `${c.candidate} ${c.total}건`).join(", ")}`,
            },
            { onConflict: "id", ignoreDuplicates: true }
          )
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

    if (pairs.length === 0) {
      if (skipped.length > 0) report.push({ post: post.title as string, changes: [], skipped })
      continue
    }
    // 긴 표기 먼저 치환 ('코디 갓포'를 먼저, 그 다음 '갓포')
    pairs.sort((a, b) => b[0].length - a[0].length)

    const newTitle = applyToText(post.title as string, pairs)
    const newContent = applyToContent(post.content, pairs)
    if (!dry) {
      await supabase
        .from("posts")
        .update({ title: newTitle, content: newContent })
        .eq("id", post.id)
      // 사가 연표 헤드라인도 같은 교정 적용
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
    report.push({
      post: post.title as string,
      changes: pairs.map(([f, t]) => `${f} → ${t}`),
      skipped,
    })
  }

  return NextResponse.json({
    ok: true,
    dry,
    scanned: posts?.length ?? 0,
    offset,
    changedPosts: report.filter((r) => r.changes.length > 0).length,
    report,
  })
}
