/**
 * Synthetic seed for the local Supabase instance.
 *
 * 100% synthetic — never reads production. Populates the minimum data the
 * journeys need: bot profiles (so bots act as onboarded members), board
 * categories, and a set of posts/comments so guest browse/search/feed
 * journeys have content. Member journeys create their own content on top.
 *
 * Idempotent: profiles/categories are upserted; seed posts (tagged with
 * SEED_MARKER) are deleted and recreated each run. Matches / betman games are
 * not seeded here — prediction journeys seed those when they are written.
 */
import { config as loadEnv } from "dotenv"
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Bot } from "./bot-factory"
import { getDailyWindow } from "../../../lib/betman/daily-round"

loadEnv()
loadEnv({ path: ".env.local", override: true })
loadEnv({ path: join(process.cwd(), "tests/e2e/.env.e2e"), override: true })

export const SEED_MARKER = "[E2E시드]"

const CATEGORIES = [
  { slug: "football", name: "축구", sort_order: 1 },
  { slug: "baseball", name: "야구", sort_order: 2 },
  { slug: "basketball", name: "농구", sort_order: 3 },
  { slug: "volleyball", name: "배구", sort_order: 4 },
  { slug: "game", name: "게임", sort_order: 5 },
  { slug: "movies", name: "영화", sort_order: 6 },
  { slug: "music", name: "음악", sort_order: 7 },
  { slug: "free-board", name: "자유게시판", sort_order: 8 },
]

const POSTS_PER_CATEGORY = 3
const tiptapDoc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
})

function localDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("seed: 로컬 Supabase URL/KEY 없음 (.env.e2e 확인)")
  return createClient(url, key, { auth: { persistSession: false } })
}

/** profiles.role 을 승격. trg_prevent_role_self_change(BEFORE UPDATE)가
 *  user→admin/moderator 변경을 막으므로, 트리거를 끈 채
 *  (session_replication_role=replica) 로컬 DB 컨테이너에서 raw SQL 로 갱신한다.
 *  userId 는 Clerk id(영숫자+_), role 은 고정 리터럴이라 안전. */
function promoteRole(userId: string, role: "admin" | "moderator"): void {
  const sql =
    `SET session_replication_role=replica; ` +
    `UPDATE public.profiles SET role='${role}' WHERE user_id='${userId}'; ` +
    `SET session_replication_role=origin;`
  execFileSync(
    "docker",
    ["exec", "supabase_db_community", "psql", "-U", "postgres", "-d", "postgres", "-c", sql],
    { stdio: "pipe" }
  )
}

/** 이전 run 의 e2ebot 프로필을 정리한다. 매 run 봇이 새 Clerk ID 로 생성돼
 *  닉네임 unique index(e2ebot01..10)가 충돌하므로, FK 트리거를 끈 채
 *  (session_replication_role=replica) 삭제한다. 로컬 disposable DB 라 남는
 *  종속 행(posts/activities 등)은 profiles join 에서 자동 제외되어 무해하다. */
function cleanupPriorE2EProfiles(): void {
  const sql =
    `SET session_replication_role=replica; ` +
    `DELETE FROM public.profiles WHERE nickname LIKE 'e2ebot%'; ` +
    `SET session_replication_role=origin;`
  execFileSync(
    "docker",
    ["exec", "supabase_db_community", "psql", "-U", "postgres", "-d", "postgres", "-c", sql],
    { stdio: "pipe" }
  )
}

async function seedProfiles(db: SupabaseClient, bots: Bot[]): Promise<void> {
  // role 은 upsert 에 포함하지 않는다 — prevent_role_self_change 트리거가
  // moderator→user 같은 변경을 막기 때문. 신규 프로필은 컬럼 기본값 'user',
  // 기존 프로필은 role 유지. admin/moderator 승격은 아래 promoteRole 이 담당.
  // is_expert/is_journalist 는 트리거 대상이 아니라 upsert 로 설정 가능.
  const rows = bots.map((b) => ({
    user_id: b.clerkUserId,
    nickname: `e2ebot${String(b.index).padStart(2, "0")}`,
    onboarding_completed: true,
    is_expert: b.index === 3,
    is_journalist: b.index === 4,
  }))
  const { error } = await db.from("profiles").upsert(rows, { onConflict: "user_id" })
  if (error) throw new Error(`seedProfiles 실패: ${error.message}`)

  const adminBot = bots.find((b) => b.index === 1)
  if (adminBot) promoteRole(adminBot.clerkUserId, "admin")
  const modBot = bots.find((b) => b.index === 2)
  if (modBot) promoteRole(modBot.clerkUserId, "moderator")

  console.log(`  ✓ 프로필 ${rows.length}개 (bot01=admin, bot02=moderator)`)
}

async function seedCategories(db: SupabaseClient): Promise<Map<string, string>> {
  const { error } = await db.from("categories").upsert(
    CATEGORIES.map((c) => ({ ...c, is_active: true })),
    { onConflict: "slug" }
  )
  if (error) throw new Error(`seedCategories 실패: ${error.message}`)

  const { data, error: selErr } = await db.from("categories").select("id, slug")
  if (selErr) throw new Error(`seedCategories 조회 실패: ${selErr.message}`)
  const map = new Map<string, string>()
  for (const row of data ?? []) map.set(row.slug as string, row.id as string)
  console.log(`  ✓ 카테고리 ${CATEGORIES.length}개`)
  return map
}

async function seedPosts(
  db: SupabaseClient,
  bots: Bot[],
  catMap: Map<string, string>
): Promise<string[]> {
  // Idempotent: clear previous seed posts (comments cascade or are cleared too).
  await db.from("posts").delete().like("title", `${SEED_MARKER}%`)

  const rows: Record<string, unknown>[] = []
  let n = 0
  for (const cat of CATEGORIES) {
    const categoryId = catMap.get(cat.slug)
    if (!categoryId) continue
    for (let i = 1; i <= POSTS_PER_CATEGORY; i++) {
      const bot = bots[n % bots.length]
      rows.push({
        user_id: bot.clerkUserId,
        category_id: categoryId,
        community_slug: cat.slug,
        title: `${SEED_MARKER} ${cat.name} 게시글 ${i}`,
        content: tiptapDoc(`${cat.name} 게시판 시드 게시글 ${i} 본문입니다.`),
      })
      n++
    }
  }
  const { data, error } = await db.from("posts").insert(rows).select("id")
  if (error) throw new Error(`seedPosts 실패: ${error.message}`)
  console.log(`  ✓ 게시글 ${rows.length}개`)
  return (data ?? []).map((r) => r.id as string)
}

async function seedComments(db: SupabaseClient, bots: Bot[], postIds: string[]): Promise<void> {
  const rows: Record<string, unknown>[] = []
  // Two comments on each of the first six posts.
  for (const postId of postIds.slice(0, 6)) {
    for (let i = 1; i <= 2; i++) {
      const bot = bots[(rows.length + i) % bots.length]
      rows.push({
        post_id: postId,
        user_id: bot.clerkUserId,
        content: `시드 댓글 ${i}`,
      })
    }
  }
  if (rows.length === 0) return
  const { error } = await db.from("comments").insert(rows)
  if (error) throw new Error(`seedComments 실패: ${error.message}`)
  console.log(`  ✓ 댓글 ${rows.length}개`)
}

/**
 * Minimal betman betting data — 1 round + today's daily round + 1 scheduled
 * game with simple home/draw/away odds. Enough to verify the betting journey
 * (odds 선택 → 슬립 제출 → prediction_slips + 토큰 차감). Idempotent.
 */
async function seedBetmanGames(db: SupabaseClient): Promise<void> {
  // 멱등: 삭제 대신 재사용 — 베팅 테스트가 만든 betman_predictions 가 FK 로
  // 게임 삭제를 막으므로, 기존 round/game 이 있으면 재사용하고 match_time 만 갱신.
  let roundId: string
  const { data: existRound } = await db
    .from("betman_rounds")
    .select("id")
    .eq("round", 9999)
    .limit(1)
  if (existRound && existRound.length > 0) {
    roundId = existRound[0].id as string
  } else {
    const { data: round, error: rErr } = await db
      .from("betman_rounds")
      .insert({ year: 2026, round: 9999, status: "open" })
      .select("id")
      .single()
    if (rErr) throw new Error(`seedBetmanGames(round) 실패: ${rErr.message}`)
    roundId = round.id as string
  }

  const now = Date.now()
  const dailyId = new Date(now + 9 * 3_600_000).toISOString().slice(0, 10) // KST 날짜
  const { data: daily, error: dErr } = await db
    .from("betman_daily_rounds")
    .upsert(
      {
        daily_id: dailyId,
        status: "open",
        bet_open_at: new Date(now - 3_600_000).toISOString(),
        bet_close_at: new Date(now + 12 * 3_600_000).toISOString(),
      },
      { onConflict: "daily_id" }
    )
    .select("id")
    .single()
  if (dErr) throw new Error(`seedBetmanGames(daily) 실패: ${dErr.message}`)

  // match_time: 오늘 daily window 안 + 미래(베팅 가능). 새벽(23~08 KST)엔
  // 윈도우가 아직 미래라 now+offset 이 윈도우 밖으로 빠질 수 있어 윈도우 기준 보정.
  const { start: winStart, end: winEnd } = getDailyWindow()
  let matchMs = Math.max(now, winStart.getTime()) + 60 * 60 * 1000
  if (matchMs > winEnd.getTime() - 30 * 60 * 1000) matchMs = winEnd.getTime() - 30 * 60 * 1000

  const matchTime = new Date(matchMs).toISOString()
  const { data: existGame } = await db
    .from("betman_games")
    .select("id")
    .eq("home_team_name", "E2E 홈팀")
    .limit(1)

  if (existGame && existGame.length > 0) {
    // 재사용: match_time 을 다시 미래로 갱신해 베팅 가능 상태 유지
    const { error: uErr } = await db
      .from("betman_games")
      .update({ match_time: matchTime, status: "scheduled", daily_round_id: daily.id })
      .eq("id", existGame[0].id)
    if (uErr) throw new Error(`seedBetmanGames(game update) 실패: ${uErr.message}`)
  } else {
    const { error: gErr } = await db.from("betman_games").insert({
      round_id: roundId,
      daily_round_id: daily.id,
      game_no: 1,
      match_time: matchTime,
      sport: "축구",
      league_code: "EPL",
      game_type: "일반",
      home_team_name: "E2E 홈팀",
      away_team_name: "E2E 원정팀",
      status: "scheduled",
      home_win_odds: 2.0,
      draw_odds: 3.2,
      away_win_odds: 3.5,
    })
    if (gErr) throw new Error(`seedBetmanGames(game) 실패: ${gErr.message}`)
  }
  console.log("  ✓ betman 경기 1개 (오늘 회차)")
}

/**
 * Minimal 월드컵 이벤트 — 등록 진행 중(status=open) 이벤트 1개 + 그룹 3개.
 * 월드컵 등록 저니 검증용. 멱등(slug 재사용).
 */
async function seedWorldcupEvent(db: SupabaseClient): Promise<void> {
  const now = Date.now()
  const d = (days: number) => new Date(now + days * 86_400_000).toISOString()

  const { data: exist } = await db.from("events").select("id").eq("slug", "worldcup-2026").limit(1)

  if (exist && exist.length > 0) {
    await db
      .from("events")
      .update({ status: "open", registration_closes_at: d(7), end_at: d(30) })
      .eq("id", exist[0].id)
  } else {
    const { data: event, error: eErr } = await db
      .from("events")
      .insert({
        slug: "worldcup-2026",
        name: "E2E 월드컵",
        start_at: d(7),
        end_at: d(30),
        registration_closes_at: d(7),
        status: "open",
      })
      .select("id")
      .single()
    if (eErr) throw new Error(`seedWorldcupEvent(event) 실패: ${eErr.message}`)

    const { error: gErr } = await db.from("event_groups").insert([
      { event_id: event.id, slug: "gooner", name: "Gooner", color: "#EF0107", sort_order: 1 },
      { event_id: event.id, slug: "kop", name: "Kopite", color: "#C8102E", sort_order: 2 },
      { event_id: event.id, slug: "blues", name: "Blue", color: "#034694", sort_order: 3 },
    ])
    if (gErr) throw new Error(`seedWorldcupEvent(groups) 실패: ${gErr.message}`)
  }
  console.log("  ✓ 월드컵 이벤트 1개 (그룹 3)")
}

/**
 * 상점 시드 — 봇 골드 충전 + 스티커 팩 1개 + 승인된 스티커 1개.
 * 스티커 구매 저니(골드 차감 → user_stickers) 검증용. 멱등.
 */
async function seedShop(db: SupabaseClient, bots: Bot[]): Promise<void> {
  // 골드 충전 (구매·예측구매 등 골드 경제 저니용)
  const goldRows = bots.map((b) => ({ user_id: b.clerkUserId, gold_balance: 5000 }))
  const { error: gErr } = await db.from("user_gold").upsert(goldRows, { onConflict: "user_id" })
  if (gErr) throw new Error(`seedShop(gold) 실패: ${gErr.message}`)

  let packId: string
  const { data: existPack } = await db
    .from("sticker_packs")
    .select("id")
    .eq("name", "E2E 스티커팩")
    .limit(1)
  if (existPack && existPack.length > 0) {
    packId = existPack[0].id as string
  } else {
    const { data: pack, error: pErr } = await db
      .from("sticker_packs")
      .insert({ name: "E2E 스티커팩", is_active: true })
      .select("id")
      .single()
    if (pErr) throw new Error(`seedShop(pack) 실패: ${pErr.message}`)
    packId = pack.id as string
  }

  // image_url 은 상대 경로 — next/image 의 remotePatterns 호스트 검사를 피함
  // (외부 호스트면 미화이트리스트 시 /shop 렌더가 크래시).
  const stickerData = {
    pack_id: packId,
    creator_id: bots[0].clerkUserId,
    name: "E2E 스티커",
    image_url: "/favicon.ico",
    status: "approved",
    price: 100,
  }
  const { data: existSticker } = await db
    .from("stickers")
    .select("id")
    .eq("name", "E2E 스티커")
    .limit(1)
  if (existSticker && existSticker.length > 0) {
    const { error: uErr } = await db
      .from("stickers")
      .update(stickerData)
      .eq("id", existSticker[0].id)
    if (uErr) throw new Error(`seedShop(sticker update) 실패: ${uErr.message}`)
  } else {
    const { error: sErr } = await db.from("stickers").insert(stickerData)
    if (sErr) throw new Error(`seedShop(sticker) 실패: ${sErr.message}`)
  }
  console.log("  ✓ 상점 (골드 충전 + 스티커팩 1 + 스티커 1)")
}

/** 뉴스 티커 항목 1개 (football 게시판) — 티커 댓글 저니 검증용. 멱등. */
async function seedNewsTicker(db: SupabaseClient): Promise<void> {
  const { data: exist } = await db
    .from("news_ticker_items")
    .select("id")
    .eq("external_id", "e2e-ticker-1")
    .limit(1)
  if (exist && exist.length > 0) {
    console.log("  ✓ 뉴스 티커 1개 (재사용)")
    return
  }
  const { error } = await db.from("news_ticker_items").insert({
    source_id: "e2e",
    community_slug: "football",
    external_id: "e2e-ticker-1",
    external_url: "https://example.com/news",
    original_title: "E2E News Item",
    posted_at: new Date().toISOString(),
    category: "other",
    headline_kr: "E2E 뉴스 티커 헤드라인",
    summary_kr: "E2E 뉴스 티커 요약 본문입니다.",
    ticker_tag: "breaking",
  })
  if (error) throw new Error(`seedNewsTicker 실패: ${error.message}`)
  console.log("  ✓ 뉴스 티커 1개")
}

/** 이상형 월드컵 battle_room 1개(worldcup, active) + 후보 4개. 멱등. */
async function seedBattleWorldcup(db: SupabaseClient, bots: Bot[]): Promise<void> {
  const { data: exist } = await db
    .from("battle_rooms")
    .select("id")
    .eq("title", "E2E 이상형 월드컵")
    .limit(1)
  if (exist && exist.length > 0) {
    console.log("  ✓ 이상형 월드컵 (재사용)")
    return
  }
  const { data: room, error: rErr } = await db
    .from("battle_rooms")
    .insert({
      title: "E2E 이상형 월드컵",
      mode: "worldcup",
      status: "active",
      bracket_size: 4,
      created_by: bots[0].clerkUserId,
    })
    .select("id")
    .single()
  if (rErr) throw new Error(`seedBattleWorldcup(room) 실패: ${rErr.message}`)

  const { error: sErr } = await db.from("battle_sides").insert(
    [1, 2, 3, 4].map((n) => ({
      battle_id: room.id,
      name: `E2E 후보 ${n}`,
      sort_order: n,
    }))
  )
  if (sErr) throw new Error(`seedBattleWorldcup(sides) 실패: ${sErr.message}`)
  console.log("  ✓ 이상형 월드컵 (후보 4)")
}

/**
 * 경기장 기여 시드 — team_id 가 매핑된 post_flair + team_stadium +
 * 봇별 flair 활동점수 잔액. donate_flair_score_to_team RPC 검증용. 멱등.
 */
async function seedStadiumFlair(db: SupabaseClient, bots: Bot[]): Promise<void> {
  const TEAM_ID = "e2e-team"

  // team_map_pins — post_flairs.team_id / team_stadiums 의 FK 대상
  const { data: existPin } = await db
    .from("team_map_pins")
    .select("team_id")
    .eq("team_id", TEAM_ID)
    .limit(1)
  if (!existPin || existPin.length === 0) {
    const { error: pErr } = await db.from("team_map_pins").insert({
      team_id: TEAM_ID,
      team_name: "E2E FC",
      team_short_name: "E2E",
      sport: "football",
      league_id: "EPL",
      city: "E2E City",
      pin_x: 50,
      pin_y: 50,
    })
    if (pErr) throw new Error(`seedStadiumFlair(pin) 실패: ${pErr.message}`)
  }

  let flairId: string
  const { data: existFlair } = await db
    .from("post_flairs")
    .select("id")
    .eq("name", "E2E 팀 플레어")
    .limit(1)
  if (existFlair && existFlair.length > 0) {
    flairId = existFlair[0].id as string
  } else {
    const { data: flair, error: fErr } = await db
      .from("post_flairs")
      .insert({ community_slug: "football", name: "E2E 팀 플레어", team_id: TEAM_ID })
      .select("id")
      .single()
    if (fErr) throw new Error(`seedStadiumFlair(flair) 실패: ${fErr.message}`)
    flairId = flair.id as string
  }

  const { data: existStadium } = await db
    .from("team_stadiums")
    .select("id")
    .eq("team_id", TEAM_ID)
    .limit(1)
  if (!existStadium || existStadium.length === 0) {
    const { error: stErr } = await db
      .from("team_stadiums")
      .insert({ team_id: TEAM_ID, level: 1, total_points: 0 })
    if (stErr) throw new Error(`seedStadiumFlair(stadium) 실패: ${stErr.message}`)
  }

  // 봇별 flair 활동점수 잔액 충전 (기부 가능하게)
  const scoreRows = bots.map((b) => ({
    user_id: b.clerkUserId,
    flair_id: flairId,
    score_total: 2000,
    score_balance: 2000,
  }))
  const { error: scErr } = await db
    .from("user_flair_scores")
    .upsert(scoreRows, { onConflict: "user_id,flair_id" })
  if (scErr) throw new Error(`seedStadiumFlair(scores) 실패: ${scErr.message}`)
  console.log("  ✓ 경기장 기여 (flair + 경기장 + 점수 잔액)")
}

/** 구매 가능한 예측 활동 1개 + 모든 봇의 판매자 팔로우를 시드한다.
 *  홈 "경기 분석글" 탭(/api/feed/predictions)은 팔로우한 유저의 활동만 노출하므로,
 *  예측구매 저니가 항상 "열람" 버튼을 찾을 수 있도록 픽스처를 보장한다.
 *  seedBetmanGames 뒤에 호출해야 한다 (회차/경기 의존). */
async function seedPurchasableActivity(db: SupabaseClient, bots: Bot[]): Promise<void> {
  const seller = bots.find((b) => b.index === 4) // 기자 봇
  if (!seller) return

  const { data: round } = await db
    .from("betman_rounds")
    .select("id")
    .eq("round", 9999)
    .limit(1)
    .single()
  const { data: game } = await db
    .from("betman_games")
    .select("id, daily_round_id, home_win_odds")
    .eq("home_team_name", "E2E 홈팀")
    .limit(1)
    .single()
  if (!round || !game) {
    console.log("  ⚠ 구매 가능 활동 시드 건너뜀 (betman 회차/경기 없음)")
    return
  }
  const roundId = round.id as string
  const dailyRoundId = (game.daily_round_id as string | null) ?? null
  const odds = Number(game.home_win_odds) || 2.0

  const { data: slip, error: slipErr } = await db
    .from("prediction_slips")
    .insert({
      user_id: seller.clerkUserId,
      daily_round_id: dailyRoundId,
      sport: "축구",
      stake: 1,
      total_odds: odds,
      status: "pending",
      analysis_title: "E2E 분석글",
      analysis_text: "E2E 테스트용 예측 분석 본문입니다.",
    })
    .select("id")
    .single()
  if (slipErr) throw new Error(`seedPurchasableActivity(slip) 실패: ${slipErr.message}`)

  const { error: predErr } = await db.from("betman_predictions").insert({
    user_id: seller.clerkUserId,
    game_id: game.id,
    prediction: "home",
    status: "pending",
    round_id: roundId,
    daily_round_id: dailyRoundId,
    stake: 1,
    slip_id: slip.id,
    locked_odds: odds,
  })
  if (predErr) throw new Error(`seedPurchasableActivity(prediction) 실패: ${predErr.message}`)

  const { error: actErr } = await db.from("prediction_activities").upsert(
    {
      user_id: seller.clerkUserId,
      round_id: roundId,
      sport: "축구",
      prediction_count: 1,
      daily_round_id: dailyRoundId,
    },
    { onConflict: "user_id,round_id,sport" }
  )
  if (actErr) throw new Error(`seedPurchasableActivity(activity) 실패: ${actErr.message}`)

  // 봇 새 Clerk ID 는 매 run 신규라 follow 쌍도 신규 — plain insert 로 충분.
  const followRows = bots
    .filter((b) => b.index !== 4)
    .map((b) => ({ follower_id: b.clerkUserId, followed_user_id: seller.clerkUserId }))
  const { error: fErr } = await db.from("user_follows").insert(followRows)
  if (fErr) throw new Error(`seedPurchasableActivity(follows) 실패: ${fErr.message}`)

  console.log("  ✓ 구매 가능 예측 활동 + 팔로우 (판매자 bot04)")
}

/** Populate the local DB. Call after createBots() in globalSetup. */
export async function seedDatabase(bots: Bot[]): Promise<void> {
  if (bots.length === 0) throw new Error("seedDatabase: 봇이 없습니다.")
  const db = localDb()
  console.log("[seed] 합성 시드 적용 중...")
  cleanupPriorE2EProfiles()
  await seedProfiles(db, bots)
  const catMap = await seedCategories(db)
  const postIds = await seedPosts(db, bots, catMap)
  await seedComments(db, bots, postIds)
  await seedBetmanGames(db)
  await seedPurchasableActivity(db, bots)
  await seedWorldcupEvent(db)
  await seedShop(db, bots)
  await seedNewsTicker(db)
  await seedBattleWorldcup(db, bots)
  await seedStadiumFlair(db, bots)
  console.log("[seed] 완료")
}
