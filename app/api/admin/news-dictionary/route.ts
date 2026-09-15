import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi } from "@/lib/admin/require-admin-api"
import { listManagedNotation, NotationEditSchema } from "@/lib/news/notation/manage"
import { requeueDraftsUnblockedByDictionary } from "@/lib/news/dictionary-recheck"

export const dynamic = "force-dynamic"
const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    entry: NotationEditSchema,
    expected: z.string().datetime({ offset: true }).nullable(),
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().min(1).max(200),
    expected: z.string().datetime({ offset: true }),
  }),
])
export async function GET(req: NextRequest) {
  const auth = await requireAdminApi()
  if (auth instanceof NextResponse) return auth
  try {
    const rows = await listManagedNotation(auth.supabase)
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLocaleLowerCase()
    const category = req.nextUrl.searchParams.get("category")
    const page = Math.max(0, Math.min(1000, Number(req.nextUrl.searchParams.get("page")) || 0))
    const filtered = rows.filter(
      (r) =>
        (!category || r.category === category) &&
        [
          r.preferred_ko,
          r.romanized,
          r.given_name_ko,
          r.family_name_ko,
          r.short_name_ko,
          ...(r.surfaces ?? []),
          ...(r.hangul_alts ?? []),
        ].some((s) => (s ?? "").toLocaleLowerCase().includes(q))
    )
    return NextResponse.json(
      { entries: filtered.slice(page * 40, page * 40 + 40), total: filtered.length, page },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return NextResponse.json({ error: "표기 사전을 불러오지 못했습니다." }, { status: 503 })
  }
}
export async function POST(req: NextRequest) {
  const auth = await requireAdminApi()
  if (auth instanceof NextResponse) return auth
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      { error: "표기·별칭·원어 이름의 입력 형식을 확인해 주세요." },
      { status: 400 }
    )
  const body = parsed.data
  if (body.action === "save" && Boolean(body.entry.id) !== Boolean(body.expected))
    return NextResponse.json({ error: "기존 항목의 수정 버전을 확인해 주세요." }, { status: 400 })
  const { data, error } = await auth.supabase.rpc("save_news_notation_entry", {
    p_entry: body.action === "save" ? body.entry : { id: body.id },
    p_expected: body.expected,
    p_delete: body.action === "delete",
    p_actor: auth.userId,
  })
  if (error)
    return NextResponse.json(
      {
        error:
          error.code === "40001"
            ? "다른 창에서 변경했습니다. 목록을 새로 불러와 주세요."
            : error.code === "23505"
              ? "이름이나 별칭이 다른 항목과 겹칩니다. 기존 항목을 검색해 확인해 주세요."
              : "사전 변경을 저장하지 못했습니다.",
      },
      { status: ["40001", "23505"].includes(error.code) ? 409 : 503 }
    )
  // Saving remains successful even when a separate queue recheck needs another cron run.
  let recheckPending = false
  if (body.action === "save")
    await requeueDraftsUnblockedByDictionary(auth.supabase).catch(() => {
      recheckPending = true
    })
  return NextResponse.json({ ok: true, id: data.id, recheckPending })
}
