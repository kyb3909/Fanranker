/**
 * 시즌 위키 시드 — 팀별 2026-27 시즌 문서 (saga_type='season', D4: identity = 팀+시즌).
 * 1차: 아스날(온보딩 검증 팬덤) + 리버풀·첼시(8/22 Kop/Blues 이벤트 유입 착지).
 *
 * 실행: pnpm exec tsx scripts/saga-seed-seasons.ts
 * 멱등: identity_key upsert — 재실행 안전.
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { identityKey, baseSlug } from "../lib/saga/identity"

const SAGA_BOT = "user_saga_bot"
const SEASON = "2026-27"

interface SeasonTeam {
  teamId: string
  teamKr: string
  /** fpl-players.json 의 team 표기 — 스쿼드 표 매칭 키 */
  teamFpl: string
  /** 관련 이적 사가·경기 매칭용 표기 변형 */
  aliases: string[]
  summary: string
}

const TEAMS: SeasonTeam[] = [
  {
    teamId: "arsenal",
    teamKr: "아스널",
    teamFpl: "Arsenal",
    aliases: ["아스널", "아스날", "Arsenal"],
    summary: "아스널의 2026-27 시즌 — 이적시장, 일정·결과, 스쿼드가 한 문서에 쌓입니다.",
  },
  {
    teamId: "liverpool",
    teamKr: "리버풀",
    teamFpl: "Liverpool",
    aliases: ["리버풀", "Liverpool"],
    summary: "리버풀의 2026-27 시즌 — 이적시장, 일정·결과, 스쿼드가 한 문서에 쌓입니다.",
  },
  {
    teamId: "chelsea",
    teamKr: "첼시",
    teamFpl: "Chelsea",
    aliases: ["첼시", "Chelsea"],
    summary: "첼시의 2026-27 시즌 — 이적시장, 일정·결과, 스쿼드가 한 문서에 쌓입니다.",
  },
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE env 누락")
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", "saga")
    .single()
  if (!category) throw new Error("saga 카테고리 없음")

  for (const team of TEAMS) {
    const subject = {
      team_id: team.teamId,
      team_kr: team.teamKr,
      team_fpl: team.teamFpl,
      aliases: team.aliases,
      season: SEASON,
    }
    const key_ = identityKey("season", subject)
    const title = `${team.teamKr} ${SEASON} 시즌`

    const { data: existing } = await supabase
      .from("sagas")
      .select("slug")
      .eq("identity_key", key_)
      .maybeSingle()
    if (existing) {
      console.log(`존재: /saga/${existing.slug}`)
      continue
    }

    const { data: post, error: postErr } = await supabase
      .from("posts")
      .insert({
        user_id: SAGA_BOT,
        category_id: category.id,
        community_slug: "saga",
        title,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "이 글은 시즌 문서의 토론 앵커입니다." }],
            },
          ],
        },
      })
      .select("id")
      .single()
    if (postErr || !post) throw new Error(`앵커 실패: ${postErr?.message}`)

    const { data: saga, error } = await supabase
      .from("sagas")
      .insert({
        saga_type: "season",
        slug: baseSlug("season", subject),
        title,
        identity_key: key_,
        subject,
        window_key: SEASON,
        summary: team.summary,
        anchor_post_id: post.id,
        stage: "active",
        // 시즌 문서는 루머가 아니다 — 미확인 배너·noindex 대상 아님 (D7 은 transfer 전용)
        is_confirmed: true,
      })
      .select("slug")
      .single()
    if (error || !saga) throw new Error(`시즌 사가 실패: ${error?.message}`)
    console.log(`생성: /saga/${saga.slug}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
