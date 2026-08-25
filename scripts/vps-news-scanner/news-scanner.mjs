#!/usr/bin/env node
/**
 * news-scanner.mjs — 스포츠 뉴스 스캐너 (결정적 스캔 + OpenAI 작성. 축구 + NBA)
 *
 * 흐름: 5대리그+인기클럽+r/nba 서브레딧 RSS(hot) → 잡담/오래됨/중복 컷 → OpenAI 가
 *      "정보성 소식 vs 잡담"만 판별 + 한국어 작성 (신뢰도/중요도로 거르지 않음 — 사람 검수 몫)
 *      → 트윗이면 /api/oembed, 기사면 /api/og 로 보강 → /api/news/agent-draft 로 초안 적재.
 * 발행은 안 함. /admin/news-review 에서 사람이 검수·발행 (fail-closed).
 * 소스 목록·상한: SUBREDDITS / SCANNER_MAX_LLM(기본 30) / SCANNER_THROTTLE_MS(기본 65000).
 *
 * ⚠️ 레딧 무인증 예산 = **IP 당 60초에 요청 1건** (2026-08-02 실측, 아래 REDDIT_RATE 주석).
 *    그래서 매 run 전량 순회가 불가능하다 → run 당 일부만 긁고 다음 run 이 이어받는
 *    **회차 로테이션**(rotation.json 커서)으로 45분에 전 소스를 커버한다.
 *
 * 단일 파일·무의존(Node18+). reddit 은 JSON 차단 → curl + RSS(Atom) 로 우회(기존 크롤러 방식).
 * Vultr cron 에서 `node news-scanner.mjs`.
 *
 * env: OPENAI_API_KEY, CRON_SECRET, BASE_URL(기본 https://gongnori.fan),
 *      SEEN_FILE(기본 ./news-scanner-seen.json), SCANNER_MODEL(기본 gpt-4o-mini),
 *      SCANNER_MODEL_LONG(기본 gpt-5.6-terra) — 원문을 확보한 글의 **기사 작성** 모델.
 *        독자가 실제로 읽는 본문을 쓰는 자리라 품질 투자 지점이 여기다.
 *        gpt-5.6-terra 로 올리려면 이 값만 바꾸면 된다(아래 chatParams 가 파라미터를 정리).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"

const BASE_URL = (process.env.BASE_URL || "https://gongnori.fan").replace(/\/$/, "")
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
const SEEN_FILE = process.env.SEEN_FILE || "./news-scanner-seen.json"
const MODEL = process.env.SCANNER_MODEL || "gpt-4o-mini"
/**
 * 기사 **작성** 모델. 2026-08-25 운영자 지시로 gpt-4.1-mini → gpt-5.1 로 올렸다.
 *
 * 계기: 원문이 한 문장뿐인 아스널 기사에 "프랑스에서 이고르 파이샤오 영입설이 돌고 있다"가
 * 붙어 나왔다. 원문 317자 전체에 그 이름이 없다 — 통째로 지어낸 이적설이다.
 * 작은 모델은 재료가 얇을수록 그럴듯한 문장으로 빈칸을 메우려 든다.
 *
 * 2026-08-25 2차 상향: 5.1 → **gpt-5.6-terra** (운영자 "더 올려보면 어때?").
 * 같은 사고 재료로 실측 비교했더니 terra 가 눈에 띄게 나았다:
 *   terra "아스널, 촐리스 영입에도 추가 왼쪽 윙어 검토"  ← 원문 그대로, 군더더기 없음
 *   5.1   "…영입했음에도 … 구단은 적합한 자원이 시장에 나오면…"  ← 같은 말 반복·부연
 *
 * ⚠️ **검사관도 terra 다** (`lib/news/quality-gate.ts`). 그 파일 주석의 "검사관은 작성보다
 *    한 급 위" 라는 전제가 이제 성립하지 않는다 — 자기가 쓴 걸 자기가 검사한다.
 *    실제 방어는 결정론 가드(날짜·이름 검증)가 하므로 당장 큰 구멍은 아니지만,
 *    **한 번에 하나만 바꿔 효과를 보려고** 검사관은 그대로 뒀다. 오탐/누락이 늘면
 *    검사관을 다른 모델로 떼어낼 것.
 * ⚠️ gpt-5 계열은 temperature(≠1)·max_tokens 를 거부한다. 위 chatParams 가 그걸 흡수한다.
 * ⚠️ 비용: 4.1-mini 대비 호출당 약 6배(입력 5배·출력 7.5배). 장문 초안 하루 수십 건
 *    기준 월 $30~50 수준 — 기사 품질이 사이트의 핵심이라 감당할 만하다.
 */
const MODEL_LONG = process.env.SCANNER_MODEL_LONG || "gpt-5.6-terra"
const DRY_RUN = process.env.SCANNER_DRY_RUN === "1" // 초안 적재 없이 판별 로그만 (테스트용)

/**
 * 모델 세대에 맞는 파라미터만 내보낸다. lib/llm/openai-params.ts 와 같은 규율이지만
 * 이 파일은 **무의존 단일 파일**(VPS 배포 단위)이라 import 대신 복제한다 — 한쪽을
 * 고치면 다른 쪽도 고칠 것.
 *
 * 2026-08-09 실측: gpt-5.6-terra 는 temperature(≠1)·top_p·max_tokens 를 400 으로 거부한다.
 * 이 가드가 없으면 SCANNER_MODEL_LONG 을 terra 로 바꾸는 순간 그 글들이 전건 실패한다.
 */
function chatParams(model, params = {}) {
  if (!/^gpt-5/i.test(model)) return { model, ...params }

  const { temperature: _temperature, top_p: _topP, max_tokens: maxTokens, ...rest } = params
  return maxTokens === undefined
    ? { model, ...rest }
    : { model, ...rest, max_completion_tokens: maxTokens }
}

const LOOKBACK_HOURS = 24 // 이보다 오래된 글은 무시 (신선도)
const MAX_LLM_PER_RUN = Number(process.env.SCANNER_MAX_LLM || 30) // run 당 OpenAI 호출 상한 (비용 가드)
const RSS_LIMIT = 40

/**
 * REDDIT_RATE — 무인증 레딧 RSS 는 IP 당 60초에 요청 1건이다.
 *
 * 2026-08-02 VPS 실측: 첫 요청 200 + `x-ratelimit-used: 1 / remaining: 0.0 / reset: 48`,
 * 직후 요청은 전부 429(본문 0바이트). 6초 간격으로 16개를 돌던 기존 코드가 매 run
 * "2/16개 소스" 였던 원인 — 서브레딧이 막힌 게 아니라 96초 순회 중 60초 경계를 한 번만
 * 넘었을 뿐이다(그래서 성공 자리가 첼시↔맨시티로 돌아다녔다).
 *
 * 예산 계산: cron 15분 = 요청 15건. 화력 측정과 나눠 쓰고 cron 겹침 여유를 남겨 12건으로
 * 잡는다(12 × 65초 = 13분). 근본 해결은 OAuth(oauth.reddit.com, 100건/분) 전환.
 */
const THROTTLE_MS = Number(process.env.SCANNER_THROTTLE_MS || 65000) // 요청 간격 (60초 창 + 여유)
const SCAN_SUBS_PER_RUN = Number(process.env.SCANNER_SUBS_PER_RUN || 5) // r/soccer 는 별도 고정
// 단계별 벽시계 상한 — 429 재시도가 겹쳐 run 이 늘어져도 cron(15분)을 침범하지 않게 자른다.
// 스캔 6건(6.5분) + 화력 6건(6.5분) = 13분이 정상 경로, 여기에 여유를 둔 컷오프.
const RUN_STARTED_AT = Date.now()
const SCAN_DEADLINE_MS = Number(process.env.SCANNER_SCAN_DEADLINE_MS || 7.5 * 60 * 1000)
const HEAT_DEADLINE_MS = Number(process.env.SCANNER_HEAT_DEADLINE_MS || 14 * 60 * 1000)
const UA = "gongnori.fan news-scanner/1.0"
// reddit 은 Node TLS 지문/JSON 을 차단 → curl + 브라우저 UA + RSS 로 우회 (기존 크롤러와 동일)
const REDDIT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// 수집 소스: r/soccer 종합 + 5대리그 + 인기 클럽 + r/nba. 이적설만이 아니라 뉴스 전반을 폭넓게 긁는다.
// 관련성/품질 판단은 사람 검수(/admin/news-review)로 이관 — 여기서는 명백한 잡담만 컷.
const SUBREDDITS = [
  "soccer",
  "PremierLeague",
  "LaLiga",
  "Bundesliga",
  "seriea",
  "ligue1",
  "Gunners",
  "LiverpoolFC",
  "reddevils",
  "chelseafc",
  "MCFC",
  "coys",
  "ManchesterUnited",
  "realmadrid",
  "Barca",
  "FCBayern",
  // "nba" — 일시 정지 (2026-08-23 운영자: "농구는 멈춰줘 일단" — 레딧 예산 포화 완화).
  //         NBA 는 9월 말 오픈이라 그 전에 이 줄을 복원해 수집을 재개할 것.
  //         (원 코멘트: 회전 풀 전용 — 24h lookback + seen 중복 방지로 유실 없음)
]

// 서브레딧 → 종목. 미등재는 축구. 발행 게시판 라우팅(lib/news/publish SPORT_BOARDS)과
// 프롬프트(에디터 정체성·worthy 기준·표기 규칙)가 이 값을 따라간다.
const SUB_SPORT = { nba: "basketball" }
const sportOf = (sub) => SUB_SPORT[sub] || "football"

// 종목별 프롬프트 조각 — 에디터 정체성·worthy 예시·표기 예시만 갈아끼운다.
// 나머지 규율(출처 귀속·드라이 톤·분석 금지·한국어 제목)은 종목 공통 — 그건 매체
// 규칙이지 종목 규칙이 아니다.
const SPORT_PROMPTS = {
  football: {
    label: "축구",
    worthyList:
      "이적·영입·계약·부상·복귀·감독 선임/경질·경기 결과·기록·수상/후보·공식 발표·**인터뷰·기자회견 발언**·구단/선수 근황·유망주·한국 선수",
    notationExamples: "예: Bournemouth=본머스, Tottenham=토트넘, Wolverhampton=울버햄튼",
  },
  basketball: {
    label: "농구(NBA)",
    worthyList:
      "트레이드·FA 계약·연장·부상·복귀·감독 선임/경질·경기 결과·기록·수상/후보·드래프트·공식 발표·**인터뷰·기자회견 발언**·구단/선수 근황·유망주·한국 선수",
    notationExamples:
      "예: LeBron James=르브론 제임스, Golden State Warriors=골든스테이트 워리어스, Victor Wembanyama=빅터 웸반야마",
  },
}

// r/soccer 는 종합·최대 물량이라 매 run 고정, 나머지는 회차 순환 (REDDIT_RATE 참조).
const ALWAYS_SUB = "soccer"
const ROTATING_SUBS = SUBREDDITS.filter((s) => s !== ALWAYS_SUB)

// 잡담/스레드 컷
const SKIP_AUTHORS = new Set(["AutoModerator", "2soccer2bot", "MatchThreadder"])
const SKIP_PATTERNS = [
  /^daily discussion/i, // r/nba 는 "Daily Discussion Thread (날짜)" 꼴 — 끝 앵커를 풀어야 잡힌다
  /^free talk/i,
  /match thread/i,
  /game thread/i, // r/nba: "Game Thread" / "Post-Game Thread"
  /^monday moan/i,
  /^\[?(megathread|match thread)\]?/i,
  /weekly.*(thread|discussion|megathread)/i,
  /monthly.*(thread|discussion|megathread)/i,
  /^(meta|mod) (post|announcement)/i,
]

function log(...a) {
  console.log(`[${new Date().toISOString()}]`, ...a)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 한글 표기 교정 — gpt-4o-mini 가 자주 음차 오류를 내는 팀/선수명을 LLM 출력 후처리로 강제.
// 프롬프트만으론 반복 오역이 남아서(예: Bournemouth→"보르넘"), 마지막에 결정적으로 치환한다.
// 새 오표기를 발견하면 여기 한 줄만 추가하면 이후 전부 교정됨.
const KOREAN_FIXES = [
  [/보르넘|본머쓰|보른머스|본머프/g, "본머스"], // Bournemouth
  // 경기장 이름 (2026-08-14 오발행 — "스타디움 브리지"가 그대로 나갔다).
  // 구장은 선수·구단 사전에 없어서 표기 게이트를 그냥 통과한다 → 여기서 결정적으로 막는다.
  [/스타디움 브리지|스탬퍼드 브릿지|스탬포드 브릿지|스탠포드 브리지/g, "스탬포드 브리지"], // Stamford Bridge
  [/크라벤 코티지|크레이본 코티지/g, "크레이븐 코티지"], // Craven Cottage
  [/도나바스 아레나|돈바시 아레나/g, "돈바스 아레나"], // Donbass Arena
  [/올드 트라포드|올드트래포드/g, "올드 트래포드"], // Old Trafford
  [/에미리트 스타디움|에미레이트 스타디움/g, "에미레이츠 스타디움"], // Emirates Stadium
]

/**
 * 레딧을 출처로 표기하지 않는다.
 *
 * 레딧은 소식을 **발견한 경로**이지 출처가 아니다. "[레딧] 아시아 투어 명단" 같은
 * 제목은 우리가 남의 글을 퍼온 것처럼 보이게 만든다(사용자 지적 2026-07-29).
 * 프롬프트로만 막으면 새는 걸 이미 겪었으므로(매체명 표기 사례) 코드에서 잘라낸다.
 */
function stripRedditAttribution(title) {
  if (typeof title !== "string") return title
  // 선두의 [레딧]/[Reddit]/[r/soccer] 류 제거 — 여러 번 붙어도 전부
  let out = title.replace(/^\s*(?:\[\s*(?:레딧|reddit|r\/[a-z0-9_]+)\s*\]\s*)+/gi, "")
  // "[레딧 - 로마노]" 처럼 안에 섞인 경우엔 레딧 부분만 덜어낸다
  out = out.replace(/\[\s*(?:레딧|reddit)\s*[-·|]\s*/gi, "[")
  return out.trim() || title.trim()
}
/**
 * 제목이 한국어로 작성됐는지 — 앞머리 [기자]/[매체] 브래킷을 떼고 한글 음절 수로 판정.
 *
 * 왜 코드 가드인가: 프롬프트에 한국어 지시가 있어도 LLM 이 가끔 원문 영어 제목을
 * 그대로 흘린다 (실사례 2026-08-02: "[BBC] Alan Shearer: Challenging times ahead ...").
 * 자동발행 정지 사유 중 하나가 "영어 미번역 기사"였으므로(2026-07-30) 결정적으로 막는다.
 * 기자명·매체명 브래킷과 제목 속 고유명사 영문은 허용 — 검사 대상은 브래킷 뒤 본문뿐.
 */
function isKoreanTitle(title) {
  if (typeof title !== "string") return false
  const body = title.replace(/^\s*(?:\[[^\]]{1,24}\]\s*)+/, "")
  const hangul = (body.match(/[가-힣]/g) || []).length
  return hangul >= 2
}

function applyKoreanFixes(s) {
  if (typeof s !== "string" || !s) return s
  let out = s
  for (const [re, to] of KOREAN_FIXES) out = out.replace(re, to)
  return out
}

function loadSeen() {
  try {
    if (existsSync(SEEN_FILE)) return new Set(JSON.parse(readFileSync(SEEN_FILE, "utf8")))
  } catch (e) {
    log("seen load 실패:", e.message)
  }
  return new Set()
}
function saveSeen(seen) {
  try {
    writeFileSync(SEEN_FILE, JSON.stringify([...seen].slice(-2000)))
  } catch (e) {
    log("seen save 실패:", e.message)
  }
}

// ── 회차 로테이션 커서 ──────────────────────────────────────────────
// 레딧 예산상 매 run 전량 순회가 불가능하므로(REDDIT_RATE), 이번 run 이 어디까지 긁었는지
// 파일에 남겨 다음 run 이 이어받는다. 유실돼도 0부터 다시 도는 것뿐이라 치명적이지 않다.
const ROTATION_FILE =
  process.env.SCANNER_ROTATION_FILE || SEEN_FILE.replace(/[^/\\]+$/, "rotation.json")

function loadRotation() {
  try {
    if (existsSync(ROTATION_FILE)) {
      const r = JSON.parse(readFileSync(ROTATION_FILE, "utf8"))
      return { scan: Number(r.scan) || 0, heat: Number(r.heat) || 0 }
    }
  } catch (e) {
    log("rotation load 실패:", e.message)
  }
  return { scan: 0, heat: 0 }
}
function saveRotation(r) {
  try {
    writeFileSync(ROTATION_FILE, JSON.stringify(r))
  } catch (e) {
    log("rotation save 실패:", e.message)
  }
}
/** list 에서 cursor 부터 count 개를 순환 추출 */
function pickRotating(list, cursor, count) {
  const n = Math.min(count, list.length)
  const out = []
  for (let i = 0; i < n; i++) out.push(list[(cursor + i) % list.length])
  return out
}

// ── reddit RSS (Atom) ───────────────────────────────────────────────
// 헤더 덤프 경로 — 429 판별과 x-ratelimit-reset 회수용. 단일 프로세스라 고정 경로로 충분.
// (VPS curl 7.81 은 `-w %header{}` 미지원 → -D 파일 경유)
const HEADER_FILE = "/tmp/news-scanner-headers.txt"

/** 레딧 1회 요청 — 본문뿐 아니라 상태코드·리셋까지 돌려준다 (429 를 조용히 삼키지 않기 위함) */
function curlReddit(url) {
  let body = ""
  try {
    body = execFileSync(
      "curl",
      ["-s", "-L", "-D", HEADER_FILE, "-H", `User-Agent: ${REDDIT_UA}`, "--max-time", "20", url],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    )
  } catch {
    return { status: 0, body: "", reset: null }
  }
  let status = 0
  let reset = null
  try {
    const dump = readFileSync(HEADER_FILE, "utf8")
    // -L 로 리다이렉트되면 헤더 블록이 여러 개 — 마지막(최종 응답)만 본다
    const blocks = dump.split(/\r?\n\r?\n/).filter((b) => /^HTTP\//m.test(b))
    const last = blocks[blocks.length - 1] || dump
    const sm = last.match(/^HTTP\/[\d.]+\s+(\d{3})/m)
    if (sm) status = Number(sm[1])
    const rm = last.match(/^x-ratelimit-reset:\s*([\d.]+)/im)
    if (rm) reset = Math.ceil(Number(rm[1]))
  } catch {
    /* 헤더를 못 읽으면 본문 유무로만 판단 */
  }
  return { status, body, reset }
}

/**
 * 429 면 레딧이 알려준 reset 초만큼 자고 1회 재시도.
 * 고정 간격만으론 다른 프로세스(크롤러 등)와 겹쳤을 때 회복이 안 돼서 필요하다.
 */
async function redditFetch(url, label) {
  let r = curlReddit(url)
  if (r.status === 429) {
    const waitMs = Math.min(r.reset ?? 60, 120) * 1000 + 2000
    log(`429 (${label}) — reset ${r.reset ?? "?"}초, ${Math.round(waitMs / 1000)}초 대기 후 재시도`)
    await sleep(waitMs)
    r = curlReddit(url)
  }
  return r
}
function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  return m ? m[1].trim() : null
}
function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`))
  return m ? m[1] : null
}
function extractNestedTag(xml, parent, child) {
  const pm = xml.match(new RegExp(`<${parent}>[\\s\\S]*?<\\/${parent}>`))
  return pm ? extractTag(pm[0], child) : null
}
function decodeHTML(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}
function parseAtomFeed(xml) {
  const entries = []
  const re = /<entry>([\s\S]*?)<\/entry>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    const id = (extractTag(block, "id") || "").replace("t3_", "")
    const title = decodeHTML(extractTag(block, "title") || "")
    const link = extractAttr(block, "link", "href") || ""
    const published = extractTag(block, "published") || extractTag(block, "updated") || ""
    const author = extractNestedTag(block, "author", "name") || ""
    // content HTML 안의 [link] 앵커에서 외부 URL 추출
    const content = decodeHTML(extractTag(block, "content") || "")
    let contentLink = null
    const lm = content.match(/\[link\]<\/a>/)
    if (lm) {
      const hm = content.slice(0, lm.index).match(/href="([^"]+)"[^>]*>\s*$/)
      if (hm && !hm[1].includes("reddit.com/r/")) contentLink = hm[1]
    }
    entries.push({ id, title, permalink: link, url: contentLink, author, published })
  }
  return entries
}
async function fetchSubreddit(sub) {
  const url = `https://www.reddit.com/r/${sub}/hot.rss?limit=${RSS_LIMIT}`
  const { status, body: xml } = await redditFetch(url, `r/${sub}`)
  if (status === 429) throw new Error(`레이트리밋 429 (r/${sub}) — 재시도도 실패`)
  if (!xml || !xml.includes("<entry"))
    throw new Error(`비정상 응답 (r/${sub}, HTTP ${status || "?"})`)
  return parseAtomFeed(xml).map((e) => ({ ...e, subreddit: sub }))
}

// ── 소스 분류 ───────────────────────────────────────────────────────
function isExternalArticle(u) {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "")
    // bsky·streamable 은 기사가 아니라 소셜/영상 소스 — 본문 <p> 추출이 무의미하다
    if (
      /reddit\.com|redd\.it|x\.com|twitter\.com|youtube\.com|youtu\.be|instagram\.com|bsky\.app|streamable\.com/.test(
        h
      )
    )
      return false
    if (/\.(jpg|jpeg|png|gif|webp|mp4|gifv)$/i.test(u)) return false
    return true
  } catch {
    return false
  }
}
function isTweet(u) {
  return /(?:twitter\.com|x\.com)\/\w+\/status(?:es)?\/\d+/i.test(u || "")
}
// NBA 기자 다수가 X → Bluesky 로 이동 (2026-08 실측: r/nba 상위 소스가 bsky.app).
// 트윗과 같은 급의 소셜 소스로 취급 — 포스트 전문을 재료로, 원문은 임베드로.
function isBsky(u) {
  return /bsky\.app\/profile\/[^/]+\/post\/[a-zA-Z0-9]+/i.test(u || "")
}
// 스트리머블 = 인터뷰/기자회견 클립 영상. 원문이 곧 영상이라 임베드가 본체다.
/**
 * 재료가 **기사가 아니라 차단·안내 페이지**인가 (2026-08-25 실사고).
 *
 * 실제로 이런 재료로 기사가 발행됐다 — 313자짜리 봇 차단 안내문:
 *   "This takes a couple of seconds and happens automatically. ...
 *    reference ID: no_id_generated"
 * 그런데 발행된 기사엔 마르티넬리 이적료 6,000만 유로, 이투아노 수수료 15~20% 까지
 * 적혀 있었다. **재료에 아무것도 없으니 전부 지어낸 것이다.**
 *
 * 재료가 쓰레기면 아무리 좋은 모델을 써도 결과는 환각이다. 모델·프롬프트로 풀 문제가
 * 아니라 **입구에서 막을 문제**다. 실측 889건 중 7건(발행 4건) — 드물지만 걸리면 100%다.
 *
 * ⚠️ 낱말이 **본문 어딘가에 있는지**로 보면 안 된다. 멀쩡한 기사 뒤에 사이트 위젯 문구가
 *    붙는 일이 흔해서 정상 기사를 죽인다 (실측: 포함으로 세면 10%가 걸리는데 열어보니
 *    전부 멀쩡했다).
 *    가르는 기준은 **위치**다 — 차단 페이지는 그 문구로 **시작하고**, 정상 기사는 끝에
 *    덧붙는다. 그래서 재료 **앞머리**에 있을 때만 차단으로 본다.
 */
const BLOCK_PAGE_RE =
  /automated checks|checking your browser|verify (?:you are|that you are) (?:a )?human|please enable javascript|reference id:\s*no_id|access denied|are you a robot|subscribe to continue reading|sign in to read/i

function isBlockPage(text) {
  const t = String(text || "").replace(/^\s*\[기사 발췌\]\s*/, "")
  const head = t.slice(0, 150) // 차단 페이지는 첫 문장부터 안내다. 250 이면 기사 뒤 위젯까지 물었다(실측)
  return BLOCK_PAGE_RE.test(head)
}

function isStreamable(u) {
  return /streamable\.com\/(?:[eosm]\/)?[a-zA-Z0-9]+/i.test(u || "")
}

// ── 기사 원문 본문 추출 ──────────────────────────────────────────────
// 왜: LLM 에 제목·링크만 주면 2~3문장짜리 껍데기 기사밖에 안 나온다("제목밖에 없다").
// 원문 문단을 팩트 재료로 주면 인용·이적료·계약기간·일정까지 담긴 기사가 된다.
// readability 라이브러리 없이 <p> 수집 + 보일러플레이트 컷으로 최소 구현.
const BOILERPLATE_P =
  /cookie|subscri|newsletter|sign up|sign in|log in|all rights reserved|privacy policy|terms of (use|service)|follow us|download the app|advertis|getty images|©|enable javascript|update your browser|whitelist your extensions|verify (that )?you are|are you a robot|captcha|browser (check|settings)|ad blocker|please disable/i

function extractArticleText(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<template[\s\S]*?<\/template>/gi, "")

  const paragraphs = []
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  let m
  let total = 0
  while ((m = pRegex.exec(stripped)) !== null && total < 2800) {
    const text = decodeHTML(m[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
    if (text.length < 40 || BOILERPLATE_P.test(text)) continue
    paragraphs.push(text)
    total += text.length
  }
  return paragraphs.length ? paragraphs.join("\n").slice(0, 2800) : null
}

/**
 * JSON-LD(NewsArticle.articleBody) 에서 기사 전문 추출 — <p> 추출이 막히는
 * JS렌더/독특한 마크업 사이트도 SEO 용으로 이건 심어두는 경우가 많다.
 * 실측 44% 였던 본문 확보율을 끌어올리는 1차 보강.
 */
function extractJsonLdBody(html) {
  const found = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    try {
      const stack = [JSON.parse(m[1].trim())]
      while (stack.length) {
        const cur = stack.pop()
        if (!cur || typeof cur !== "object") continue
        if (typeof cur.articleBody === "string" && cur.articleBody.trim().length > 200) {
          found.push(cur.articleBody.trim())
        }
        for (const v of Object.values(cur)) if (v && typeof v === "object") stack.push(v)
      }
    } catch {
      /* 깨진 JSON-LD 는 흔하다 — 무시 */
    }
  }
  if (!found.length) return null
  const best = found.sort((a, b) => b.length - a.length)[0]
  return decodeHTML(best).replace(/[ \t]+/g, " ").trim().slice(0, 2800)
}

/** og:description — 최후의 재료. 짧지만(150~300자) 제목뿐인 것보단 낫다 */
function extractOgDescription(html) {
  const m =
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i.exec(html)
  const text = m ? decodeHTML(m[1]).trim() : null
  return text && text.length >= 80 ? text : null
}

/**
 * 기사 URL → 본문 앞부분(~2,800자). 실패(페이월·JS렌더·차단)하면 null —
 * 그 경우 기존처럼 짧은 기사로 나간다 (팩트 없이 길이를 늘리면 환각이다).
 */
async function fetchArticleBody(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": REDDIT_UA },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    })
    if (!res.ok) return null
    // 뉴스 사이트는 헤더/스크립트 프리앰블이 커서 본문 <p> 가 한참 뒤에 나온다
    // (BBC 실측 첫 <p> 가 157KB 지점) → 450KB 까지 읽는다.
    const reader = res.body.getReader()
    let html = ""
    while (html.length < 450000) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
    }
    reader.cancel()
    // 확보량 우선: <p> 추출 ↔ JSON-LD 중 긴 쪽 → 둘 다 실패 시 og:description
    const fromP = extractArticleText(html)
    const fromLd = extractJsonLdBody(html)
    const best = (fromLd?.length ?? 0) > (fromP?.length ?? 0) ? fromLd : fromP
    return best ?? extractOgDescription(html)
  } catch {
    return null
  }
}

/**
 * OpenAI: 게시할 만한 신선한 주요 이적설인지 판별 + 한국어 초안 작성 (JSON)
 * material: { kind: "article"|"tweet", text, author? } — 확보한 원문 재료 (없으면 null)
 */
async function judgeAndWrite(
  post,
  corrections = { examples: [], articles: [], naming: [] },
  material = null,
  retryNote = ""
) {
  const sourceKind = isTweet(post.url)
    ? "tweet"
    : isBsky(post.url)
      ? "bsky"
      : isStreamable(post.url)
        ? "video"
        : isExternalArticle(post.url)
          ? "article"
          : "none"
  // few-shot — 검수자가 실제로 고친 사례를 예시로 주입해 표기/스타일을 학습시킨다.
  const { examples = [], articles = [], naming = [] } = corrections
  // 확정 표기 — 제목과 원문 재료에 등장하는 고유명사만 골라 싣는다 (예방층)
  const namingHints = buildNamingHints(naming, `${post.title || ""}\n${material?.text || ""}`)
  const fewshot = examples.length
    ? `\n\n## 최근 검수 교정 예시 (원본 → 발행본)\n검수자가 아래처럼 다듬었다. 같은 표기·스타일(특히 팀·선수·기자명 한글 표기)을 따르라:\n${examples
        .map((e) => `- "${e.from}" → "${e.to}"`)
        .join("\n")}`
    : ""
  // 기사 재작성 few-shot — 검수자가 봇 초안을 통째로 다시 쓴 사례. 문장 구조·문단
  // 배치·정보 밀도를 이 최종본처럼 쓰라고 지시한다 (표기 사전보다 상위의 스타일 학습).
  const styleshot = articles.length
    ? `\n\n## 검수자가 기사를 다시 쓴 예시 ${articles.length}건 (봇 초안 → 검수자 최종본)\n검수자는 봇 초안을 아래 "최종본"처럼 고쳐 쓴다. 처음부터 최종본의 문장 구조·문단 흐름·정보 밀도로 써라 (내용은 당연히 지금 글의 재료에서만):\n${articles
        .map(
          (a, i) =>
            `[예시 ${i + 1} — 봇 초안]\n${a.beforeTitle ? `제목: ${a.beforeTitle}\n` : ""}${a.before}\n[예시 ${i + 1} — 검수자 최종본]\n${a.afterTitle ? `제목: ${a.afterTitle}\n` : ""}${a.after}`
        )
        .join("\n\n")}`
    : ""
  const sp = SPORT_PROMPTS[sportOf(post.subreddit)] || SPORT_PROMPTS.football
  const sys = `너는 한국 ${sp.label} 커뮤니티의 뉴스 에디터다. 레딧 ${sp.label} 글 하나를 받아 "정보성 ${sp.label} 소식인가 vs 순수 잡담인가"만 가른다. 기본값은 통과(worthy=true)이고, 애매하면 통과시킨다. 최종 취사선택은 사람 편집자가 검수에서 한다.

worthy=true (폭넓게): ${sp.worthyList} 등 ${sp.label}와 관련해 사실 정보가 담긴 것이면 전부. 무명 선수·유망주·미확정 루머·낮은 신뢰도도 관련 있으면 통과. 신뢰도/중요도가 낮다고 버리지 마라 — 그 판단은 사람 몫이다.

worthy=false (좁게, 정보가 0인 것만): 순수 밈·짤·GIF·팬아트·움짤, 정보 없는 단순 감탄/응원("wow", "amazing"), 개인 SNS 좋아요/반응 캡처, 라이브 경기 중계 스레드, 설문/의견 질문글, 오래된 떡밥 재탕. 애매하면 false 말고 true.

⛔ **분석·칼럼·오피니언은 무조건 worthy=false** (운영자 지시 2026-08-09).
사실 보도가 아니라 **필자의 견해·해석이 본체**인 글 — 전술 분석·선수 평가·평점·랭킹·
베스트11·"~는 어떤 역할을 할까" 류 전망·롱리드 피처. 매체가 ESPN·디 애슬레틱처럼
크든 작든 무관하다. 이유 둘: ① 옮길 사실이 없어서 "~에 대한 분석이 포함되어 있습니다"
같은 빈 껍데기 기사가 된다 ② 필자의 창작물을 요약하는 것이라 저작권 문제가 된다.
**이 규칙은 위의 "애매하면 통과" 원칙보다 우선한다** — 사실 보도인지 견해인지 애매하면
worthy=false 로 버려라. (이적료·계약 기간·부상 진단명처럼 **검증 가능한 사실**이 본체면
분석 글이 아니라 보도이므로 통과.)

⛔ **빅리그 밖 소식은 원칙적으로 worthy=false** (운영자 지시 2026-08-15).
통과 대상: **5대 리그(프리미어리그·라리가·세리에A·분데스리가·리그1)**, **유럽 대항전
(챔피언스리그·유로파·컨퍼런스리그)**, 그리고 **FIFA·UEFA 차원의 중요 소식**(월드컵,
대표팀 A매치, 국제 대회 규정·징계처럼 판 전체에 영향을 주는 것).
버릴 대상: 그 밖의 리그 단독 소식 — MLS·사우디·튀르키예·우크라이나·남미 국내리그·
2부 리그 등. 그 리그 안에서만 의미 있는 이적·경기 결과·구단 행정은 통과시키지 마라.
예외 둘: ① **한국 선수**가 주인공이면 리그 불문 통과 ② 빅리그 구단·선수가 실제로
얽힌 건이면 통과(예: 타 리그 구단이 빅리그 구장을 쓰는 문제, 빅리그 이적 임박).

- 톤: 한국어, 드라이한 팩트 와이어체("~라고 합니다", "~로 전해집니다"). AI 티 나는 감상/질문/평가 금지.
- **출처를 본문에 밝힌다** (운영자 지시 2026-08-09). 첫 문장은 누구의 보도인지로 연다:
  기자까지 확인되면 "디 애슬레틱의 데이비드 온스테인에 따르면", 매체만 확인되면
  "BBC 보도에 따르면", 구단·선수 공식 채널이면 "아스날 공식 발표에 따르면".
  ⛔ 확인되지 않은 매체·기자 이름을 지어내지 마라 — 재료(기사 원문·트윗 작성자·제목의
  대괄호)에 실재하는 이름만 쓴다. 출처가 불명확하면 귀속 문구 없이 사실만 쓴다.
  ⛔ 레딧은 출처가 아니다 (발견 경로일 뿐).
- **요점만, 그러나 요점은 전부** (운영자 지시 2026-08-09). 분량 목표도 상한도 없다 —
  길이는 재료에 요점이 몇 개 있느냐가 정한다. 원문에 중요한 사실이 많으면 500~1,000자가
  되는 게 맞고, 적으면 두세 문장이 맞다.
  · **넣을 것**: 누가·무엇을·언제·얼마에·다음 절차. 이적료·계약 기간·조항·경기 기록 같은
    수치, 실제 발언 인용, 경위와 일정. 원문에 있는 중요한 사실을 빠뜨리는 것이 **가장 큰 실패**다.
  · **뺄 것**: 재료에 없는 배경 설명·전망·의미 부여·감상. 분량을 채우려는 덧말. 같은 사실을
    표현만 바꿔 반복하는 것.
  요컨대 **압축이지 생략이 아니다** — 군더더기 없이 쓰되 중요한 건 하나도 버리지 마라.
  재료가 제목뿐이면 제목에 실재하는 정보만으로 짧게 (상상으로 채우지 마라).
  · 쓰기 전에 **원문에서 옮길 요점을 먼저 꼽고, 답하기 전에 그게 전부 들어갔는지 확인하라.**
    원문이 1,000자를 넘는데 기사가 300자에 못 미치면 요점을 빠뜨린 것이다 — 다시 확인하라.
- **인터뷰·기자회견 기사는 발언 번역이 본문이다** (운영자 지시 2026-08-09).
  누가 어디서 말했는지 한 줄로 밝힌 뒤, 실제 발언을 그대로 번역해 따옴표로 옮긴다.
  발언에 대한 해설·평가·요약을 붙이지 않는다 — 독자가 원하는 건 그 사람이 진짜 뭐라고
  했는지다. 원문의 발언을 임의로 줄이거나 매끄럽게 다듬지 마라.
- 기사/트윗 원문에 없는 사실은 절대 추가하지 않는다. 원문 말미의 무관한 조각(다른 경기 홍보·구독 안내)은 무시한다.
- 제목: 출처가 **분명할 때만** "[출처] 핵심" 형식 (예: "[로마노] 아스날, OOO 영입 추진").
  출처로 쓸 수 있는 것은 **기자·언론사·구단** 뿐이다.
  ⛔ **제목 본문은 반드시 한국어로 쓴다.** 원문 영어 제목을 그대로 옮기는 것 금지
  (예: "[BBC] Challenging times ahead for Newcastle" ❌ → "[BBC] 뉴캐슬, 하우 감독 떠난 뒤 험로 예고" ⭕).
  대괄호 안 기자·매체명과 선수·클럽 고유명사의 영문 표기만 허용된다.
  ⛔ **레딧은 출처가 아니다.** 우리가 소식을 발견한 경로일 뿐이므로 "[레딧]", "[Reddit]",
  "[r/soccer]" 같은 표기는 절대 쓰지 마라. 출처가 불명확하면 **대괄호 없이 제목만** 써라
  (예: "아시아 투어 참가 선수 명단 공개").
- 팀/선수 한글 표기는 한국 ${sp.label} 미디어의 정착된 표기를 따른다 (${sp.notationExamples}). 억지 음차 금지. 확신 없으면 영문 원어를 그대로 쓴다.
  ⚠️ 아래 "확정 한글 표기" 목록이 있으면 **그것이 이 규칙보다 우선한다** (네 감보다 사전이 맞다).
- 구단명은 한국 미디어가 부르는 **통칭(축약형)** 으로 쓴다 — 레알 마드리드→레알, 인테르나치오날레→인테르, 맨체스터 유나이티드→맨유, 파리 생제르맹→PSG. 정식 명칭을 반복하지 마라. 단, **직접 인용문 안의 표현은 원문 그대로** 둔다.
- 미확정 루머는 단정하지 말 것.
- 오늘은 ${new Date().toISOString().slice(0, 10)} 이다. **날짜·연도·시즌 표기는 원문(재료)에
  명시된 것만 쓴다** — 원문에 없는 날짜·연도·시즌을 네 기억이나 추정으로 만들지 마라
  (실사고: 원문에 없는 "2023-24 시즌"·"8월 11일"을 지어내 발행됨). 원문이 요일만 말하면
  요일만 쓴다. 시즌을 언급해야 하는데 원문에 없으면 "이번 시즌"이라고만 쓴다.
- credibility/importance 는 1~5로 매기되(검수자 참고용), 이 값으로 worthy 를 정하지는 마라.${namingHints}${fewshot}${styleshot}
JSON 으로만 답하라: {"worthy":bool,"reason":str,"title":str,"summary":str,"tags":[str],"credibility":1-5,"importance":1-5}`
  const user = `제목: ${post.title}
출처유형: ${sourceKind}
링크: ${post.url || "(없음/self)"}${
    material?.kind === "article"
      ? `\n\n## 기사 원문 (영어, 발췌)\n${material.text}`
      : material?.kind === "tweet"
        ? `\n\n## 트윗 원문 (작성자: ${material.author || "미상"})\n${material.text}`
        : material?.kind === "bsky"
          ? `\n\n## 블루스카이 포스트 원문 (작성자: ${material.author || "미상"})\n${material.text}`
          : ""
  }${retryNote ? `\n\n## 재작성 지시\n${retryNote}` : ""}`

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(material ? 60000 : 30000),
    body: JSON.stringify({
      ...chatParams(material ? MODEL_LONG : MODEL, { temperature: 0.4 }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text().catch(() => "")}`)
  const data = await res.json()
  return JSON.parse(data.choices[0].message.content)
}

/**
 * 트윗 → oembed 한 번으로 임베드 노드 + **트윗 본문 텍스트**를 같이 뽑는다.
 * 왜: 트윗 소스는 지금까지 재료 없이(제목뿐) LLM 에 갔고, 그 결과가 2~3문장
 * 껍데기 기사였다. oembed html 의 blockquote 안에 트윗 전문이 있으므로
 * 그걸 기사 재료로 공급한다 (기사 원문과 같은 원리 — 실재 팩트만 옮긴다).
 */
async function fetchTweetData(url) {
  const res = await fetch(`${BASE_URL}/api/oembed?url=${encodeURIComponent(url)}&includeHtml=true`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return null
  const d = await res.json().catch(() => null)
  if (!d?.html) return null
  // /api/oembed 는 트윗 전문을 title 로 돌려준다 (프로덕션 실측 — Romano 트윗 전문 확인)
  const text = String(d.title || "").trim()
  return {
    text: text.length >= 20 ? text : null,
    author: d.author_name || null,
    node: {
      type: "embed",
      attrs: {
        url: d.url || url,
        html: d.html,
        provider: d.provider || "x",
        title: d.title || null,
        thumbnail_url: d.thumbnail_url || null,
        author_name: d.author_name || null,
      },
    },
  }
}

/**
 * Bluesky 포스트 → 임베드 노드 + 포스트 전문 텍스트 (트윗과 같은 원리).
 * /api/oembed 가 embed.bsky.app 을 프록시하고 title 에 포스트 본문을 담아준다.
 */
async function fetchBskyData(url) {
  const res = await fetch(`${BASE_URL}/api/oembed?url=${encodeURIComponent(url)}&includeHtml=true`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return null
  const d = await res.json().catch(() => null)
  if (!d) return null
  const text = String(d.title || "").trim()
  return {
    text: text.length >= 20 ? text : null,
    author: d.author_name || null,
    node: d.html
      ? {
          type: "embed",
          attrs: {
            url,
            html: d.html,
            provider: "bsky",
            title: d.title || null,
            author_name: d.author_name || null,
          },
        }
      : null,
  }
}

/** 기사 → og 이미지 노드 + 요약 */
async function buildArticleOg(url) {
  const res = await fetch(`${BASE_URL}/api/og?url=${encodeURIComponent(url)}&summarize=1`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) return {}
  const d = await res.json().catch(() => ({}))
  return { imageNode: d?.image ? { type: "image", attrs: { src: d.image } } : null, ogSummary: d?.summary || null }
}

function buildContent(summary, mediaNode) {
  const paras = String(summary || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] }))
  const content = [...paras]
  if (mediaNode) content.push(mediaNode)
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] }
}

/**
 * few-shot 학습용 — 검수자의 수정 사례 조회.
 * examples: 제목 교정 쌍 / articles: 기사 전체 재작성 쌍(봇 초안 → 검수자 최종본).
 * articles 는 검수자가 "고치고 반려"·수정 발행으로 다시 쓴 기사에서 나온다 —
 * 구조·톤을 통째로 흉내내는 게 목적.
 */
async function fetchCorrectionExamples() {
  const empty = { examples: [], articles: [], naming: [] }
  if (!CRON_SECRET) return empty
  try {
    const res = await fetch(`${BASE_URL}/api/news/correction-examples`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return empty
    const d = await res.json().catch(() => ({}))
    return {
      examples: Array.isArray(d?.examples) ? d.examples : [],
      articles: Array.isArray(d?.articles) ? d.articles : [],
      // 확정 표기 사전 [{ ko, en[] }] — 지어내기 전에 정답을 주기 위한 재료
      naming: Array.isArray(d?.naming) ? d.naming : [],
    }
  } catch {
    return empty
  }
}

/**
 * 원문에 **고유명사로** 등장하는지 검사 (낱말 경계 + 첫 글자 대문자).
 *
 * 대문자 조건이 핵심이다. 선수 성씨의 상당수가 흔한 영어 단어와 겹친다 —
 * young·march·cash·mount·rice·slot·pope·green·wood·hill·hall·shaw…
 * 낱말 경계만 보면 "a young midfielder"가 'Young'(영)으로, "in March"가
 * 'March'(마치)로 잡혀서 **엉뚱한 힌트를 주입**한다. 힌트는 "반드시 이대로 쓰라"는
 * 강한 지시라 틀린 힌트는 없느니만 못하다. 영어는 고유명사를 대문자로 쓰므로
 * 이 한 줄이 대부분을 가른다 (문장 첫머리 오탐은 남지만, 그건 힌트 한 칸 낭비일 뿐).
 */
function includesProperNoun(text, lowerText, needle) {
  if (!needle) return false
  let i = lowerText.indexOf(needle)
  while (i !== -1) {
    const before = i === 0 ? " " : lowerText[i - 1]
    const after = i + needle.length >= lowerText.length ? " " : lowerText[i + needle.length]
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
      const c = text[i] ?? ""
      // 대문자(Šeško 같은 비ASCII 포함) 또는 숫자 시작(90min)이면 고유명사로 본다
      if (c !== c.toLowerCase() || /[0-9]/.test(c)) return true
    }
    i = lowerText.indexOf(needle, i + 1)
  }
  return false
}

/**
 * 날짜 환각 검증 (운영자 2026-08-21) — 초안의 연도·"M월 D일" 표기가 원문에 실재하는가.
 * 이적료·스탯 같은 일반 숫자는 단위 변환(35m→3,500만) 때문에 결정적 대조가 불가능하지만,
 * 날짜는 변환이 없어 걸 수 있다. 실사고: 원문에 없는 "2023-24 시즌"·"8월 11일"이 발행됨
 * (LLM 이 자기 기억의 옛 시즌 날짜를 끌어옴).
 * - 연도: 작년~내년은 진행 시즌 문맥으로 허용, 그 밖은 원문에 숫자로 있어야 한다.
 * - M월 D일: 일(D)은 원문 숫자에, 월(M)은 원문 숫자 또는 영문 월명에 있어야 한다.
 * - 영문 월명 축약 검사(includes)는 일반 단어와 겹칠 수 있지만("may"·"mar") 그건
 *   과잉 허용(놓침) 방향이라 안전하다 — 오탐(맞는 날짜를 지우는 것)만 피하면 된다.
 */
const MONTH_EN = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}
/**
 * 이름 환각 검증 (2026-08-25 실사고) — 기사에 나온 **사람 이름**이 원문에 실재하는가.
 *
 * 실사고: 원문이 한 문장뿐인 아스널 기사였는데
 *   "Arsenal have acquired Christos Tzolis but are also open to signing another left-winger..."
 * 초안 본문에 **"프랑스에서 이고르 파이샤오 영입설이 돌고 있으나"** 가 붙어 나왔다.
 * 원문 317자 전체에 그 이름이 없다 — 통째로 지어낸 이적설이다.
 *
 * 날짜는 이미 검사하고 있었는데(위 findDateViolations) 이름은 안 했다. 같은 성질의
 * 사고이므로 같은 방식으로 막는다: 위반 → 1회 재작성 → 그래도면 초안 미생성.
 *
 * ⚠️ **사람만** 본다. 구단·매체는 원문에 없어도 문맥으로 정당하게 나올 수 있다
 *    (리그명, 상대팀, 출처 표기). 사람 이름이 원문에 없는데 기사에 있으면 그건 지어낸 것이다.
 * ⚠️ 사전에 있는 이름만 판정한다. 사전에 없는 이름은 대조할 근거가 없으므로 침묵한다 —
 *    놓치는 쪽이 멀쩡한 기사를 죽이는 쪽보다 안전하다.
 */
/** 악센트를 지운 소문자 — "João Pedro" 와 "joao pedro" 를 같은 것으로 본다 */
function flatLatin(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

function findNameViolations(draftText, sourceText, naming) {
  if (!draftText || !sourceText || !Array.isArray(naming)) return []
  const srcLower = flatLatin(sourceText)
  const bad = []
  for (const row of naming) {
    if (row?.kind !== "person" || !row.ko) continue
    /**
     * ⚠️ **짧은 한글 표기는 검사하지 않는다** (2026-08-25 실사고 — 초안 0건).
     *
     * 한글엔 낱말 경계가 없다. 사전에 성만 한 글자로 등재된 항목이 많은데
     * (건=Gunn, 번=Burn, 영=Young, 힐=Hill, 쇼=Shaw, 텔=Tel …),
     * 부분 문자열로 대조하면 "이**번**"·"**영**입"·"알 **힐**랄"·"프리미어**리그**" 에
     * 전부 걸린다. 이 가드를 켠 뒤 **모든 회차에서 초안이 0건**이 됐다.
     *
     * 3자 미만은 놓치더라도 검사하지 않는다 — 놓치는 건 안전하고, 멀쩡한 기사를
     * 통째로 죽이는 건 안전하지 않다.
     */
    if (row.ko.replace(/\s/g, "").length < 3) continue
    if (!draftText.includes(row.ko)) continue
    // 한글 표기가 원문(한글 헤드라인 포함)에 있으면 근거가 있는 것이다
    if (sourceText.includes(row.ko)) continue
    // ⚠️ 원문의 악센트를 지우고 비교한다 — "João Pedro" 를 "joao pedro" 로 못 찾아
    //    멀쩡한 기사가 반려됐다 (2026-08-25 실측)
    const forms = [...(row.en ?? []), ...(row.enTeam ?? [])]
      .map(flatLatin)
      .filter((e) => e && e.length >= 4)
    if (forms.some((e) => srcLower.includes(e))) continue
    bad.push(row.ko)
    if (bad.length >= 5) break
  }
  return bad
}

function findDateViolations(draftText, sourceText) {
  if (!draftText) return []
  const src = String(sourceText || "").toLowerCase()
  const srcNums = new Set((src.match(/\d+/g) || []).map(Number))
  const srcMonths = new Set()
  for (const [name, num] of Object.entries(MONTH_EN)) {
    if (src.includes(name) || src.includes(name.slice(0, 3))) srcMonths.add(num)
  }
  const bad = new Set()
  const nowY = new Date().getFullYear()
  /**
   * ⚠️ 연도 패턴을 `20\d{2}` 로만 잡으면 **환각 연도를 놓친다** (2026-08-25 실측).
   *    모델 비교 중 "2929년 만료 예정"이 나왔는데 검사를 그냥 통과했다 — 20 으로
   *    시작하지 않아서다. 지어낸 숫자가 하필 20xx 일 이유가 없다.
   *    그래서 **`년`이 붙은 네 자리는 전부** 본다(맨 20xx 도 종전대로 함께 본다).
   */
  const years = new Set()
  for (const m of draftText.matchAll(/(?<![0-9])(20\d{2})(?![0-9])/g)) years.add(Number(m[1]))
  for (const m of draftText.matchAll(/(?<![0-9])(\d{4})\s*년/g)) years.add(Number(m[1]))
  for (const y of years) {
    if (Math.abs(y - nowY) <= 1) continue
    if (!srcNums.has(y)) bad.add(`${y}년`)
  }
  for (const m of draftText.matchAll(/(\d{1,2})월\s*(\d{1,2})일/g)) {
    const mm = Number(m[1])
    const dd = Number(m[2])
    const monthOk = srcNums.has(mm) || srcMonths.has(mm)
    if (!monthOk || !srcNums.has(dd)) bad.add(`${mm}월 ${dd}일`)
  }
  return [...bad]
}

/**
 * 확정 표기 주입 (2026-08-09) — **사후 교정에서 사전 예방으로**.
 *
 * 그동안의 표기 방어는 전부 "LLM 이 지어낸 뒤 잡기"였고, 그물을 아무리 촘촘히 해도
 * 처음 보는 오표기는 계속 뚫렸다('하비 알론소' 실사고 — 사전에 '사비 알론소'가
 * 있었는데도 발행됨). 쓰기 전에 정답을 주면 지어낼 기회 자체가 없다.
 *
 * 사전 전체(1,000여 건)를 싣지 않는다 — 토큰 낭비이자, 긴 목록은 무시당하는 지시가
 * 된다. **지금 이 원문에 실제로 등장하는 것만** 골라 준다.
 */
/**
 * 대문자 검사를 통과해버리는 일반어 — 힌트에서 제외한다.
 * 월·요일은 영어에서 **항상 대문자**라 대문자 규칙으로 못 거른다. 그런데 이적 기사는
 * "in January", "until June 2027"을 끝없이 쓴다. 실측에서 "in March."가 'March'(마치,
 * 솔리 마치)로 잡혔다. 이 선수들 이름은 힌트를 못 받지만 — **놓치는 건 안전하고,
 * 틀린 힌트를 주입하는 건 안전하지 않다.**
 */
const AMBIGUOUS_EN = new Set([
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  // 구단끼리 공유하는 낱말 — "inter 가 들어간다고 모든 팀이 인테르가 되는 게 아니다"
  // (운영자 2026-08-21: Inter Miami·Inter Turku 가 인테르로 오염). 사전 자동 학습이
  // 맨몸 표기를 재등록해도 여기서 힌트 주입을 막는다. 인테르 밀라노는 "inter milan"·
  // "internazionale" 표기로 여전히 잡힌다.
  "inter",
  // 매체(디 애슬레틱)와 구단(아틀레틱 빌바오)이 겹친다 — 긴 표기("the athletic")만 신뢰
  "athletic",
])

const MAX_NAMING_HINTS = 25
function buildNamingHints(naming, sourceText) {
  if (!Array.isArray(naming) || naming.length === 0 || !sourceText) return ""
  const lower = sourceText.toLowerCase()
  const hits = []
  for (const row of naming) {
    if (!row?.ko || !Array.isArray(row.en)) continue
    // 긴 표기부터 — "manchester united"가 "manchester"보다 먼저 잡히게
    const pick = (list) =>
      [...list]
        .filter((en) => !AMBIGUOUS_EN.has(en))
        .sort((a, b) => b.length - a.length)
        .find((en) => includesProperNoun(sourceText, lower, en))

    let matched = pick(row.en)

    /**
     * 성씨 한 토막은 **소속팀이 같은 글에 있을 때만** 쓴다 (2026-08-25 실사고).
     *
     * 맨시티 이적 기사의 "Savio"가 "사비오"로 나갔다. 정답(사비뉴)은 스쿼드 사전에
     * 있었는데 뉴스 사전에 그 철자가 없었다. 그렇다고 성씨를 전역으로 풀면 더 나쁘다 —
     * `savio`를 전역 조회하면 J리그 우라와 레드의 **마테우스 사비우**가 나온다.
     * 팀이라는 열쇠가 있어야 "그 savio가 누구인지" 좁혀진다.
     */
    if (!matched && Array.isArray(row.enTeam) && row.enTeam.length > 0) {
      const teamSeen = (row.team ?? []).some(
        (t) => t && (includesProperNoun(sourceText, lower, t.toLowerCase()) || sourceText.includes(t))
      )
      if (teamSeen) matched = pick(row.enTeam)
    }

    if (matched) hits.push({ en: matched, ko: row.ko })
  }
  if (hits.length === 0) return ""
  // 상한을 넘길 땐 **긴 표기부터** 남긴다 — 'manchester united'가 'young'보다 값지다
  const top = hits.sort((a, b) => b.en.length - a.en.length).slice(0, MAX_NAMING_HINTS)
  return `\n\n## 확정 한글 표기 (반드시 이대로)\n원문에 등장하는 고유명사다. 아래 한글 표기를 **그대로** 써라 — 다르게 음차하지 마라:\n${top
    .map((h) => `- ${h.en} = ${h.ko}`)
    .join(
      "\n"
    )}\n단, 같은 철자가 일반 단어로 쓰인 자리(예: 'young'이 '어린'이라는 뜻으로 쓰인 문장)에는 적용하지 마라.\n이 목록에 없는 이름만 네가 판단해 음차하고, 확신이 없으면 영문 원어를 그대로 둔다.`
}

// ── VS 쟁점 2단 판정 (2026-07-31, 3인 회의 VS-RESULT 스펙) ──────────────
// ⚠️ "쟁점을 만들어라"라고 지시하지 않는다 — 생성을 명령받은 LLM 은 항상 생성한다
// (실측: 백필 12건 중 10건 통과, 다수가 억지). 대신 "갈릴 지점이 있는가"를
// 먼저 판정시키고 신뢰도를 받는다. 판정이 과업이고 생성은 그 다음이다.
const VS_JUDGE_PROMPT = `너는 한국 축구 커뮤니티의 데스크 에디터다. 기사를 읽고 두 단계로 판단한다.

[1단계 — 판정] 이 기사에 독자 의견이 실제로 갈릴 지점이 있는가?
다음은 쟁점이 "없는" 기사다 (has_issue=false 로 판정할 것):
- 수익/매출/재정 발표 ("레알 마드리드 12억 유로 수익") — 사실 보고일 뿐 갈등 없음
- 순위표/일정/결과 정리, 단순 부상·결장 소식
- 소스 1개짜리 통상 이적설 ("A팀이 B선수에 관심") — "영입 찬성인가?"는 모든 이적설에
  붙는 복붙형 질문이라 쟁점이 아니다
- 공식 발표의 단순 전달 (계약 연장, 데뷔 등)
쟁점이 "있는" 기사의 예: 레전드의 은퇴(유산 평가 갈림), 구단주/감독 거취 논란,
징계·판정 논란, 팬덤이 실제로 둘로 갈라져 싸울 사안.
confidence: 판정 확신도 0.0~1.0. 애매하면 낮게.

[2단계 — 생성] has_issue=true 일 때만:
- question: 30자 이내, 반드시 의문형으로 끝남 (~인가? / ~할까? / ~맞나?). "~이다?" 금지
- option_a/option_b: 각 14자 이내 구어체 단정문. 양쪽 모두 팬이 실제로 할 법한
  합리적 주장. 선수/감독의 신체·가족·사망 소재 금지
- summary: 기사 핵심 팩트 3줄 (각 40자 이내, 감상 금지)

JSON만: {"has_issue":bool,"confidence":0.0,"question":"...","option_a":"...","option_b":"...","summary":["...","...","..."]}`

async function judgeVsIssue(title, summaryText) {
  if (!OPENAI_API_KEY || !summaryText || summaryText.length < 30) return null
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      ...chatParams(MODEL, { temperature: 0.3 }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VS_JUDGE_PROMPT },
        { role: "user", content: `제목: ${title}\n\n본문:\n${summaryText.slice(0, 1500)}` },
      ],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const j = JSON.parse(data.choices[0].message.content)
  if (!j.has_issue || typeof j.confidence !== "number" || j.confidence < 0.4) return null
  if (!j.question || !j.option_a || !j.option_b || !Array.isArray(j.summary)) return null
  // 어미 하드 제약 — 반드시 "?"로 끝나되, "~다?"(평서문+물음표) 형태는 금지
  const q = String(j.question).trim()
  if (!q.endsWith("?") || /다\?$/.test(q)) return null
  return {
    question: q.slice(0, 80),
    option_a: String(j.option_a).slice(0, 24),
    option_b: String(j.option_b).slice(0, 24),
    summary: j.summary.slice(0, 3).map((s) => String(s).slice(0, 80)),
    confidence: Math.max(0, Math.min(1, j.confidence)),
  }
}

async function postDraft(payload) {
  const res = await fetch(`${BASE_URL}/api/news/agent-draft`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify(payload),
  })
  const d = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, d }
}

async function main() {
  if (!OPENAI_API_KEY || (!CRON_SECRET && !DRY_RUN)) {
    log("환경변수 누락: OPENAI_API_KEY / CRON_SECRET 필요 (DRY_RUN 시 CRON_SECRET 생략 가능)")
    process.exit(1)
  }
  const seen = loadSeen()
  const cutoff = Date.now() - LOOKBACK_HOURS * 3600 * 1000

  // 이번 run 이 긁을 소스 = r/soccer 고정 + 나머지에서 회차 순환 (REDDIT_RATE).
  // 회전 16개를 5개씩 나눠 도므로 ~3.2 run(48분)이면 전 소스 커버 — LOOKBACK_HOURS(24h) 안이라 유실 없음.
  const rotation = loadRotation()
  const scanSubs = [ALWAYS_SUB, ...pickRotating(ROTATING_SUBS, rotation.scan, SCAN_SUBS_PER_RUN)]
  rotation.scan = (rotation.scan + SCAN_SUBS_PER_RUN) % ROTATING_SUBS.length
  saveRotation(rotation) // 실패해도 다음 run 이 도니 먼저 저장해 중복 순회를 막는다
  log(`이번 회차 소스 ${scanSubs.length}개: ${scanSubs.map((s) => `r/${s}`).join(", ")}`)

  // 모든 소스에서 신규 후보 수집. 키워드(이적) 컷은 제거 — 축구 뉴스 전반을 폭넓게.
  // 밈/스레드/사담만 SKIP_PATTERNS·SKIP_AUTHORS 로 1차 컷, 나머지 판단은 LLM+사람 검수.
  const candidates = []
  const dedup = new Set()
  let fetchedSubs = 0
  const scanDeadline = RUN_STARTED_AT + SCAN_DEADLINE_MS
  for (const [i, sub] of scanSubs.entries()) {
    if (Date.now() > scanDeadline) {
      log(`시간 예산 초과 — 남은 ${scanSubs.length - i}개는 다음 회차로`)
      break
    }
    let entries
    try {
      entries = await fetchSubreddit(sub)
      fetchedSubs++
    } catch (e) {
      log(`fetch 실패 (r/${sub}):`, e.message)
      if (i < scanSubs.length - 1) await sleep(THROTTLE_MS)
      continue
    }
    for (const p of entries) {
      if (!p.id || seen.has(p.id) || dedup.has(p.id)) continue // 크로스포스트 중복 방지
      if (SKIP_AUTHORS.has(p.author)) continue
      if (SKIP_PATTERNS.some((re) => re.test(p.title))) continue
      if (p.published && new Date(p.published).getTime() < cutoff) continue
      dedup.add(p.id)
      candidates.push(p)
    }
    if (i < scanSubs.length - 1) await sleep(THROTTLE_MS)
  }
  if (fetchedSubs === 0) {
    log("모든 소스 fetch 실패 — reddit 차단 의심")
    process.exit(1)
  }
  log(
    `${fetchedSubs}/${scanSubs.length}개 소스 → 신규 후보 ${candidates.length}개 (LLM 상한 ${MAX_LLM_PER_RUN})`
  )

  // 검수 교정 예시 로드 (few-shot 학습) — 실패해도 스캔은 계속
  const corrections = await fetchCorrectionExamples()
  if (corrections.examples.length || corrections.articles.length || corrections.naming.length)
    log(
      `검수 few-shot 로드 — 제목 교정 ${corrections.examples.length}건 / 기사 재작성 ${corrections.articles.length}건 / 확정 표기 사전 ${corrections.naming.length}건`
    )

  let drafted = 0
  let llmCalls = 0
  let skippedNoSource = 0
  for (const p of candidates) {
    if (llmCalls >= MAX_LLM_PER_RUN) break
    seen.add(p.id) // 한 번 본 글은 worthy 여부 무관 재처리 안 함 (비용/중복 방지)

    // ── 출처 없는 글은 기사로 만들지 않는다 (사용자 결정 2026-07-29) ──────────
    // 레딧은 발견 경로일 뿐 출처가 아니다. 원문 기사도 기자 트윗도 없는 글
    // (레딧 자체글·짤·하이라이트 영상)은 결국 "레딧글을 퍼온 것"이 된다.
    // 실측: 대기 139건 중 34건(24%)이 여기 해당했고, 출처가 성립하는 104건은 남는다.
    // LLM 호출 **전에** 걸러 비용도 아낀다.
    if (!isExternalArticle(p.url) && !isTweet(p.url) && !isBsky(p.url) && !isStreamable(p.url)) {
      skippedNoSource++
      log(`skip(출처없음) [${p.subreddit}/${p.id}] ${p.title?.slice(0, 50)}`)
      continue
    }

    try {
      // 작성 전에 원문 재료를 확보한다 — 이게 있어야 5문장 이상 기사가 나온다.
      // 외부 기사 = 본문 <p> 추출, 트윗 = oembed 로 트윗 전문 (임베드 노드도 같이 얻어
      // 아래에서 재사용 — oembed 이중 호출 방지).
      const tweetData = isTweet(p.url) ? await fetchTweetData(p.url) : null
      const bskyData = isBsky(p.url) ? await fetchBskyData(p.url) : null
      const articleBody = isExternalArticle(p.url) ? await fetchArticleBody(p.url) : null
      let material = articleBody
        ? { kind: "article", text: articleBody }
        : tweetData?.text
          ? { kind: "tweet", text: tweetData.text, author: tweetData.author }
          : bskyData?.text
            ? { kind: "bsky", text: bskyData.text, author: bskyData.author }
            : null
      /**
       * 재료가 차단·안내 페이지면 **재료를 버리고 제목만으로 짧게 쓴다**
       * (2026-08-25 운영자 확정).
       *
       * ⚠️ 처음엔 통째로 건너뛰게 만들었는데 그건 틀렸다. 실측 7건의 레딧 제목이
       *    전부 알맹이가 있었다 — 기자명·이적료·발언·협상 상대. 껍데기가 아니다.
       *    ("[HandofArsenal] 마르티넬리, 알 힐랄과 개인 조건 합의 임박…이적료 약 6,000만 유로")
       *
       * 진짜 문제는 기사가 아니라 **지시**였다. 차단 페이지도 material 이 "있는" 것으로
       * 취급돼 장문(500~1,000자) 경로로 갔고, 제목 한 줄로 500자를 채우라니 모델이
       * 자기 지식에서 배경을 끌어왔다("이투아노가 이익의 15~20%를 받는다" — 사실이지만
       * 원문 근거는 없다). 재료를 null 로 만들면 장문 지시가 사라지므로 그 압력이 없어진다.
       *
       * ⚠️ 재료가 **아예 없는** 경우(위 skip)와 다르게 취급하는 이유: 차단 페이지는
       *    "기사는 있는데 우리가 못 읽은" 것이고, 레딧 제목 자체가 기자 보도다.
       */
      let titleOnly = false
      if (material && isBlockPage(material.text)) {
        log(`재료버림(차단페이지) [${p.subreddit}/${p.id}] 제목만으로 작성`)
        material = null
        titleOnly = true
      }

      // ── 재료 없으면 초안을 만들지 않는다 (운영자 2026-08-21) ─────────────────
      // "[미러] 마스터스 성명" 실사고 — 본문 추출 실패(차단/JS렌더) 시 종전 정책은
      // "제목만으로 짧게 나간다"였고, 그 결과가 제목을 두 문장으로 재진술한 **정보 0
      // 껍데기 발행**이었다. 껍데기는 놓치는 것보다 비싸다 — 같은 사안은 대개 다른
      // 소스(타 매체·기자 트윗)로 다시 들어온다. streamable 은 영상 임베드 자체가
      // 내용이라 예외. LLM 호출 전에 거르므로 비용도 아낀다.
      // ⚠️ titleOnly(차단 페이지)는 예외다 — 위 블록 주석 참조. 재료를 못 읽었을 뿐
      //    제목 자체가 기자 보도라, 여기서 버리면 알맹이 있는 소식이 통째로 사라진다.
      if (!material && !titleOnly && !isStreamable(p.url)) {
        log(`skip(재료없음) [${p.subreddit}/${p.id}] ${p.title?.slice(0, 50)}`)
        continue
      }
      llmCalls++
      let v = await judgeAndWrite(p, corrections, material)
      if (!v?.worthy) {
        log(`skip [${p.subreddit}/${p.id}] ${p.title?.slice(0, 50)} — ${v?.reason || "not worthy"}`)
        continue
      }
      // 요점 누락 가드 — **분량 강제가 아니라 누락 검사**다. 재료가 넉넉한데(700자↑)
      // 기사가 350자에 못 미치면 원문의 요점을 버렸을 확률이 높다 → 1회 재작성.
      // (2026-08-09: 길이 "목표"는 없앴지만 상한도 없다 — 요점이 많으면 길어지는 게 맞고,
      //  중요한 사실을 빠뜨리는 게 가장 큰 실패라는 게 운영자 지시다. 재작성 지시는
      //  "늘려라"가 아니라 "빠뜨린 요점을 채워라"로 쓴다 — 늘리라고 하면 덧말로 채운다.)
      if (material && material.text.length >= 700 && (v.summary || "").length < 350) {
        log(
          `retry(요점누락) [${p.subreddit}/${p.id}] 재료 ${material.text.length}자 → 기사 ${(v.summary || "").length}자`
        )
        llmCalls++
        const retry = await judgeAndWrite(
          p,
          corrections,
          material,
          `직전 초안(${(v.summary || "").length}자)은 원문의 요점을 상당수 버렸다. 원문을 다시 훑어 빠뜨린 요점(수치·이적료·계약 기간·조항·실제 발언 인용·경위·다음 일정)을 전부 채워 다시 써라. 요점이 많으면 500~1,000자가 되는 게 정상이다. 단 **분량을 채우려는 배경 설명·전망·감상 추가는 금지** — 원문에 있는 사실만으로 채워라.`
        )
        if (retry?.worthy && (retry.summary || "").length > (v.summary || "").length) v = retry
      }
      // ── 날짜 검증 게이트 (운영자 2026-08-21) — 원문에 없는 날짜·연도는 환각이다.
      //    위반 시 1회 재작성, 그래도 위반이면 초안 미생성 (fail-closed).
      const dateSrc = `${p.title || ""}\n${material?.text || ""}`
      let dateBad = findDateViolations(`${v.title || ""}\n${v.summary || ""}`, dateSrc)
      if (dateBad.length) {
        log(`retry(날짜검증) [${p.subreddit}/${p.id}] ${dateBad.join(", ")}`)
        llmCalls++
        const retry = await judgeAndWrite(
          p,
          corrections,
          material,
          `직전 초안에 원문에 없는 날짜 표기가 있다: ${dateBad.join(", ")}. 날짜·연도·시즌은 원문(재료)에 명시된 것만 쓰고, 원문에 없으면 그 날짜 표현 자체를 빼고 다시 써라. 오늘 날짜나 네 기억 기준의 추정 금지.`
        )
        if (retry?.worthy) v = retry
        dateBad = findDateViolations(`${v.title || ""}\n${v.summary || ""}`, dateSrc)
        if (dateBad.length) {
          log(`skip(날짜검증) [${p.subreddit}/${p.id}] ${dateBad.join(", ")} — 초안 미생성`)
          continue
        }
      }
      // ── 이름 검증 게이트 (2026-08-25) — 원문에 없는 사람 이름은 환각이다.
      //    날짜 게이트와 같은 규율: 1회 재작성, 그래도 위반이면 초안 미생성.
      let nameBad = findNameViolations(
        `${v.title || ""}
${v.summary || ""}`,
        dateSrc,
        corrections.naming
      )
      if (nameBad.length) {
        log(`retry(이름검증) [${p.subreddit}/${p.id}] ${nameBad.join(", ")}`)
        llmCalls++
        const retry = await judgeAndWrite(
          p,
          corrections,
          material,
          `직전 초안에 원문에 없는 인물이 등장한다: ${nameBad.join(", ")}. 원문(재료)에 나오지 않는 선수·감독 이름은 **절대 쓰지 마라** — 네 기억이나 추측으로 다른 이적설을 끌어오지 마라. 그 문장을 통째로 빼고 원문에 있는 사실만으로 다시 써라.`
        )
        if (retry?.worthy) v = retry
        nameBad = findNameViolations(
          `${v.title || ""}
${v.summary || ""}`,
          dateSrc,
          corrections.naming
        )
        if (nameBad.length) {
          log(`skip(이름검증) [${p.subreddit}/${p.id}] ${nameBad.join(", ")} — 초안 미생성`)
          continue
        }
      }

      v.title = stripRedditAttribution(applyKoreanFixes(v.title))
      v.summary = applyKoreanFixes(v.summary)
      // 영문 제목 가드 (운영자 지시 2026-08-03) — 1회 강제 재작성, 실패 시 초안 자체를 안 만든다
      if (!isKoreanTitle(v.title)) {
        log(`retry(영문제목) [${p.subreddit}/${p.id}] "${v.title?.slice(0, 60)}"`)
        llmCalls++
        const retry = await judgeAndWrite(
          p,
          corrections,
          material,
          `직전 초안의 제목("${v.title}")이 영어다 — 실패다. 제목 본문을 반드시 한국어로 다시 써라. 대괄호 안 기자·매체명과 선수·클럽 고유명사만 영문 허용.`
        )
        if (retry?.worthy) {
          retry.title = stripRedditAttribution(applyKoreanFixes(retry.title))
          retry.summary = applyKoreanFixes(retry.summary)
          if (isKoreanTitle(retry.title)) v = retry
        }
        if (!isKoreanTitle(v.title)) {
          log(`skip(영문제목) [${p.subreddit}/${p.id}] 재작성도 영어 — 초안 미생성`)
          continue
        }
      }
      if (DRY_RUN) {
        drafted++
        log(
          `[DRY] draft [${p.subreddit}/${p.id}] ${v.title} — 재료 ${
            material ? `${material.kind} ${material.text.length}자` : "없음"
          } / 기사 ${(v.summary || "").length}자\n${v.summary}\n`
        )
        continue
      }
      let mediaNode = null
      let summary = v.summary
      if (isTweet(p.url)) {
        mediaNode = tweetData?.node ?? null
      } else if (isBsky(p.url)) {
        mediaNode = bskyData?.node ?? null
      } else if (isStreamable(p.url)) {
        // 원문 = 영상 그 자체. embed-card 가 url 로 플레이어 iframe 을 만든다 (html 불필요)
        mediaNode = { type: "embed", attrs: { url: p.url, provider: "streamable" } }
      } else if (isExternalArticle(p.url)) {
        const { imageNode, ogSummary } = await buildArticleOg(p.url)
        mediaNode = imageNode
        if (ogSummary && (summary || "").length < 40) summary = ogSummary
      }
      const sport = sportOf(p.subreddit)
      // VS 쟁점 제안 (2단 판정) — 축구 전용 (판정 프롬프트가 축구 데스크 기준).
      // 실패해도 초안은 나간다.
      let vs = null
      if (sport === "football") {
        try {
          vs = await judgeVsIssue(v.title, summary || "")
        } catch {
          vs = null
        }
      }
      const r = await postDraft({
        title: v.title,
        content: buildContent(summary, mediaNode),
        // 원문 재료를 초안에 보존 — 검수자가 원문과 대조하며 고칠 수 있게
        source_text: material
          ? `[${material.kind === "tweet" ? `트윗 · ${material.author || "작성자 미상"}` : "기사 발췌"}]\n${material.text}`.slice(0, 4000)
          : undefined,
        source_url: p.url && /^https?:/.test(p.url) ? p.url : undefined,
        origin_url: p.permalink || undefined,
        tags: Array.isArray(v.tags) ? v.tags.slice(0, 10) : [],
        scores: { credibility: v.credibility, importance: v.importance },
        dedupe_key: `reddit:${p.id}`,
        // 종목 표기 — 발행이 이 값으로 게시판을 고른다 (미표기 = football, 하위 호환)
        ...(sport !== "football" ? { sport } : {}),
        ...(vs ? { vs } : {}),
      })
      if (r.ok) {
        drafted++
        log(`draft ✓ [${p.subreddit}/${p.id}] ${v.title}${r.d?.deduped ? " (중복)" : ""}`)
      } else {
        log(`draft ✗ [${p.subreddit}/${p.id}] ${r.status}`, r.d?.error || "")
      }
    } catch (e) {
      log(`error [${p.subreddit}/${p.id}]`, e.message)
    }
  }

  saveSeen(seen)
  log(
    `완료: 후보 ${candidates.length}, 출처없음 제외 ${skippedNoSource}건, LLM ${llmCalls}회, 초안 ${drafted}건`
  )

  // 스캔 뒤 화력 재측정 — 실패해도 스캔 결과에는 영향 없음
  try {
    await reportHeat(rotation)
  } catch (e) {
    log("heat 실패(무시):", e.message)
  }
}

// ── 레딧 화력 재측정 (홈 Top Story 랭킹용, 2026-07-30) ──────────────
// 스캐너는 글이 갓 올라왔을 때 긁으므로 수집 시점엔 화력을 모른다 — "불타오름"은
// 나중에 오르는 값이라 매 run(15분)마다 재측정해 사이트로 밀어넣는다
// (POST /api/news/heat → news_reservoir.raw.heat → 홈 히어로 랭킹).
//
// ⚠️ 절대 점수(업보트 수)는 얻을 수 없다 — hot.json/old.reddit JSON 은 curl 로도
//    차단됨을 실측(2026-07-30, HTML 차단 페이지 반환). 대신 **top.rss?t=day 의
//    정렬 순서 = 오늘 점수 순위**이므로, 순위 기반 합성 점수를 쓴다. 히어로 선정에
//    필요한 건 절대값이 아니라 순위다.
// 서브 간 스케일: r/soccer(종합, 구독자 수백만)가 클럽 서브보다 화력 기준이 높다
// → 가중 베이스로 보정. 어차피 상위 3개만 쓰므로 대략적 서열이면 충분하다.
// 앞 2개는 매 run 고정(히어로 선정을 사실상 좌우하는 큰 소스), 클럽은 1개씩 순환 —
// 레딧 예산이 1분 1건이라 5개 × 2목록 = 10건을 매 run 돌 수 없다(REDDIT_RATE).
// 클럽 3개 순환이라 45분에 한 바퀴, "3시간 미측정=식음" 무효 기준 안에 넉넉히 든다.
const HEAT_FIXED = [
  { sub: "soccer", base: 300 },
  { sub: "PremierLeague", base: 150 },
]
const HEAT_ROTATING = [
  { sub: "Gunners", base: 100 },
  { sub: "LiverpoolFC", base: 100 },
  { sub: "chelseafc", base: 100 },
]

async function reportHeat(rotation) {
  if (!CRON_SECRET || DRY_RUN) return
  const targets = [...HEAT_FIXED, ...pickRotating(HEAT_ROTATING, rotation?.heat ?? 0, 1)]
  if (rotation) {
    rotation.heat = ((rotation.heat ?? 0) + 1) % HEAT_ROTATING.length
    saveRotation(rotation)
  }

  // 두 신호를 합친다 (2026-07-30, 운영자 지적 "갓 올라온 글은 화력이 약하다" 반영):
  //   top?t=day = 오늘 누적 점수 순위 → 검증된 대형 떡밥. 단 신작에 불리.
  //   hot       = 레딧이 점수÷경과시간으로 계산한 순위 → 지금 막 불붙는 글이 바로 상위.
  // 최종 = 둘 중 높은 쪽 — 급상승 신작도, 하루 종일 탄 대작도 다 잡힌다.
  const byKey = new Map() // 같은 글이 여러 목록에 뜨면 최고 점수 유지
  const jobs = targets.flatMap(({ sub, base }) =>
    ["top.rss?t=day&limit=50", "hot.rss?limit=50"].map((listing) => ({ sub, base, listing }))
  )
  const heatDeadline = RUN_STARTED_AT + HEAT_DEADLINE_MS
  for (const [i, { sub, base, listing }] of jobs.entries()) {
    if (Date.now() > heatDeadline) {
      log(`heat: 시간 예산 초과 — 남은 ${jobs.length - i}건은 다음 회차로`)
      break
    }
    try {
      const { body: xml } = await redditFetch(
        `https://www.reddit.com/r/${sub}/${listing}`,
        `heat r/${sub}`
      )
      const entries = parseAtomFeed(xml)
      entries.forEach((e, idx) => {
        if (!e.id) return
        const key = `reddit:${e.id}`
        const score = Math.max(1, Math.round(base - idx * (base / 50)))
        const prev = byKey.get(key)
        if (!prev || prev.score < score) byKey.set(key, { dedupe_key: key, score, comments: 0 })
      })
    } catch {
      /* 목록 하나 실패는 무시 — 다음 run 에서 다시 잰다 */
    }
    if (i < jobs.length - 1) await sleep(THROTTLE_MS)
  }
  log(`heat 대상: ${targets.map((t) => `r/${t.sub}`).join(", ")}`)
  const items = [...byKey.values()]
  if (items.length === 0) {
    log("heat: 수집 0건 (top.rss 차단?)")
    return
  }

  // API 상한 200 — 화력 높은 순으로 자른다 (낮은 건 어차피 히어로 후보가 아님)
  const top = items.sort((a, b) => b.score - a.score).slice(0, 200)
  const res = await fetch(`${BASE_URL}/api/news/heat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}` },
    body: JSON.stringify({ items: top }),
    signal: AbortSignal.timeout(20000),
  })
  const d = await res.json().catch(() => ({}))
  log(`heat: 측정 ${items.length}건 → 발행글 매칭 ${d.updated ?? 0}건 (${res.status})`)
}

main().catch((e) => {
  log("치명적 오류:", e.stack || e.message)
  process.exit(1)
})
