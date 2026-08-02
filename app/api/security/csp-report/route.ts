import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"

/**
 * POST /api/security/csp-report
 *
 * CSP 위반 보고 수신 엔드포인트. `Content-Security-Policy-Report-Only` 헤더의
 * `report-uri` 디렉티브가 이 경로로 위반을 POST한다.
 *
 * 지원 포맷:
 *  1. Level 2: `report-uri` → body = `{ "csp-report": {...} }` (Content-Type: application/csp-report)
 *  2. Level 3: `report-to` → body = `[{ "type": "csp-violation", "body": {...} }, ...]` (application/reports+json)
 *
 * 현재는 Level 2만 활성. Level 3로 전환 시 이 핸들러가 양쪽 다 처리하도록 남겨둠.
 *
 * 보안: 인증 불필요 (브라우저가 자동 전송). rate-limit은 보수적으로 LENIENT.
 * 수집한 리포트는 Sentry에 captureMessage로 쌓아 관측한다 — 일정 기간 clean하면
 * Report-Only를 Enforce로 전환.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as unknown

    const reports = normalizeReports(body)
    if (reports.length === 0) {
      return new NextResponse(null, { status: 204 })
    }

    for (const r of reports) {
      if (isKnownUnactionable(r)) continue

      Sentry.captureMessage("csp-violation", {
        level: "warning",
        tags: {
          directive: r.effectiveDirective ?? r.violatedDirective ?? "unknown",
          blockedHost: safeHost(r.blockedUri),
          documentHost: safeHost(r.documentUri),
        },
        extra: {
          ...r,
          userAgent: request.headers.get("user-agent") ?? null,
        },
      })
    }

    return new NextResponse(null, { status: 204 })
  } catch {
    // 보고 자체가 실패해도 클라이언트엔 아무 영향 없어야 함
    return new NextResponse(null, { status: 204 })
  }
}

/**
 * Sentry 로 올리지 않을 위반 — 이미 원인을 알고 있고, 정책을 고치기 전엔 사라지지 않는 것들.
 *
 * 2026-08-02 /benchmark 실측: 페이지뷰마다 위반 리포트가 5건씩 올라가고 있었고
 * (= Sentry 이벤트 5건/뷰), 전부 `blocked-uri: inline` 이었다.
 *   · style-src inline → React `style={{...}}`. 정책에 'unsafe-inline' 을 넣어 해소함.
 *   · script-src inline → **Next.js 가 하이드레이션·RSC 스트리밍용으로 주입하는 프레임워크
 *     스크립트.** 없애려면 nonce 기반 CSP(미들웨어에서 nonce 발급 → Next 가 자동 부착)가
 *     필요하다. 그 작업 전까지는 매 페이지뷰마다 반드시 발생하므로, 관측 가치가 0 인데
 *     Sentry 쿼터만 태우고 진짜 에러를 묻는다.
 *
 * **외부 호스트가 차단된 위반은 그대로 보고한다** — 그게 침입·서드파티 변경의 실제 신호다.
 * 여기서 거르는 건 "우리 정책 모양이 코드와 안 맞는다"는, 이미 아는 사실뿐이다.
 *
 * nonce CSP 를 도입하면 이 함수를 지워야 한다.
 */
function isKnownUnactionable(r: CspReport): boolean {
  const blocked = (r.blockedUri ?? "").toLowerCase()
  if (blocked !== "inline" && blocked !== "self") return false

  const directive = (r.effectiveDirective ?? r.violatedDirective ?? "").toLowerCase()
  return directive.startsWith("script-src") || directive.startsWith("style-src")
}

interface CspReport {
  documentUri?: string
  referrer?: string
  violatedDirective?: string
  effectiveDirective?: string
  originalPolicy?: string
  blockedUri?: string
  sourceFile?: string
  lineNumber?: number
  columnNumber?: number
  statusCode?: number
  disposition?: string
  sample?: string
}

function normalizeReports(body: unknown): CspReport[] {
  if (!body) return []

  // Level 2 포맷: { "csp-report": {...} }
  if (typeof body === "object" && body !== null && "csp-report" in body) {
    const raw = (body as { "csp-report": Record<string, unknown> })["csp-report"]
    return [mapLevel2(raw)]
  }

  // Level 3 포맷: [{ type: "csp-violation", body: {...} }]
  if (Array.isArray(body)) {
    return body
      .filter(
        (r): r is { type: string; body: Record<string, unknown> } =>
          typeof r === "object" && r !== null && (r as { type?: unknown }).type === "csp-violation"
      )
      .map((r) => mapLevel3(r.body))
  }

  return []
}

function mapLevel2(raw: Record<string, unknown>): CspReport {
  return {
    documentUri: strOrUndef(raw["document-uri"]),
    referrer: strOrUndef(raw["referrer"]),
    violatedDirective: strOrUndef(raw["violated-directive"]),
    effectiveDirective: strOrUndef(raw["effective-directive"]),
    originalPolicy: strOrUndef(raw["original-policy"]),
    blockedUri: strOrUndef(raw["blocked-uri"]),
    sourceFile: strOrUndef(raw["source-file"]),
    lineNumber: numOrUndef(raw["line-number"]),
    columnNumber: numOrUndef(raw["column-number"]),
    statusCode: numOrUndef(raw["status-code"]),
    disposition: strOrUndef(raw["disposition"]),
    sample: strOrUndef(raw["script-sample"]),
  }
}

function mapLevel3(raw: Record<string, unknown>): CspReport {
  return {
    documentUri: strOrUndef(raw["documentURL"]),
    referrer: strOrUndef(raw["referrer"]),
    violatedDirective: strOrUndef(raw["effectiveDirective"]),
    effectiveDirective: strOrUndef(raw["effectiveDirective"]),
    originalPolicy: strOrUndef(raw["originalPolicy"]),
    blockedUri: strOrUndef(raw["blockedURL"]),
    sourceFile: strOrUndef(raw["sourceFile"]),
    lineNumber: numOrUndef(raw["lineNumber"]),
    columnNumber: numOrUndef(raw["columnNumber"]),
    statusCode: numOrUndef(raw["statusCode"]),
    disposition: strOrUndef(raw["disposition"]),
    sample: strOrUndef(raw["sample"]),
  }
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined
}

function safeHost(uri: string | undefined): string {
  if (!uri) return "unknown"
  try {
    return new URL(uri).host || uri
  } catch {
    return uri
  }
}
