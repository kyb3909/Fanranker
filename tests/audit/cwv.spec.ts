/**
 * Core Web Vitals — production 사이트의 핵심 페이지 성능 측정.
 * Lighthouse 전체 통합은 의존성/실행시간 부담이라 PerformanceObserver 로 핵심 메트릭만.
 *
 * 측정값:
 *   LCP (Largest Contentful Paint) — 가장 큰 콘텐츠 그려진 시점 (Core Web Vital)
 *   FCP (First Contentful Paint)   — 첫 텍스트/이미지 그려진 시점
 *   CLS (Cumulative Layout Shift)  — 누적 레이아웃 시프트 점수
 *   TTFB (Time To First Byte)      — 서버 응답 시작 시점
 *   DCL  (DOMContentLoaded)        — DOM 파싱 완료
 *   Load                           — 모든 리소스 로드 완료
 *
 * Google CWV 등급 (모바일 기준):
 *   LCP:  < 2.5s good / < 4s needs improvement / >= 4s poor
 *   CLS:  < 0.1 good / < 0.25 needs improvement / >= 0.25 poor
 *   INP:  < 200ms good / < 500ms needs improvement / >= 500ms poor (직접 측정 어려움)
 *   FCP:  < 1.8s good / < 3s needs improvement / >= 3s poor
 *   TTFB: < 0.8s good / < 1.8s needs improvement / >= 1.8s poor
 *
 * 실행:
 *   BASE_URL=https://gongnori.fan pnpm exec playwright test \
 *     --config=playwright.audit.config.ts tests/audit/cwv.spec.ts
 */
import { test, type Page } from "@playwright/test"
import * as fs from "node:fs"
import * as path from "node:path"
import * as dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") })

const BASE_URL = process.env.BASE_URL || "https://gongnori.fan"
const EMAIL = process.env.AUDIT_EMAIL || ""
const PASSWORD = process.env.AUDIT_PASSWORD || ""

const CWV_TARGETS = ["/", "/explore", "/prediction", "/community/baseball", "/games", "/shop"]
const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1440, height: 900 },
}
const SAMPLES_PER_PAGE = 3 // 같은 페이지를 N번 측정해서 중앙값 사용 (variance 줄임)

const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
const RUN_DIR = path.resolve(__dirname, "reports", `cwv-${TS}`)
fs.mkdirSync(RUN_DIR, { recursive: true })
const RESULTS_PATH = path.join(RUN_DIR, "cwv-results.json")
const REPORT_PATH = path.join(RUN_DIR, "cwv-report.md")

interface CwvMetrics {
  lcp: number | null
  fcp: number | null
  cls: number | null
  ttfb: number | null
  dcl: number | null
  load: number | null
}

interface PageResult {
  url: string
  viewport: "mobile" | "desktop"
  samples: CwvMetrics[]
  median: CwvMetrics
  grades: Record<string, "good" | "needs-improvement" | "poor" | "unknown">
}

function median(arr: number[]): number | null {
  const v = arr.filter((n) => n != null && !isNaN(n)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 === 0 ? (v[m - 1] + v[m]) / 2 : v[m]
}

function gradeLcp(ms: number | null) {
  if (ms == null) return "unknown" as const
  if (ms < 2500) return "good" as const
  if (ms < 4000) return "needs-improvement" as const
  return "poor" as const
}
function gradeFcp(ms: number | null) {
  if (ms == null) return "unknown" as const
  if (ms < 1800) return "good" as const
  if (ms < 3000) return "needs-improvement" as const
  return "poor" as const
}
function gradeCls(v: number | null) {
  if (v == null) return "unknown" as const
  if (v < 0.1) return "good" as const
  if (v < 0.25) return "needs-improvement" as const
  return "poor" as const
}
function gradeTtfb(ms: number | null) {
  if (ms == null) return "unknown" as const
  if (ms < 800) return "good" as const
  if (ms < 1800) return "needs-improvement" as const
  return "poor" as const
}

async function loginIfNeeded(page: Page): Promise<void> {
  if (!EMAIL || !PASSWORD) return
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await page.waitForTimeout(1500)
  const trigger = page.getByRole("button", { name: "로그인 메뉴" }).first()
  if ((await trigger.count().catch(() => 0)) === 0) return // 이미 로그인 됐을 가능성
  await trigger.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(800)
  const emailInput = page.locator('#sign-in-email, input[type="email"]').first()
  await emailInput.waitFor({ state: "visible", timeout: 10000 }).catch(() => {})
  if ((await emailInput.count().catch(() => 0)) === 0) return
  await emailInput.fill(EMAIL)
  const passwordInput = page.locator('#sign-in-password, input[type="password"]').first()
  await passwordInput.waitFor({ state: "visible", timeout: 5000 }).catch(() => {})
  if ((await passwordInput.count().catch(() => 0)) === 0) return
  await passwordInput.fill(PASSWORD)
  const submitBtn = page
    .locator('form button[type="submit"], button[type="submit"]:has-text("로그인")')
    .first()
  if ((await submitBtn.count().catch(() => 0)) > 0) {
    await submitBtn.click({ timeout: 5000 }).catch(() => {})
  } else {
    await passwordInput.press("Enter")
  }
  await page.waitForTimeout(3000)
}

async function measurePage(page: Page, url: string): Promise<CwvMetrics> {
  // 캐시 영향 줄이기 위해 매번 새 navigation
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })

  // 메트릭 수집 — PerformanceObserver 는 navigation 전에 등록되어야 LCP 잡음.
  // 여기선 page.goto 후 evaluate 로 buffered: true 사용해서 누락된 entries 도 받음.
  const metrics = await page.evaluate(
    () =>
      new Promise<{
        lcp: number | null
        fcp: number | null
        cls: number
        ttfb: number | null
        dcl: number | null
        load: number | null
      }>((resolve) => {
        let lcp: number | null = null
        let fcp: number | null = null
        let cls = 0

        const lcpObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const entry = e as PerformanceEntry & { startTime: number }
            lcp = entry.startTime
          }
        })
        try {
          lcpObs.observe({ type: "largest-contentful-paint", buffered: true })
        } catch {
          /* unsupported */
        }

        const paintObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.name === "first-contentful-paint") fcp = e.startTime
          }
        })
        try {
          paintObs.observe({ type: "paint", buffered: true })
        } catch {
          /* ignore */
        }

        const clsObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const lse = e as PerformanceEntry & { value: number; hadRecentInput: boolean }
            if (!lse.hadRecentInput) cls += lse.value
          }
        })
        try {
          clsObs.observe({ type: "layout-shift", buffered: true })
        } catch {
          /* ignore */
        }

        // 4초 동안 LCP / CLS 캡처 후 종료 (LCP 는 사용자 인터랙션 전까지 갱신됨)
        setTimeout(() => {
          lcpObs.disconnect()
          paintObs.disconnect()
          clsObs.disconnect()

          const navEntries = performance.getEntriesByType(
            "navigation"
          ) as PerformanceNavigationTiming[]
          const nav = navEntries[0]
          const ttfb = nav ? nav.responseStart - nav.requestStart : null
          const dcl = nav ? nav.domContentLoadedEventEnd - nav.startTime : null
          const load = nav ? nav.loadEventEnd - nav.startTime : null
          resolve({ lcp, fcp, cls, ttfb, dcl, load })
        }, 4000)
      })
  )
  return metrics
}

test("Core Web Vitals — 핵심 페이지 성능 측정", async ({ browser }) => {
  test.setTimeout(30 * 60 * 1000) // 30분

  const results: PageResult[] = []
  const meta = {
    baseUrl: BASE_URL,
    startedAt: new Date().toISOString(),
    targets: CWV_TARGETS,
    samplesPerPage: SAMPLES_PER_PAGE,
  }

  for (const [vpName, viewport] of Object.entries(VIEWPORTS) as Array<
    ["mobile" | "desktop", typeof VIEWPORTS.mobile]
  >) {
    const context = await browser.newContext({
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      viewport,
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()
    await loginIfNeeded(page)

    for (const target of CWV_TARGETS) {
      const url = `${BASE_URL}${target}`
      const samples: CwvMetrics[] = []
      for (let i = 0; i < SAMPLES_PER_PAGE; i++) {
        try {
          const m = await measurePage(page, url)
          samples.push(m)
        } catch (e) {
          samples.push({ lcp: null, fcp: null, cls: null, ttfb: null, dcl: null, load: null })
          console.error(`measure failed: ${target} sample ${i}`, e)
        }
      }
      const med: CwvMetrics = {
        lcp: median(samples.map((s) => s.lcp ?? NaN)),
        fcp: median(samples.map((s) => s.fcp ?? NaN)),
        cls: median(samples.map((s) => s.cls ?? NaN)),
        ttfb: median(samples.map((s) => s.ttfb ?? NaN)),
        dcl: median(samples.map((s) => s.dcl ?? NaN)),
        load: median(samples.map((s) => s.load ?? NaN)),
      }
      results.push({
        url: target,
        viewport: vpName,
        samples,
        median: med,
        grades: {
          lcp: gradeLcp(med.lcp),
          fcp: gradeFcp(med.fcp),
          cls: gradeCls(med.cls),
          ttfb: gradeTtfb(med.ttfb),
        },
      })
      console.log(
        `${vpName} ${target}: LCP=${med.lcp?.toFixed(0)}ms (${gradeLcp(med.lcp)}) | FCP=${med.fcp?.toFixed(0)}ms | CLS=${med.cls?.toFixed(3)} | TTFB=${med.ttfb?.toFixed(0)}ms`
      )
    }
    await context.close()
  }

  fs.writeFileSync(
    RESULTS_PATH,
    JSON.stringify({ meta: { ...meta, finishedAt: new Date().toISOString() }, results }, null, 2)
  )

  // 마크다운 리포트 생성
  const md: string[] = []
  md.push(`# CWV Report — ${BASE_URL} — ${TS}`)
  md.push("")
  md.push(
    `> ${results.length}개 측정 (페이지 ${CWV_TARGETS.length} × viewport 2 × 샘플 ${SAMPLES_PER_PAGE}회 → 중앙값)`
  )
  md.push("")
  md.push("## 등급별 요약")
  md.push("")
  const summarize = (vp: "mobile" | "desktop") => {
    const rs = results.filter((r) => r.viewport === vp)
    const counts = { good: 0, "needs-improvement": 0, poor: 0, unknown: 0 }
    for (const r of rs)
      for (const g of Object.values(r.grades))
        counts[g as keyof typeof counts] = (counts[g as keyof typeof counts] || 0) + 1
    return counts
  }
  for (const vp of ["mobile", "desktop"] as const) {
    const c = summarize(vp)
    md.push(
      `**${vp}**: 🟢 good ${c.good} / 🟡 needs ${c["needs-improvement"]} / 🔴 poor ${c.poor} / ⚪ unknown ${c.unknown}`
    )
  }
  md.push("")
  md.push("## 페이지별 상세 (모바일)")
  md.push("")
  md.push("| 페이지 | LCP | FCP | CLS | TTFB |")
  md.push("|---|---:|---:|---:|---:|")
  const symMap = { good: "🟢", "needs-improvement": "🟡", poor: "🔴", unknown: "⚪" }
  for (const r of results.filter((x) => x.viewport === "mobile")) {
    const lcp = r.median.lcp != null ? `${r.median.lcp.toFixed(0)}ms ${symMap[r.grades.lcp]}` : "-"
    const fcp = r.median.fcp != null ? `${r.median.fcp.toFixed(0)}ms ${symMap[r.grades.fcp]}` : "-"
    const cls = r.median.cls != null ? `${r.median.cls.toFixed(3)} ${symMap[r.grades.cls]}` : "-"
    const ttfb =
      r.median.ttfb != null ? `${r.median.ttfb.toFixed(0)}ms ${symMap[r.grades.ttfb]}` : "-"
    md.push(`| ${r.url} | ${lcp} | ${fcp} | ${cls} | ${ttfb} |`)
  }
  md.push("")
  md.push("## 페이지별 상세 (데스크톱)")
  md.push("")
  md.push("| 페이지 | LCP | FCP | CLS | TTFB |")
  md.push("|---|---:|---:|---:|---:|")
  for (const r of results.filter((x) => x.viewport === "desktop")) {
    const lcp = r.median.lcp != null ? `${r.median.lcp.toFixed(0)}ms ${symMap[r.grades.lcp]}` : "-"
    const fcp = r.median.fcp != null ? `${r.median.fcp.toFixed(0)}ms ${symMap[r.grades.fcp]}` : "-"
    const cls = r.median.cls != null ? `${r.median.cls.toFixed(3)} ${symMap[r.grades.cls]}` : "-"
    const ttfb =
      r.median.ttfb != null ? `${r.median.ttfb.toFixed(0)}ms ${symMap[r.grades.ttfb]}` : "-"
    md.push(`| ${r.url} | ${lcp} | ${fcp} | ${cls} | ${ttfb} |`)
  }
  md.push("")
  md.push("## 등급 기준 (Google Core Web Vitals)")
  md.push("")
  md.push("- **LCP**: < 2.5s 🟢 / < 4s 🟡 / ≥ 4s 🔴")
  md.push("- **FCP**: < 1.8s 🟢 / < 3s 🟡 / ≥ 3s 🔴")
  md.push("- **CLS**: < 0.1 🟢 / < 0.25 🟡 / ≥ 0.25 🔴")
  md.push("- **TTFB**: < 0.8s 🟢 / < 1.8s 🟡 / ≥ 1.8s 🔴")

  fs.writeFileSync(REPORT_PATH, md.join("\n"))
  console.log(`\nResults: ${RESULTS_PATH}`)
  console.log(`Report:  ${REPORT_PATH}`)
})
