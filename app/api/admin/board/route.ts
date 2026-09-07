import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"
import { isBoardStatus, type CardMove } from "@/lib/admin/board"

/**
 * 운영 할 일 보드 (2026-09-08) — `admin_board_cards`.
 *
 *   GET            전체 카드
 *   POST           카드 추가 { title, detail?, tag?, effort?, status? } → 그 열 맨 끝
 *   PATCH          { moves: [{ id, status, position }] }  위치 일괄 변경 (드래그·화살표)
 *                  { id, title?, detail?, tag?, effort? }  내용 수정
 *   DELETE         { id }
 *
 * 캐시는 next.config 의 /api/admin 규칙(no-store)을 따른다. 위치 계산은 lib/admin/board 가 한다.
 */

const TABLE = "admin_board_cards"
const MAX = { title: 120, detail: 2000, tag: 40, effort: 40 } as const

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined
  return v.trim().slice(0, max)
}

function nullableText(v: unknown, max: number): string | null | undefined {
  if (v === null) return null
  const t = text(v, max)
  return t === undefined ? undefined : t || null
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const body = (await request.json().catch(() => null)) as unknown
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null
}

function parseMoves(raw: unknown): CardMove[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return null
  const moves: CardMove[] = []
  for (const m of raw) {
    if (!m || typeof m !== "object") return null
    const { id, status, position } = m as Record<string, unknown>
    if (typeof id !== "string" || !id) return null
    if (!isBoardStatus(status)) return null
    if (typeof position !== "number" || !Number.isInteger(position) || position < 0) return null
    moves.push({ id, status, position })
  }
  return moves
}

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("position", { ascending: true })
    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ cards: data ?? [] })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const body = await readBody(request)
    if (!body) return apiError("본문이 필요합니다", 400)
    const title = text(body.title, MAX.title)
    if (!title) return apiError("제목이 필요합니다", 400)
    const status = body.status === undefined ? "todo" : body.status
    if (!isBoardStatus(status)) return apiError("열 값이 잘못됐습니다", 400)

    const { data: last } = await supabase
      .from(TABLE)
      .select("position")
      .eq("status", status)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()
    const position = (last?.position ?? -1) + 1

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        title,
        detail: text(body.detail, MAX.detail) ?? "",
        tag: nullableText(body.tag, MAX.tag) ?? null,
        effort: nullableText(body.effort, MAX.effort) ?? null,
        status,
        position,
      })
      .select("*")
      .single()
    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ card: data }, { status: 201 })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const body = await readBody(request)
    if (!body) return apiError("본문이 필요합니다", 400)
    const now = new Date().toISOString()

    if (body.moves !== undefined) {
      const moves = parseMoves(body.moves)
      if (!moves) return apiError("moves 형식이 잘못됐습니다", 400)
      for (const m of moves) {
        const { error } = await supabase
          .from(TABLE)
          .update({ status: m.status, position: m.position, updated_at: now })
          .eq("id", m.id)
        if (error) return apiError(error.message, 500, error)
      }
      return NextResponse.json({ success: true, moved: moves.length })
    }

    const id = typeof body.id === "string" ? body.id : ""
    if (!id) return apiError("id 필요", 400)
    const patch: Record<string, unknown> = { updated_at: now }
    const title = text(body.title, MAX.title)
    if (body.title !== undefined) {
      if (!title) return apiError("제목이 필요합니다", 400)
      patch.title = title
    }
    const detail = text(body.detail, MAX.detail)
    if (detail !== undefined) patch.detail = detail
    const tag = nullableText(body.tag, MAX.tag)
    if (tag !== undefined) patch.tag = tag
    const effort = nullableText(body.effort, MAX.effort)
    if (effort !== undefined) patch.effort = effort

    const { error } = await supabase.from(TABLE).update(patch).eq("id", id)
    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const body = await readBody(request)
    const id = body && typeof body.id === "string" ? body.id : ""
    if (!id) return apiError("id 필요", 400)

    const { error } = await supabase.from(TABLE).delete().eq("id", id)
    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}
