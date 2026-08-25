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
 * ⚠️ 팀명·선수명은 여기서 못 고친다. 그건 사전 조회(Supabase)가 필요한데 저장분에는
 *    원문이 안 남아 있다("Teruel" 이 이미 번역 실패한 결과값이다). 부상 사유만 처리하고,
 *    팀·선수 이름은 **다음 재구매 때** 새 코드로 다시 번역된다(미완료 경기 6시간 주기).
 *
 * 실행:
 *   pnpm exec tsx scripts/relocalize-preview-cache.ts          # 미리보기
 *   pnpm exec tsx scripts/relocalize-preview-cache.ts --apply
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { localizeInjuryStatus } from "../lib/lfa/injury-terms"

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
  [k: string]: unknown
}

async function main() {
  const { data, error } = await supabase.from("match_preview_cache").select("lfa_match_id, payload")
  if (error) throw error

  let touched = 0
  let fields = 0
  const samples: string[] = []

  for (const row of data ?? []) {
    const payload = row.payload as Preview | null
    if (!payload?.injuries) continue

    let changed = false
    for (const side of ["home", "away"] as const) {
      const list = payload.injuries[side]
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

  console.log(`저장분 ${data?.length ?? 0}건 중 ${touched}건 / 필드 ${fields}개 재번역`)
  samples.forEach((s) => console.log("  ", s))
  console.log(APPLY ? "\n반영 완료 (LFA 호출 0)" : "\n미리보기 — --apply 로 반영")
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exitCode = 1
})
