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

export type ServerEnv = z.infer<typeof serverSchema> & z.infer<typeof clientSchema>
export type ClientEnv = z.infer<typeof clientSchema>

// Validate on first import
export const env = validateEnv() as ServerEnv
