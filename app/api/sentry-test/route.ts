// 임시: Sentry 연결 검증용. 검증 후 제거할 것.
// 기본 GET은 200, ?throw=1 일 때만 의도적으로 에러를 던져 Sentry 수집을 확인한다.
export const dynamic = "force-dynamic"

export function GET(req: Request) {
  if (new URL(req.url).searchParams.get("throw") === "1") {
    throw new Error("Sentry verification error (gongnori) — intentional, safe to resolve")
  }
  return Response.json({ ok: true, hint: "append ?throw=1 to trigger a test error" })
}
