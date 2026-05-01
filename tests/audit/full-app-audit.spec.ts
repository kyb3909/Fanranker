/**
 * Full App Audit — Read-only BFS 크롤 + 콘솔/네트워크/페이지 에러 수집 + UI/UX 관찰.
 * 안전장치: 위험 키워드(삭제/탈퇴/결제/로그아웃 등) 클릭 차단, 외부 도메인 진입 차단.
 *
 * 실행:
 *   BASE_URL=https://gongnori.fan pnpm exec playwright test \
 *     tests/audit/full-app-audit.spec.ts --project=chromium --headed --reporter=list
 *
 * 환경변수:
 *   BASE_URL          기본 https://gongnori.fan
 *   AUDIT_EMAIL       (.env.local)
 *   AUDIT_PASSWORD    (.env.local)
 *   AUDIT_MAX_PAGES   기본 100
 *   AUDIT_QUICK=1     스크린샷 생략 + MAX_PAGES=10
 */
import { test, type Page, type BrowserContext, type Locator } from "@playwright/test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") })

// ── Config ─────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || "https://gongnori.fan"
const EMAIL = process.env.AUDIT_EMAIL || ""
const PASSWORD = process.env.AUDIT_PASSWORD || ""
const QUICK_MODE = process.env.AUDIT_QUICK === "1"
const MAX_PAGES = Number(process.env.AUDIT_MAX_PAGES || (QUICK_MODE ? 10 : 100))
const PER_PAGE_TIMEOUT_MS = 5 * 60 * 1000

const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const RUN_DIR = path.resolve(__dirname, "reports", TS)
const SHOTS_DIR = path.join(RUN_DIR, "screenshots")
fs.mkdirSync(SHOTS_DIR, { recursive: true })

const EVENTS_PATH = path.join(RUN_DIR, "audit-events.jsonl")
const MENU_PATH = path.join(RUN_DIR, "menu-inventory.json")
const VISITED_PATH = path.join(RUN_DIR, "visited-urls.json")
const META_PATH = path.join(RUN_DIR, "run-meta.json")

// ── Safety guards ──────────────────────────────────────────────────────
const FORBIDDEN_KEYWORDS = [
  "삭제",
  "탈퇴",
  "결제",
  "구매",
  "청구",
  "로그아웃",
  "차단",
  "신고",
  "환불",
  "delete",
  "remove",
  "cancel subscription",
  "unsubscribe",
  "pay",
  "checkout",
  "sign out",
  "log out",
  "logout",
  "withdraw",
]

function isForbidden(text: string | null | undefined): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return FORBIDDEN_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
}

const FORM_INPUTS = {
  email: "qa+playwright@example.com",
  text: "[Playwright Audit Test]",
  number: "1",
}

const RESPONSE_4XX_WHITELIST: RegExp[] = [
  /clerk\..*\/v1\/client\/sessions/i,
  /\/api\/.*\/check\b/i,
  /\/api\/auth\/me\b/i,
]

// ── Event sink ─────────────────────────────────────────────────────────
const state = {
  currentUrl: "",
  currentAction: "init",
  errorCounts: new Map<string, number>(), // 같은 에러 10회 후 카테고리 차단
}

function appendEvent(ev: Record<string, unknown>) {
  const row = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    url: state.currentUrl,
    action: state.currentAction,
    ...ev,
  }
  fs.appendFileSync(EVENTS_PATH, JSON.stringify(row) + "\n")
}

function bumpErrorBucket(key: string): boolean {
  const cur = state.errorCounts.get(key) || 0
  state.errorCounts.set(key, cur + 1)
  return cur < 10
}

function attachListeners(page: Page) {
  page.on("console", (msg) => {
    const lvl = msg.type()
    if (lvl !== "error" && lvl !== "warning") return
    const text = msg.text().slice(0, 500)
    const bucket = `console:${lvl}:${text.slice(0, 60)}`
    if (!bumpErrorBucket(bucket)) return
    appendEvent({ kind: "console", level: lvl, text, loc: msg.location() })
  })
  page.on("pageerror", (err) => {
    const msg = err.message.slice(0, 500)
    const bucket = `pageerror:${msg.slice(0, 60)}`
    if (!bumpErrorBucket(bucket)) return
    appendEvent({ kind: "pageerror", message: msg, stack: err.stack?.slice(0, 1500) })
  })
  page.on("requestfailed", (req) => {
    const url = req.url()
    if (RESPONSE_4XX_WHITELIST.some((rx) => rx.test(url))) return
    const bucket = `reqfail:${new URL(url).pathname.slice(0, 60)}`
    if (!bumpErrorBucket(bucket)) return
    appendEvent({
      kind: "requestfailed",
      url,
      method: req.method(),
      failure: req.failure()?.errorText,
    })
  })
  page.on("response", (resp) => {
    const status = resp.status()
    if (status < 400) return
    const url = resp.url()
    if (RESPONSE_4XX_WHITELIST.some((rx) => rx.test(url))) return
    const bucket = `resp4xx:${status}:${new URL(url).pathname.slice(0, 60)}`
    if (!bumpErrorBucket(bucket)) return
    appendEvent({ kind: "response", status, url, method: resp.request().method() })
  })
}

// ── Helpers ────────────────────────────────────────────────────────────
function slugifyUrl(url: string): string {
  try {
    const u = new URL(url, BASE_URL)
    let s = (u.pathname + (u.hash ? "_" + u.hash : "")).replace(/[^a-zA-Z0-9가-힣\-_/]/g, "_")
    s = s.replace(/_+/g, "_").replace(/\/+/g, "_")
    if (s.startsWith("_")) s = s.slice(1)
    return s.slice(0, 80) || "root"
  } catch {
    return "unknown"
  }
}

async function loginPage(page: Page): Promise<boolean> {
  if (!EMAIL || !PASSWORD) {
    appendEvent({ kind: "fatal", message: "AUDIT_EMAIL / AUDIT_PASSWORD 미설정" })
    return false
  }
  state.currentAction = "login_navigate"
  state.currentUrl = "/"
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await page.waitForTimeout(2000)

  // gongnori.fan 패턴: 헤더 우상단 "로그인 메뉴" 버튼 → DropdownMenu 안의 폼
  // (별도 /sign-in 페이지 없음, /sign-up 만 있음)
  const trigger = page.getByRole("button", { name: "로그인 메뉴" }).first()
  if ((await trigger.count().catch(() => 0)) === 0) {
    // fallback: 텍스트 "로그인" 버튼/링크
    const fallback = page.getByRole("button", { name: /^로그인$/ }).first()
    if ((await fallback.count().catch(() => 0)) > 0) {
      await fallback.click({ timeout: 5000 }).catch(() => {})
    } else {
      appendEvent({ kind: "fatal", message: "로그인 트리거 버튼 못 찾음", url: page.url() })
      return false
    }
  } else {
    await trigger.click({ timeout: 5000 }).catch(() => {})
  }
  await page.waitForTimeout(1200)

  // 드롭다운 모달 안의 이메일/비번
  const emailInput = page.locator('#sign-in-email, input[type="email"]').first()
  await emailInput.waitFor({ state: "visible", timeout: 10000 }).catch(() => {})
  if ((await emailInput.count().catch(() => 0)) === 0) {
    appendEvent({ kind: "fatal", message: "이메일 input 못 찾음", url: page.url() })
    return false
  }
  state.currentAction = "login_fill"
  await emailInput.fill(EMAIL)

  const passwordInput = page.locator('#sign-in-password, input[type="password"]').first()
  await passwordInput.waitFor({ state: "visible", timeout: 5000 }).catch(() => {})
  if ((await passwordInput.count().catch(() => 0)) === 0) {
    appendEvent({ kind: "fatal", message: "비밀번호 input 못 찾음", url: page.url() })
    return false
  }
  await passwordInput.fill(PASSWORD)

  state.currentAction = "login_submit"
  // 폼 안의 submit 버튼 ("로그인" 텍스트)
  const submitBtn = page
    .locator('form button[type="submit"], button[type="submit"]:has-text("로그인")')
    .first()
  if ((await submitBtn.count().catch(() => 0)) > 0) {
    await submitBtn.click({ timeout: 5000 }).catch(() => {})
  } else {
    await passwordInput.press("Enter")
  }
  // 모달이 닫히고 헤더가 사용자 아바타로 바뀌는 게 성공 신호
  await page.waitForTimeout(3000)
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})

  // 성공 판정: "로그인 메뉴" 버튼이 사라지고 사용자 메뉴/아바타가 나타남
  const stillHasLoginTrigger =
    (await page
      .getByRole("button", { name: "로그인 메뉴" })
      .count()
      .catch(() => 0)) > 0
  if (stillHasLoginTrigger) {
    appendEvent({
      kind: "fatal",
      message: "로그인 후에도 '로그인 메뉴' 버튼이 남아있음 — 인증 실패 추정",
      url: page.url(),
    })
    return false
  }
  appendEvent({ kind: "login_success", url: page.url() })
  return true
}

async function buildMenuInventory(
  page: Page
): Promise<Record<string, Array<{ text: string; href: string | null }>>> {
  const inv: Record<string, Array<{ text: string; href: string | null }>> = {
    header: [],
    sidebar: [],
    footer: [],
    user_dropdown: [],
  }

  const collect = async (selector: string) => {
    return await page.evaluate((sel) => {
      const arr: Array<{ text: string; href: string | null }> = []
      const root = document.querySelector(sel)
      if (!root) return arr
      root.querySelectorAll("a, button").forEach((el) => {
        const t = (el.textContent || "").trim().slice(0, 80)
        if (!t) return
        const href = (el as HTMLAnchorElement).href || null
        arr.push({ text: t, href })
      })
      return arr
    }, selector)
  }

  inv.header = await collect("header")
  inv.sidebar = await collect('aside, [role="complementary"]')
  inv.footer = await collect("footer")

  // 사용자 드롭다운: 로그인 후 Clerk 가 user-menu 를 렌더할 때까지 명시적 대기.
  // 사이클 2 에선 너무 빨리 잡아서 SignInMenu 로 fallback 됐었음 — 그 회귀 방지.
  const userTrigger = page.getByRole("button", { name: "사용자 메뉴" }).first()
  await userTrigger.waitFor({ state: "visible", timeout: 8000 }).catch(() => {})

  const trigger =
    (await userTrigger.count().catch(() => 0)) > 0
      ? userTrigger
      : page.getByRole("button", { name: "로그인 메뉴" }).first()

  if ((await trigger.count().catch(() => 0)) > 0) {
    await trigger.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(700)
    inv.user_dropdown = await page.evaluate(() => {
      const arr: Array<{ text: string; href: string | null }> = []
      document
        .querySelectorAll(
          '[role="menu"] a, [role="menu"] button, [role="menuitem"], [data-radix-popper-content-wrapper] a, [data-radix-popper-content-wrapper] button'
        )
        .forEach((el) => {
          const t = (el.textContent || "").trim().slice(0, 80)
          if (!t) return
          const href = (el as HTMLAnchorElement).href || null
          arr.push({ text: t, href })
        })
      return arr
    })
    await page.keyboard.press("Escape").catch(() => {})
    await page.waitForTimeout(300)
  }

  return inv
}

async function extractInternalLinks(page: Page, baseHost: string): Promise<string[]> {
  return await page.evaluate((host) => {
    const arr: string[] = []
    document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      try {
        const u = new URL(a.href)
        if (u.host === host && !u.pathname.startsWith("/api/")) {
          arr.push(u.pathname + (u.hash || ""))
        }
      } catch {
        /* ignore */
      }
    })
    return [...new Set(arr)]
  }, baseHost)
}

type Interactable = { label: string; tag: string; role: string | null }

async function collectInteractables(page: Page): Promise<Interactable[]> {
  return await page.evaluate(() => {
    const out: Array<{ label: string; tag: string; role: string | null }> = []
    const seen = new Set<string>()
    const els = document.querySelectorAll<HTMLElement>(
      'button, [role="button"], a[href], [onclick], input[type="submit"]'
    )
    els.forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const text = (
        el.textContent ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        ""
      )
        .trim()
        .slice(0, 60)
      if (!text) return
      const tag = el.tagName.toLowerCase()
      const role = el.getAttribute("role")
      const key = `${tag}::${text}`
      if (seen.has(key)) return
      seen.add(key)
      out.push({ label: text, tag, role })
    })
    return out
  })
}

async function safeClickByLabel(
  page: Page,
  label: string
): Promise<{ clicked: boolean; reason?: string }> {
  if (isForbidden(label)) return { clicked: false, reason: "forbidden_keyword" }
  state.currentAction = `click:${label.slice(0, 40)}`
  const loc = page.getByText(label, { exact: true }).first()
  if ((await loc.count().catch(() => 0)) === 0) return { clicked: false, reason: "not_found" }
  try {
    await loc.click({ timeout: 3000 })
    await page.waitForTimeout(700)
    return { clicked: true }
  } catch (e) {
    return { clicked: false, reason: (e as Error).message.slice(0, 100) }
  }
}

async function checkPageUiHeuristics(page: Page, pathName: string): Promise<void> {
  try {
    const obs = await page.evaluate(() => {
      const issues: Array<{
        category: string
        severity: string
        observation: string
        suggestion?: string
      }> = []
      // 가로 스크롤
      if (document.documentElement.scrollWidth > window.innerWidth + 5) {
        issues.push({
          category: "layout",
          severity: "medium",
          observation: `가로 스크롤 발생 (scrollWidth ${document.documentElement.scrollWidth}px > innerWidth ${window.innerWidth}px)`,
          suggestion: "max-width 또는 overflow-x 점검",
        })
      }
      // alt 누락 이미지
      const imgs = document.querySelectorAll("img")
      let missingAlt = 0
      imgs.forEach((img) => {
        if (!img.alt && !img.getAttribute("aria-hidden")) missingAlt++
      })
      if (missingAlt > 0) {
        issues.push({
          category: "a11y",
          severity: missingAlt > 5 ? "medium" : "low",
          observation: `alt 누락 이미지 ${missingAlt}/${imgs.length}건`,
          suggestion: "정보 전달 이미지에는 alt, 장식 이미지에는 alt='' 또는 aria-hidden",
        })
      }
      // 작은 터치 타겟 (모바일에서만 의미 있음)
      // false positive 줄이기:
      //   1) 부모가 button/a/[role=button] 이면 hit area 가 부모거라 child 측정 무시
      //   2) 자식에 absolute 로 inset 확장한 span 이 있으면 가상 hit area 확장된 것
      const smallTargets: Array<{ tag: string; text: string; w: number; h: number; cls: string }> =
        []
      const isInteractiveAncestor = (el: Element): boolean => {
        let p = el.parentElement
        while (p && p !== document.body) {
          if (p.tagName === "BUTTON" || p.tagName === "A") return true
          if (p.getAttribute("role") === "button") return true
          if ((p as HTMLElement).onclick) return true
          // article 카드 / group 블록은 카드 전체가 클릭 영역으로 동작하는 일반 패턴
          if (p.tagName === "ARTICLE") return true
          if (p.classList.contains("group") && p.querySelector("a, button")) return true
          p = p.parentElement
        }
        return false
      }
      const isCardTitleLink = (el: Element): boolean => {
        // a.group.block 같은 카드 자체 wrapping link 는 카드 전체가 hit area 라 무시
        return (
          el.tagName === "A" && el.classList.contains("group") && el.classList.contains("block")
        )
      }
      const hasAbsoluteHitArea = (el: Element): boolean => {
        return !!el.querySelector(":scope > span[aria-hidden].absolute")
      }
      Array.from(document.querySelectorAll("button, a")).forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return
        if (r.width < 36 || r.height < 36) {
          if (isInteractiveAncestor(el)) return
          if (hasAbsoluteHitArea(el)) return
          if (isCardTitleLink(el)) return
          const e = el as HTMLElement
          const text = (
            e.textContent ||
            e.getAttribute("aria-label") ||
            e.getAttribute("title") ||
            ""
          )
            .trim()
            .slice(0, 40)
          smallTargets.push({
            tag: e.tagName.toLowerCase(),
            text,
            w: Math.round(r.width),
            h: Math.round(r.height),
            cls: (e.className || "").slice(0, 80),
          })
        }
      })
      if (smallTargets.length > 0 && window.innerWidth < 500) {
        // dedupe by (tag, text, cls) — 카드가 20개면 같은 버튼 20번 잡힘
        const seen = new Set<string>()
        const unique = smallTargets.filter((t) => {
          const k = `${t.tag}|${t.text}|${t.cls}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        issues.push({
          category: "touch_target",
          severity: smallTargets.length > 50 ? "medium" : "low",
          observation: `터치 타겟 36px 미만 ${smallTargets.length}건 (고유 ${unique.length}종, 모바일)`,
          suggestion: "최소 44x44px 권장 (Apple HIG)",
          // @ts-expect-error custom field for diff/regression analysis
          samples: unique.slice(0, 20),
        })
      }
      return issues
    })
    for (const o of obs) {
      appendEvent({ kind: "ui_observation", page: pathName, ...o })
    }
  } catch {
    /* ignore */
  }
}

// ── Main ──────────────────────────────────────────────────────────────
test("Full App Audit", async ({ browser }) => {
  test.setTimeout(60 * 60 * 1000) // 60분

  const context = await browser.newContext({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  attachListeners(page)
  context.on("page", (p) => attachListeners(p))

  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })

  fs.writeFileSync(
    META_PATH,
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        startedAt: new Date().toISOString(),
        maxPages: MAX_PAGES,
        quickMode: QUICK_MODE,
      },
      null,
      2
    )
  )

  try {
    appendEvent({ kind: "phase", phase: "login_start" })
    const ok = await loginPage(page)
    if (!ok) {
      appendEvent({ kind: "phase", phase: "abort", reason: "login_failed" })
      throw new Error("로그인 실패 — audit 중단. audit-events.jsonl의 fatal 항목 확인.")
    }
    appendEvent({ kind: "phase", phase: "login_done", url: page.url() })

    // 메뉴 인벤토리
    appendEvent({ kind: "phase", phase: "menu_inventory_start" })
    state.currentUrl = "/"
    state.currentAction = "menu_inventory"
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(1500)
    const inventory = await buildMenuInventory(page)
    fs.writeFileSync(MENU_PATH, JSON.stringify(inventory, null, 2))
    appendEvent({
      kind: "phase",
      phase: "menu_inventory_done",
      counts: Object.fromEntries(Object.entries(inventory).map(([k, v]) => [k, v.length])),
    })

    // BFS
    appendEvent({ kind: "phase", phase: "crawl_start", maxPages: MAX_PAGES })
    const baseHost = new URL(BASE_URL).host
    const queue: string[] = ["/"]
    for (const items of Object.values(inventory)) {
      for (const it of items) {
        if (it.href) {
          try {
            const u = new URL(it.href)
            if (u.host === baseHost) queue.push(u.pathname + (u.hash || ""))
          } catch {
            /* ignore */
          }
        }
      }
    }

    // 핵심 사용자 페이지는 메뉴 노출 안 되거나 Clerk 비동기 로드 타이밍에 안 잡힐 수 있음.
    // 항상 큐에 추가 (중복은 visited Set 이 거름).
    const FALLBACK_USER_PATHS = [
      "/games",
      "/my-posts",
      "/my-predictions",
      "/payments",
      "/write",
      "/share",
      "/search",
      "/stadium",
      "/metaverse",
      "/onboarding",
    ]
    const userMenuSignature = ["내 프로필", "내 작성글", "승부예측 내역", "골드 내역", "설정"]
    const hasUserMenu = inventory.user_dropdown.some((it) =>
      userMenuSignature.some((sig) => it.text.includes(sig))
    )
    appendEvent({
      kind: "phase",
      phase: "user_dropdown_check",
      hasUserMenu,
      dropdownItemCount: inventory.user_dropdown.length,
      forcedFallback: !hasUserMenu,
    })
    for (const p of FALLBACK_USER_PATHS) queue.push(p)

    const visited = new Set<string>()
    const visitedDetail: Array<{ path: string; status: string; note?: string }> = []
    let pageCount = 0

    while (queue.length > 0 && pageCount < MAX_PAGES) {
      const next = queue.shift()!
      if (visited.has(next)) continue
      visited.add(next)
      pageCount++
      state.currentUrl = next
      state.currentAction = "navigation"

      const fullUrl = next.startsWith("http") ? next : `${BASE_URL}${next}`

      try {
        const pageStart = Date.now()
        await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 })
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {})

        const slug = slugifyUrl(fullUrl)
        if (!QUICK_MODE) {
          await page
            .screenshot({
              path: path.join(SHOTS_DIR, `${slug}.png`),
              fullPage: true,
              timeout: 15000,
            })
            .catch(() => {})
        }

        await checkPageUiHeuristics(page, next)

        const items = await collectInteractables(page).catch(() => [])
        appendEvent({
          kind: "page_visit",
          path: next,
          interactable_count: items.length,
          slug,
        })

        // 안전한 일부 클릭 (페이지당 최대 3개)
        const safe = items
          .filter((it) => !isForbidden(it.label))
          .filter(
            (it) => !/외부|external|새창|새 탭/i.test(it.label) && !/^https?:\/\//i.test(it.label)
          )
          .slice(0, QUICK_MODE ? 1 : 3)

        for (const it of safe) {
          if (Date.now() - pageStart > PER_PAGE_TIMEOUT_MS) break
          const before = page.url()
          await safeClickByLabel(page, it.label)
          // 새 탭 닫기
          const others = context.pages().filter((p) => p !== page)
          for (const p of others) await p.close().catch(() => {})
          // 외부 도메인 진입 시 복귀
          const after = page.url()
          if (!after.startsWith(BASE_URL)) {
            await page
              .goto(before, { waitUntil: "domcontentloaded", timeout: 15000 })
              .catch(() => {})
          }
        }

        // 새 내부 링크 발견 → 큐에 추가
        const newLinks = await extractInternalLinks(page, baseHost).catch(() => [])
        for (const l of newLinks) {
          if (!visited.has(l) && !queue.includes(l) && queue.length < MAX_PAGES * 3) {
            queue.push(l)
          }
        }

        visitedDetail.push({ path: next, status: "ok" })
      } catch (e) {
        appendEvent({
          kind: "page_error",
          path: next,
          message: (e as Error).message.slice(0, 200),
        })
        visitedDetail.push({
          path: next,
          status: "error",
          note: (e as Error).message.slice(0, 100),
        })
      }
    }
    appendEvent({
      kind: "phase",
      phase: "crawl_done",
      pagesVisited: pageCount,
      queueLeft: queue.length,
    })

    // 모바일 패스
    if (!QUICK_MODE) {
      appendEvent({ kind: "phase", phase: "mobile_start" })
      await page.setViewportSize({ width: 375, height: 812 })
      // 모바일 패스 대상: 메뉴 노출되는 페이지 + 사용자 드롭다운에서 자주 가는 곳
      const mobileTargets = [
        "/",
        "/explore",
        "/prediction",
        "/shop",
        "/community/baseball",
        "/community/football",
        "/my-posts",
        "/my-predictions",
        "/settings",
      ]
      for (const t of mobileTargets) {
        try {
          state.currentUrl = t
          state.currentAction = "mobile_navigation"
          await page.goto(`${BASE_URL}${t}`, { waitUntil: "domcontentloaded", timeout: 20000 })
          await page.waitForTimeout(1500)
          await page
            .screenshot({
              path: path.join(SHOTS_DIR, `mobile_${slugifyUrl(t)}.png`),
              fullPage: true,
            })
            .catch(() => {})
          await checkPageUiHeuristics(page, `mobile:${t}`)
        } catch (e) {
          appendEvent({
            kind: "page_error",
            path: `mobile:${t}`,
            message: (e as Error).message.slice(0, 200),
          })
        }
      }
      appendEvent({ kind: "phase", phase: "mobile_done" })
    }

    // 시나리오 (있으면)
    const scenariosPath = path.resolve(__dirname, "scenarios.json")
    if (fs.existsSync(scenariosPath)) {
      const scenarios = JSON.parse(fs.readFileSync(scenariosPath, "utf-8"))
      if (Array.isArray(scenarios) && scenarios.length > 0) {
        appendEvent({
          kind: "phase",
          phase: "scenarios_skipped",
          note: "scenarios 실행 미구현 — 빈 배열 권장",
        })
      }
    }

    fs.writeFileSync(
      VISITED_PATH,
      JSON.stringify({ visited: visitedDetail, queueRemaining: queue }, null, 2)
    )
    appendEvent({ kind: "phase", phase: "done" })
  } finally {
    state.currentAction = "teardown"
    await context.tracing.stop({ path: path.join(RUN_DIR, "trace.zip") }).catch(() => {})
    await context.close().catch(() => {})

    fs.writeFileSync(
      META_PATH,
      JSON.stringify(
        {
          ...JSON.parse(fs.readFileSync(META_PATH, "utf-8")),
          finishedAt: new Date().toISOString(),
        },
        null,
        2
      )
    )
  }
})
