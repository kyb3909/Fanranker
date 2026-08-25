/**
 * 저장된 매치 프리뷰에 **번역만 다시 입힌다** (2026-08-25).
 *
 * ## 왜 필요한가
 * 오늘 결장 사유 번역표(`lib/lfa/injury-terms.ts`)에 `leg`·`stress` 를 채우고 팀명 대조
 * 버그(`Inter` 3파전 동점)를 고쳤는데, **화면은 그대로였다.**
 * `match_preview_cache` 가 **번역이 끝난 결과**를 DB 에 눕혀 두기 때문이다. 코드를 고쳐도
 * 저장분은 옛 번역 그대로다. 게다가 종료 경기는 `settled=true` 라 **영구** — 다시 안 산다.
 *
 * ⚠️ 이건 [[project_match_center_consistency]] 의 "고쳤는데 화면 그대로면 캐시부터 의심"
 *    과 같은 함정이다. 오늘만 두 번째다.
 *
 * ## ⚠️ 캐시를 지우면 안 된다 — 크레딧을 다시 쓴다
 * 프리뷰는 **호출당 3크레딧**(h2h + injuries + officials)이다. 63건을 지우면 189크레딧이
 * 다시 나간다. 그런데 우리가 고친 건 **번역뿐**이고 원본 데이터는 이미 손에 있다.
 * 그래서 payload 안의 문자열에 **새 번역만 다시 적용**한다 — LFA 호출 0.
 *
 * ## ⭐ 팀명도 고칠 수 있다 — 실패한 번역은 **원문을 그대로 남긴다**
 * 처음엔 못 고친다고 봤지만 실물을 열어보니 아니었다: "Seville"·"Eibar" 는 번역
 * **결과**가 아니라 매칭에 실패해 그대로 남은 **원문**이다. 그러니 고친 사전으로
 * 다시 돌리면 걸린다. (성공했던 것들은 이미 한글이라 이번 통과에서 그냥 지나간다.)
 *
 * ⚠️ 선수명은 못 고친다 — "G. Petit" 처럼 축약된 채 들어와 대조할 전체 이름이 없다.
 *
 * 실행:
 *   pnpm exec tsx scripts/relocalize-preview-cache.ts          # 미리보기
 *   pnpm exec tsx scripts/relocalize-preview-cache.ts --apply
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { localizeInjuryStatus } from "../lib/lfa/injury-terms"
import { localizeTeam } from "../lib/lfa/name-match"

const APPLY = process.argv.includes("--apply")

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

interface InjuryRow {
  name: string
  position: string | null
  status: string
}
interface Preview {
  injuries?: { home?: InjuryRow[]; away?: InjuryRow[] }
  h2h?: unknown
  homeForm?: unknown
  awayForm?: unknown
  [k: string]: unknown
}

async function main() {
  const { data, error } = await supabase.from("match_preview_cache").select("lfa_match_id, payload")
  if (error) throw error

  // 팀 사전 — 매치센터가 쓰는 것과 같은 두 출처를 합친다
  const pairs: [string, string][] = []
  const { data: td } = await supabase
    .from("team_dictionary")
    .select("name_en, name_kr")
    .not("name_kr", "is", null)
  for (const t of td ?? []) if (t.name_en) pairs.push([t.name_en, t.name_kr as string])
  const { data: lt } = await supabase.from("lfa_team_names").select("lfa_name, name_kr")
  for (const t of lt ?? []) if (t.lfa_name && t.name_kr) pairs.push([t.lfa_name, t.name_kr])
  const teamPairs = pairs

  let touched = 0
  let fields = 0
  let teamFields = 0
  const samples: string[] = []
  const teamSamples: string[] = []
  const stuck = new Set<string>()

  for (const row of data ?? []) {
    const payload = row.payload as Preview | null
    if (!payload) continue

    let changed = false

    // 팀명 — 실패해 영문으로 남은 것만 다시 대조한다
    for (const key of ["h2h", "homeForm", "awayForm"] as const) {
      const list = payload[key]
      if (!Array.isArray(list)) continue
      for (const m of list as { home?: { name?: string }; away?: { name?: string } }[]) {
        for (const side of ["home", "away"] as const) {
          const before = m[side]?.name
          if (!before || !/[A-Za-z]{3,}/.test(before)) continue
          const after = localizeTeam(before, teamPairs)
          if (after !== before) {
            if (teamSamples.length < 10) teamSamples.push(`${before}  →  ${after}`)
            m[side]!.name = after
            changed = true
            teamFields++
          } else if (!stuck.has(before)) {
            stuck.add(before)
          }
        }
      }
    }

    for (const side of ["home", "away"] as const) {
      const list = payload.injuries?.[side]
      if (!Array.isArray(list)) continue
      for (const r of list) {
        const before = String(r.status ?? "")
        // ⚠️ 이미 한글화된 문자열에 다시 돌려도 안전하다 — 표는 영어 단어만 치환한다.
        //    "허벅지 근육 stress" 처럼 **부분만** 남은 것이 실제 사고 형태였다.
        const after = localizeInjuryStatus(before)
        if (after !== before) {
          if (samples.length < 12) samples.push(`${before}  →  ${after}`)
          r.status = after
          changed = true
          fields++
        }
      }
    }

    if (changed) {
      touched++
      if (APPLY) {
        await supabase
          .from("match_preview_cache")
          .update({ payload: payload as unknown as Record<string, unknown> })
          .eq("lfa_match_id", row.lfa_match_id)
      }
    }
  }

  console.log(
    `저장분 ${data?.length ?? 0}건 중 ${touched}건 재번역 — 사유 ${fields}개 / 팀명 ${teamFields}개`
  )
  samples.forEach((s) => console.log("  ", s))
  teamSamples.forEach((s) => console.log("  ", s))
  if (stuck.size)
    console.log(`
사전에 없어 그대로 둔 팀 ${stuck.size}개: ${[...stuck].join(", ")}`)
  console.log(APPLY ? "\n반영 완료 (LFA 호출 0)" : "\n미리보기 — --apply 로 반영")
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exitCode = 1
})
