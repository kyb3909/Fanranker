import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import type { TipTapNode } from "@/types/post"

export const dynamic = "force-dynamic"

/**
 * GET/POST /api/news/correction-examples  (CRON_SECRET)
 *
 * 뉴스 스캐너 few-shot 학습용 — 검수자의 수정을 두 층위로 반환한다:
 *  - examples: 제목 교정 쌍 (원본 raw.title ≠ 최종 draft.title) — 표기/제목 스타일
 *  - articles: **기사 전체 재작성 쌍** (draft.original ≠ 최종 draft) — 구조·톤·정보 밀도.
 *    검수자가 봇 초안을 기사체로 다시 쓴 사례를 통째로 보여줘 "이렇게 써라"를 흉내내게
 *    한다. 발행본만이 아니라 "고치고 반려"(rejected + 편집)도 포함 — 기사 자체는
 *    버려졌어도 다시 쓴 문장은 최고의 교보재다.
 *
 * 고칠수록 예시가 쌓여 원본 품질이 올라가는 자기개선 루프.
 *
 * 2026-08-09 추가 — naming: **확정 한글 표기 사전**.
 * 그동안의 표기 방어는 전부 "LLM이 지어낸 뒤 잡는" 사후 교정이었다. 잡는 그물을
 * 아무리 촘촘히 해도 처음 보는 오표기는 계속 뚫린다('하비 알론소' 실사고).
 * 그래서 **쓰기 전에 정답을 준다** — 스캐너가 원문에서 발견한 고유명사에 대해
 * 확정 표기를 프롬프트에 실으면 지어낼 기회 자체가 없어진다.
 * 새 엔드포인트를 만들지 않고 여기 얹는 이유는 스캐너가 이미 회차당 1회 호출하기 때문.
 */
interface ReservoirRow {
  raw: { title?: string } | null
  draft: {
    title?: string
    content?: unknown
    original?: { title?: string; content?: unknown }
  } | null
  status: string
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim()

async function handler(req: NextRequest) {
  const authError = verifyCronSecret(req)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("news_reservoir")
    .select("raw, draft, status, updated_at")
    .in("status", ["published", "rejected"])
    .filter("source->>type", "eq", "hermes")
    .order("updated_at", { ascending: false })
    .limit(120)

  const rows = (data as ReservoirRow[]) ?? []

  // 제목 교정 쌍 — 발행본만 (반려 제목은 어차피 안 나간 것이라 표기 근거로 약하다)
  const examples = rows
    .filter((r) => r.status === "published")
    .map((r) => ({ from: r.raw?.title?.trim() ?? "", to: r.draft?.title?.trim() ?? "" }))
    .filter((e) => e.from && e.to && e.from !== e.to)
    .slice(0, 12)

  // 기사 재작성 쌍 — 봇 원본(draft.original)이 보존된 것 중 본문이 실제로 바뀐 것.
  // 프롬프트 예산상 최근 2건만, 각 측 길이 제한.
  const articles = rows
    .flatMap((r) => {
      const orig = r.draft?.original
      if (!orig?.content || !r.draft?.content) return []
      const before = norm(extractTextFromTipTapJSON(orig.content as TipTapNode))
      const after = norm(extractTextFromTipTapJSON(r.draft.content as TipTapNode))
      if (!before || !after || before === after || after.length < 100) return []
      return [
        {
          beforeTitle: (orig.title ?? "").trim(),
          before: before.slice(0, 700),
          afterTitle: (r.draft.title ?? "").trim(),
          after: after.slice(0, 1200),
        },
      ]
    })
    .slice(0, 2)

  const naming = await fetchNamingHints(supabase)

  return NextResponse.json({ examples, articles, naming })
}

/**
 * 확정 표기 사전 → 스캐너가 원문 매칭에 쓸 수 있는 형태 `{ ko, en[] }`.
 *
 * en 은 **원문(영어)에 실제로 나타날 수 있는 형태만** 남긴다:
 *  - 도메인(theathletic.com)은 기사 본문에 안 나오므로 제외
 *  - 한글은 영어 원문 매칭에 무의미하므로 제외
 *  - 3자 이하는 제외 — 'as'·'om' 같은 약어가 아무 문장에나 걸린다 (source-label 과 같은 규율)
 */
async function fetchNamingHints(
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<{ ko: string; en: string[] }[]> {
  const { data } = await supabase
    .from("news_alias_dictionary")
    .select("preferred_ko, romanized, surfaces")
    .in("category", ["player", "coach", "team", "media"])

  const out: { ko: string; en: string[] }[] = []
  for (const row of (data ?? []) as {
    preferred_ko: string | null
    romanized: string | null
    surfaces: string[] | null
  }[]) {
    const ko = row.preferred_ko?.trim()
    if (!ko) continue
    const en = [...new Set([row.romanized ?? "", ...(row.surfaces ?? [])])]
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 3 && !s.includes(".") && !/[가-힣]/.test(s))
    if (en.length > 0) out.push({ ko, en })
  }
  return out
}

export const GET = handler
export const POST = handler
