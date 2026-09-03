import { NextRequest, NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { apiError } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { chatParams } from "@/lib/llm/openai-params"
import { logUsage, logUsageFailure } from "@/lib/llm/usage-log"
import { SOCCER_MEME_BOT_USER_ID } from "@/lib/constants/bot-users"
import {
  parseRedditMemeFeed,
  pickMemeCandidates,
  type RedditMemeEntry,
} from "@/lib/reddit/meme-feed"

/**
 * 축구밈봇 — 레딧 축구 밈을 축구 게시판으로 (2026-09-01 운영자 지시).
 *
 * ## 무엇을 하나
 * r/soccercirclejerk 의 **이미지 밈**을 받아 이미지를 우리 스토리지로 옮기고, 제목만
 * 한국어로 옮겨 `football` 게시판에 올린다. 출처는 **레딧이라고 밝힌다.**
 *
 * ## 왜 이미지만인가 — 이게 이 봇의 핵심 판단이다
 * 이 서브레딧 글의 절반은 **텍스트 반어**다("펩 이제 끝났다" = 펩 찬양). 번역하면 뜻이
 * 정반대가 된다. 반면 이미지 밈은 **엠블럼이 언어를 안 타서** 그림만으로 농담이 성립한다.
 * 그래서 "이미지가 있는 글만"이 곧 "번역해도 안전한 글만"이 된다 — 실측으로 확인했다
 * (피드 25건 중 이미지 17건, 걸러진 텍스트 8건이 정확히 반어 글이었다).
 *
 * ⚠️ **댓글은 가져오지 않는다.** 실제 예시 글의 댓글에 실존 인물의 논란(침 뱉기 사건)이
 *    실명으로 오갔다. 명예훼손 영역이라 이미지와 제목까지만 옮긴다.
 * ⚠️ **본문을 지어내지 않는다.** 밈은 그림이 본체다. 우리가 맥락을 설명하려 들면 원문에
 *    없는 사실을 쓰게 된다 — 이 저장소가 리포트에서 겪은 그 병이다. 제목만 옮긴다.
 *
 * ## 출처 표기 (방침 전환)
 * 애그리게이터는 "퍼온 티 내지 말라"는 지시로 출처를 안 남겼는데(2026-07-22), 이 봇은
 * **레딧 출처를 밝힌다**(2026-09-01 운영자). 계정 이름부터 "축구밈봇"이고, 뉴스 쪽의
 * "출처 귀속" 규칙과도 같은 방향이다. `posts.source_name`/`source_url` 에 기록한다.
 *
 * ## 레딧 요율 제한
 * ⚠️ **429 는 고장이 아니라 정상이다.** 레딧은 IP 당 요율을 세게 건다 (실측: 같은 순간
 *    `hot/.rss` 는 200, `.rss`·`top/.rss` 는 429). 실패로 세면 심박 감시가 헛짚는다.
 *    한 회차를 건너뛰고 다음 회차가 이어받는다 — 하루 몇 건이면 충분한 작업이라 이 정도로 족하다.
 *    Vercel 아웃바운드가 영구 차단되면 VPS 층(`/opt/community` agg 사이클)으로 옮긴다.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** 대상 서브레딧 — hot 만 쓴다 (top/new 는 같은 순간에도 429 가 잦다) */
const FEED_URL = "https://www.reddit.com/r/soccercirclejerk/hot/.rss"
const BOARD_SLUG = "football"
const SOURCE_NAME = "Reddit"
const SOURCE_TAG = "reddit:soccercirclejerk"

/** 회차당 발행 수 — 게시판을 밈으로 덮지 않는 선 */
const PER_RUN = 2
/** 하루 상한 */
const DAILY_CAP = 8
/** 이보다 오래된 밈은 안 가져온다 — 시의성이 전부다 */
const MAX_AGE_MS = 48 * 3600_000
/** 제목 번역 모델 — 짧은 출력이라 가장 싼 것으로 (요율표: assignment-desk.ts) */
const TITLE_MODEL = "gpt-5.6-luna"

/**
 * 차단어 — 밈이라도 소재가 정치·사건사고면 안 받는다.
 * `data/agents/config/aggregator.json` 의 `blockedKeywordsEn` 과 같은 뜻이지만, 그 파일은
 * VPS 배포 단위(data/agents)라 Next 앱에서 import 할 수 없어 여기 둔다. 한쪽을 늘리면
 * 다른 쪽도 볼 것.
 */
const BLOCKED_EN = [
  "politic",
  "politics",
  "political",
  "trump",
  "biden",
  "election",
  "israel",
  "gaza",
  "palestine",
  "palestinian",
  "ukraine",
  "russia",
  "war",
  "shooting",
  "shot",
  "gun",
  "police",
  "protest",
  "riot",
  "death",
  "dead",
  "died",
  "die",
  "dies",
  "killed",
  "murder",
  "suicide",
  "rape",
  "racist",
  "racism",
  "nazi",
  "hitler",
  "abuse",
  "assault",
  "cancer",
  "hospital",
  "injury lawsuit",
  "arrested",
  "court",
  "trial",
]

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/atom+xml, application/xml, text/xml",
}

/** 제목 한 줄을 한국어로. 실패하면 null — 영문 제목으로 올리지 않는다 (한글 원칙) */
async function translateTitle(title: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const llmStartedAt = Date.now()
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        ...chatParams(TITLE_MODEL, { temperature: 0, max_tokens: 200 }),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "축구 밈 제목을 한국어로 옮긴다. 규칙: " +
              "①의미를 바꾸지 말 것 — 반어면 반어 그대로 옮긴다(설명하거나 풀어쓰지 않는다). " +
              "②구단·선수 이름은 한국 축구팬이 쓰는 표기로. " +
              "③원문에 없는 내용을 덧붙이지 않는다. " +
              "④해요체가 아니라 밈 제목답게 짧고 건조하게. " +
              "⑤옮길 수 없으면(맥락 부족·고유명사 불확실) ko 를 빈 문자열로. " +
              // ⚠️ `response_format: json_object` 를 쓰면 메시지 어딘가에 "json" 이라는
              //    단어가 **반드시** 들어가야 한다. 없으면 400 이고, 이 경로는 fail-closed
              //    라 에러 없이 발행이 0 이 된다 (실측으로 잡았다).
              'JSON 으로만 답한다. 출력 형식: {"ko":"한국어 제목"}',
          },
          { role: "user", content: title },
        ],
      }),
    })
    if (!res.ok) {
      logUsageFailure(
        "soccer-meme-title",
        TITLE_MODEL,
        `http_${res.status}`,
        Date.now() - llmStartedAt
      )
      return null
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    logUsage("soccer-meme-title", TITLE_MODEL, json, Date.now() - llmStartedAt)
    const raw = json.choices?.[0]?.message?.content
    if (!raw) return null
    const ko = String((JSON.parse(raw) as { ko?: unknown }).ko ?? "").trim()
    // 한글이 없으면 번역이 안 된 것 — 영문을 그대로 올리느니 건너뛴다
    return ko && /[가-힣]/.test(ko) ? ko.slice(0, 120) : null
  } catch {
    return null
  }
}

/** 원본 이미지를 우리 스토리지로. 변환하지 않는다 — gif 애니메이션이 죽고 카톡이 webp 를 못 그린다 */
async function rehostImage(imageUrl: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { headers: { "User-Agent": FETCH_HEADERS["User-Agent"] } })
    if (!res.ok) return null
    const type = res.headers.get("content-type") ?? ""
    if (!/^image\/(png|jpeg|jpg|gif|webp)/.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > 12 * 1024 * 1024) return null
    const ext = type.includes("png")
      ? "png"
      : type.includes("gif")
        ? "gif"
        : type.includes("webp")
          ? "webp"
          : "jpg"
    const path = `agg/meme/${key}.${ext}`
    const { error } = await createServiceRoleClient()
      .storage.from("posts")
      .upload(path, buf, { contentType: type, upsert: true })
    if (error) return null
    return `/storage/posts/${path}`
  } catch {
    return null
  }
}

/** 밈 글 본문 — 이미지 하나 + 출처 한 줄. 해설을 덧붙이지 않는다 */
function buildContent(imageSrc: string, permalink: string) {
  return {
    type: "doc",
    content: [
      { type: "image", attrs: { src: imageSrc, alt: null, title: null } },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "출처: " },
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: permalink, target: "_blank" } }],
            text: "Reddit r/soccercirclejerk",
          },
        ],
      },
    ],
  }
}

async function cronGet(request: NextRequest) {
  const started = Date.now()
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError
    if (process.env.SOCCER_MEME_BOT === "off") {
      return NextResponse.json({ mode: "soccer-meme-bot", skipped: "killswitch" })
    }

    const supabase = createServiceRoleClient()

    // 하루 상한 — 게시판이 밈으로 덮이지 않게
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { count: todayCount } = await supabase
      .from("agg_reservoir")
      .select("id", { count: "exact", head: true })
      .eq("source", SOURCE_TAG)
      .eq("status", "published")
      .gte("published_at", dayAgo)
    if ((todayCount ?? 0) >= DAILY_CAP) {
      return NextResponse.json({ mode: "soccer-meme-bot", skipped: "daily_cap", todayCount })
    }

    // ⚠️ 429 는 정상 — 실패로 세지 않는다
    const res = await fetch(FEED_URL, { headers: FETCH_HEADERS })
    if (!res.ok) {
      return NextResponse.json({
        mode: "soccer-meme-bot",
        feedStatus: res.status,
        note: res.status === 429 ? "레딧 요율 제한 — 다음 회차가 이어받는다" : "피드 실패",
        published: 0,
      })
    }

    const entries = parseRedditMemeFeed(await res.text())

    // 이미 담은 것 제외 (중복 판정은 permalink)
    const { data: seenRows } = await supabase
      .from("agg_reservoir")
      .select("source_url")
      .eq("source", SOURCE_TAG)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 3600_000).toISOString())
    const seen = new Set((seenRows ?? []).map((r) => String(r.source_url)))

    const candidates = pickMemeCandidates(entries, {
      blockedWords: BLOCKED_EN,
      seenPermalinks: seen,
      nowMs: Date.now(),
      maxAgeMs: MAX_AGE_MS,
      limit: PER_RUN,
    })

    const published: string[] = []
    const skipped: { title: string; reason: string }[] = []

    for (const e of candidates as RedditMemeEntry[]) {
      const ko = await translateTitle(e.title)
      if (!ko) {
        skipped.push({ title: e.title.slice(0, 60), reason: "translate_failed" })
        continue
      }
      const src = await rehostImage(e.imageUrl as string, e.id)
      if (!src) {
        skipped.push({ title: e.title.slice(0, 60), reason: "rehost_failed" })
        continue
      }

      const { data: post, error: insErr } = await supabase
        .from("posts")
        .insert({
          user_id: SOCCER_MEME_BOT_USER_ID,
          community_slug: BOARD_SLUG,
          title: ko,
          content: buildContent(src, e.permalink),
          source_name: SOURCE_NAME,
          source_url: e.permalink,
        })
        .select("id")
        .single()
      if (insErr) {
        skipped.push({ title: e.title.slice(0, 60), reason: `insert:${insErr.code ?? "err"}` })
        continue
      }

      // 창고 기록 — 중복 판정과 takedown(post_id 매핑)이 여기 걸린다
      await supabase.from("agg_reservoir").insert({
        source: SOURCE_TAG,
        source_url: e.permalink,
        source_title: e.title,
        category: "축구밈",
        media: [{ type: "image", src, origin: e.imageUrl }],
        rewritten: { title: ko, persona_user_id: SOCCER_MEME_BOT_USER_ID },
        status: "published",
        post_id: post.id,
        published_at: new Date().toISOString(),
        audit: [{ at: new Date().toISOString(), stage: "meme-bot", source_author: e.author }],
      })
      published.push(ko)
    }

    return NextResponse.json({
      mode: "soccer-meme-bot",
      feedEntries: entries.length,
      candidates: candidates.length,
      published,
      skipped,
      duration: `${Date.now() - started}ms`,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

export const GET = withCronLog("soccer-meme-bot", cronGet)
export async function POST(request: NextRequest) {
  return cronGet(request)
}
