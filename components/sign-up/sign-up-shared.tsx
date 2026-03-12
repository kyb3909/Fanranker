import { Check } from "lucide-react"

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────
export interface Category {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  description: string | null
}

// ────────────────────────────────────────────
// Clerk error → 한국어 매핑
// ────────────────────────────────────────────
const CLERK_ERROR_MAP: Record<string, string> = {
  form_identifier_exists: "이미 가입된 이메일입니다.",
  form_password_pwned: "보안에 취약한 비밀번호입니다. 다른 비밀번호를 사용해주세요.",
  form_password_length_too_short: "비밀번호는 8자 이상이어야 합니다.",
  form_param_nil: "이메일과 비밀번호를 모두 입력해주세요.",
  too_many_attempts: "너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.",
  form_code_incorrect: "인증코드가 올바르지 않습니다.",
  verification_expired: "인증코드가 만료되었습니다. 다시 요청해주세요.",
  session_exists: "이미 로그인되어 있습니다.",
  form_password_not_strong_enough: "비밀번호가 너무 단순합니다. 더 복잡한 비밀번호를 사용해주세요.",
  form_identifier_not_found: "등록되지 않은 이메일입니다.",
}

export function getClerkErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "errors" in err &&
    Array.isArray((err as { errors: unknown[] }).errors)
  ) {
    const first = (err as { errors: { code?: string; message?: string }[] }).errors[0]
    if (first?.code && CLERK_ERROR_MAP[first.code]) {
      return CLERK_ERROR_MAP[first.code]
    }
    if (first?.message) return first.message
  }
  return "오류가 발생했습니다. 다시 시도해주세요."
}

// ────────────────────────────────────────────
// Google SVG icon
// ────────────────────────────────────────────
export function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

// ────────────────────────────────────────────
// Step indicator
// ────────────────────────────────────────────
export function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1
        const isActive = step === current
        const isDone = step < current
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                isDone
                  ? "bg-primary text-primary-foreground"
                  : isActive
                    ? "bg-primary text-primary-foreground ring-primary/30 ring-4"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {isDone ? <Check className="h-4 w-4" /> : step}
            </div>
            {step < total && (
              <div
                className={`h-0.5 w-8 rounded-full transition-colors ${
                  isDone ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────
// sessionStorage keys
// ────────────────────────────────────────────
export const SS_TERMS_AGREED = "signup_terms_agreed"
