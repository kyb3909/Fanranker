import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaffApi } from "@/lib/admin/roles"
import { unknownPlayerNames } from "@/lib/news/quality-gate"
import {
  parseUnknownNames,
  suggestExisting,
  UNKNOWN_PLAYER_PREFIX,
  type AliasTarget,
} from "@/lib/news/alias-suggest"

export const dynamic = "force-dynamic"

/**
 * 표기 사전 후보 — 자동발행을 막은 미등재 선수명을 모아 1클릭 등재한다.
 * 실측 병목 1위(24h 게이트 반려의 48%)를 사람 손 한 번으로 푸는 문 (2026-08-04).
 *
 * 자동 등재는 하지 않는다: 사전 오염은 이후 모든 기사에 전파된다. 후보 추출·유사
 * 항목 제안까지만 자동, 확정은 사람.
 */

const LOOKBACK_DAYS = 7

export async function GET() {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString()
  const { data: rows } = await supabase
    .from("news_reservoir")
    .select("draft, decision")
    .gte("created_at", since)
    .not("decision->auto_gate", "is", null)
    .limit(500)

  const parsed = parseUnknownNames(
    ((rows ?? []) as { draft: { title?: string } | null; decision: Record<string, unknown> }[])
      .map((r) => {
        const gate = (r.decision?.auto_gate ?? {}) as { reasons?: unknown }
        const reasons = Array.isArray(gate.reasons) ? gate.reasons.map(String) : []
        return { reasons, title: r.draft?.title ?? "" }
      })
      .filter((r) => r.reasons.some((x) => x.startsWith(UNKNOWN_PLAYER_PREFIX)))
  )

  const { data: dict } = await supabase
    .from("news_alias_dictionary")
    .select("id, preferred_ko, romanized, hangul_alts")
    .eq("category", "player")
  const dictionary = (dict ?? []) as AliasTarget[]

  // 반려 이후 등재된 이름은 목록에서 사라진다 — 게이트와 같은 판정 함수를 쓴다
  const stillUnknown = new Set(
    unknownPlayerNames(
      parsed.map((p) => p.name),
      dictionary.map((d) => ({ preferred_ko: d.preferred_ko, hangul_alts: d.hangul_alts }))
    )
  )

  const candidates = parsed
    .filter((p) => stillUnknown.has(p.name))
    .map((p) => ({ ...p, suggestions: suggestExisting(p.name, dictionary) }))

  return NextResponse.json({ candidates, dictionarySize: dictionary.length })
}

const BodySchema = z.discriminatedUnion("mode", [
  // 기존 항목의 **틀린/다른 표기** — 실측상 이 경우가 더 많다 (음차 흔들림).
  // 인식(hangul_alts)과 교정(surfaces) 양쪽에 넣어 앞으로 대표 표기를 쓰게 한다.
  z.object({
    mode: z.literal("alias"),
    target_id: z.string().min(1),
    hangul: z.string().min(1).max(40),
  }),
  // 후보가 오히려 **맞는 표기**이고 사전 대표값이 틀린 경우 — 대표를 갈아끼운다
  // (예: 사전 "비니시우스 주니어" ↔ 운영자 확정 "비니시우스 주니오르")
  z.object({
    mode: z.literal("promote"),
    target_id: z.string().min(1),
    hangul: z.string().min(1).max(40),
  }),
  z.object({
    mode: z.literal("new"),
    preferred_ko: z.string().min(1).max(40),
    romanized: z.string().max(80).optional(),
  }),
])

/** 사전 id 용 슬러그 — ASCII 가 없으면(한글만) 코드포인트 해시로 안정적인 짧은 키 */
function slugify(s: string): string {
  const ascii = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  if (ascii) return ascii
  let h = 0
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return h.toString(36)
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "요청 형식 오류" }, { status: 400 })
  const body = parsed.data

  if (body.mode === "alias") {
    const { data: target } = await supabase
      .from("news_alias_dictionary")
      .select("id, preferred_ko, hangul_alts, surfaces")
      .eq("id", body.target_id)
      .maybeSingle()
    if (!target) return NextResponse.json({ error: "대상 항목이 없습니다." }, { status: 404 })

    // hangul_alts = 게이트가 인식(발행 통과), surfaces = 스캐너·정규화가 대표 표기로
    // 교정. 둘 다 넣어야 "인식은 하되 앞으로는 대표 표기를 쓴다"가 성립한다.
    const alts = (target.hangul_alts as string[] | null) ?? []
    const surfaces = (target.surfaces as string[] | null) ?? []
    const { error } = await supabase
      .from("news_alias_dictionary")
      .update({
        hangul_alts: [...new Set([...alts, body.hangul])],
        surfaces: [...new Set([...surfaces, body.hangul.toLowerCase()])],
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, merged_into: target.preferred_ko })
  }

  if (body.mode === "promote") {
    const { data: target } = await supabase
      .from("news_alias_dictionary")
      .select("id, preferred_ko, hangul_alts, surfaces")
      .eq("id", body.target_id)
      .maybeSingle()
    if (!target) return NextResponse.json({ error: "대상 항목이 없습니다." }, { status: 404 })

    // 후보를 대표로 올리고, 옛 대표는 인식·교정용으로 내려 보존한다 (원문에 옛 철자가
    // 나와도 계속 매칭되도록)
    const oldKo = target.preferred_ko as string
    const alts = (target.hangul_alts as string[] | null) ?? []
    const surfaces = (target.surfaces as string[] | null) ?? []
    const { error } = await supabase
      .from("news_alias_dictionary")
      .update({
        preferred_ko: body.hangul,
        hangul_alts: [...new Set([...alts.filter((a) => a !== body.hangul), oldKo])],
        surfaces: [...new Set([...surfaces, oldKo.toLowerCase()])],
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, promoted_from: oldKo })
  }

  // new — 같은 한글 표기가 이미 있으면 중복 생성하지 않는다
  const { data: dup } = await supabase
    .from("news_alias_dictionary")
    .select("id")
    .eq("category", "player")
    .eq("preferred_ko", body.preferred_ko)
    .maybeSingle()
  if (dup) return NextResponse.json({ ok: true, already: true })

  const romanized = body.romanized?.trim() ?? ""
  const { error } = await supabase.from("news_alias_dictionary").insert({
    id: `player_desk_${slugify(romanized || body.preferred_ko)}`,
    category: "player",
    preferred_ko: body.preferred_ko,
    romanized,
    surfaces: romanized ? [romanized.toLowerCase()] : [],
    confidence: 1,
    notes: `desk-registered at=${new Date().toISOString()}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
