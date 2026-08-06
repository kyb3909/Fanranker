import { z } from "zod"

/**
 * Server-side environment variables (API routes, server components only)
 * These are NOT available in client-side code.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
  FACEBOOK_ACCESS_TOKEN: z.string().optional(),
  // 콘텐츠 자동발행 킬스위치 — "off" 면 해당 cron 이 스킵 (배포 없이 즉시 정지)
  NEWS_AUTO_PUBLISH: z.string().optional(),
  AGG_AUTO_APPROVE: z.string().optional(),
  // LLM 파이프라인 공용 키 (뉴스 검사관·배정 데스크·요약·인사이트 등 12개 파일이 직접 참조).
  // 미설정 시 각 기능이 스킵/보류로 동작 — required 로 올리면 로컬 dev 가 통째로 막혀 optional 유지.
  // zod 편입 이유: 최대 사각지대였음 (gauntlet R17 / 단계 0-5, 2026-08-06)
  OPENAI_API_KEY: z.string().optional(),
  // 사가 카드 라우팅 킬스위치 ("off" = 발행 기사 → 사가 연동 정지)
  SAGA_CARD_ROUTING: z.string().optional(),
  // 배정 데스크 모드 ("shadow" = 관찰만 / 미설정·"off" = 정지) — Phase 2
  NEWS_ASSIGNMENT_DESK: z.string().optional(),
  // betman↔Soccerway 경기 매핑 shadow ("shadow" = 원장 기록만 / 미설정 = 정지) — 실록 단계 2
  MATCH_MAPPING_SHADOW: z.string().optional(),
  // 어드민 인사이트 요약 모델 override (기본값은 코드에)
  ADMIN_INSIGHT_MODEL: z.string().optional(),
  // 네이버 오픈API (뉴스 표기 대조·검색)
  NAVER_CLIENT_ID: z.string().optional(),
  NAVER_CLIENT_SECRET: z.string().optional(),
  // GA4 Data API (weekly-analytics cron) — 서비스 계정 3종 세트
  GA4_PROPERTY_ID: z.string().optional(),
  GA4_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GA4_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  // 시즌 이벤트 알림 웹훅 (주간 추첨·듀얼 결과 → 디스코드)
  DISCORD_EVENT_WEBHOOK_URL: z.string().url().optional(),
  // 운영 알림 디스코드 웹훅 (신고/검수/정산/크롤링 이슈 → 직원 채널). 미설정 시 알림 no-op.
  DISCORD_OPS_WEBHOOK_URL: z.string().url().optional(),
  // 뉴스봇 디스코드 서버 웹훅 (유저 대상 — docs/DISCORD_NEWSBOT_DESIGN.md). 미설정 채널은 no-op.
  DISCORD_NEWS_WEBHOOK_ARSENAL: z.string().url().optional(),
  DISCORD_NEWS_WEBHOOK_LIVERPOOL: z.string().url().optional(),
  DISCORD_NEWS_WEBHOOK_CHELSEA: z.string().url().optional(),
  DISCORD_NEWS_WEBHOOK_FOOTBALL: z.string().url().optional(),
  DISCORD_DIGEST_WEBHOOK_URL: z.string().url().optional(),
  // 다이제스트 멘션 (옵트인 역할만 — 예: "<@&123>"). @everyone 금지.
  DISCORD_DIGEST_MENTION: z.string().optional(),
  // 역할 선택 버튼 인터랙션 (app/api/discord/interactions). 둘 다 있어야 버튼 동작.
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_APP_PUBLIC_KEY: z.string().optional(),
  // Cloudflare Stream (영상 업로드 — direct creator upload). 둘 다 있어야 영상 업로드 활성화.
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_STREAM_API_TOKEN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
})

/**
 * Client-side environment variables (NEXT_PUBLIC_ prefix)
 * Available in both server and client code.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_ADSENSE_ID: z.string().optional(),
  NEXT_PUBLIC_GA_ID: z.string().optional(),
})

// Next.js inlines NEXT_PUBLIC_ vars at build time — must reference explicitly
const clientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_ADSENSE_ID: process.env.NEXT_PUBLIC_ADSENSE_ID,
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
}

/**
 * Validate and export typed environment variables.
 * - Server code: use `env` (includes all variables)
 * - Client code: use `clientEnvVars` (NEXT_PUBLIC_ only)
 */
function validateEnv() {
  const isServer = typeof window === "undefined"

  const clientResult = clientSchema.safeParse(clientEnv)
  if (!clientResult.success) {
    const errors = clientResult.error.flatten().fieldErrors
    console.error("Invalid client environment variables:", errors)
    throw new Error(`Missing client environment variables: ${Object.keys(errors).join(", ")}`)
  }

  if (isServer) {
    const serverResult = serverSchema.safeParse(process.env)
    if (!serverResult.success) {
      const errors = serverResult.error.flatten().fieldErrors
      console.error("Invalid server environment variables:", errors)
      throw new Error(`Missing server environment variables: ${Object.keys(errors).join(", ")}`)
    }
    return { ...clientResult.data, ...serverResult.data }
  }

  return clientResult.data
}

type ServerEnv = z.infer<typeof serverSchema> & z.infer<typeof clientSchema>
type ClientEnv = z.infer<typeof clientSchema>

// Validate on first import
export const env = validateEnv() as ServerEnv
