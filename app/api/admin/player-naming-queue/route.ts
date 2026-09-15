import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi } from "@/lib/admin/require-admin-api"
import {
  loadPlayerNamingQueue,
  PlayerNamingSaveSchema,
} from "@/lib/news/notation/player-naming-queue"
import { requeueDraftsUnblockedByDictionary } from "@/lib/news/dictionary-recheck"

export const dynamic = "force-dynamic"
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })
const QuerySchema = z.object({
  filter: z.enum(["missing", "korean", "name_parts"]).default("missing"),
  q: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(0).max(100000).default(0),
})
const ResultSchema = z.object({
  saved: z.array(z.string()).max(100),
  failed: z.array(z.object({ key: z.string(), error: z.string() })).max(100),
})

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi()
  if (auth instanceof NextResponse) return auth
  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return json({ error: "검색 조건을 확인해 주세요." }, 400)
  try {
    return json(await loadPlayerNamingQueue(auth.supabase, parsed.data))
  } catch {
    return json({ error: "미완료 선수 이름 목록을 불러오지 못했습니다. 다시 불러와 주세요." }, 503)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApi()
  if (auth instanceof NextResponse) return auth
  const parsed = PlayerNamingSaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return json(
      {
        error: "한국어 이름과 수정 버전을 확인해 주세요. 한 번에 최대 100행을 저장할 수 있습니다.",
      },
      400
    )
  try {
    const { data, error } = await auth.supabase.rpc("save_player_naming_rows", {
      p_rows: parsed.data.entries,
      p_actor: auth.userId,
    })
    if (error)
      return json(
        { error: "선수 이름을 저장하지 못했습니다. 입력한 내용은 유지하고 다시 시도해 주세요." },
        503
      )
    const result = ResultSchema.parse(data)
    let recheckPending = false
    if (result.saved.length) {
      try {
        const recheck = await requeueDraftsUnblockedByDictionary(auth.supabase)
        recheckPending = (recheck?.failed ?? 0) > 0
      } catch {
        recheckPending = true
      }
    }
    return json({ ...result, recheckPending })
  } catch {
    return json(
      { error: "저장 결과를 확인하지 못했습니다. 입력을 유지하고 목록을 다시 불러와 주세요." },
      503
    )
  }
}
