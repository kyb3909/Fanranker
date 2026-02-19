/**
 * Integrated Middleware: Clerk + Supabase (Third-Party Auth)
 *
 * This middleware handles authentication for Clerk only.
 * Supabase uses Clerk as Third-Party Auth provider, so we don't need
 * to handle Supabase's own OAuth flow in middleware.
 *
 * Key responsibilities:
 * 1. Clerk authentication via clerkMiddleware()
 * 2. Route protection (optional)
 *
 * Note: Supabase authentication is handled via Clerk tokens in the client/server code,
 * not through Supabase's own OAuth flow. This prevents OAuth errors.
 *
 * @see https://clerk.com/docs/nextjs/getting-started/quickstart
 * @see https://supabase.com/docs/guides/auth/third-party/clerk
 */

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { isRouteAllowed } from '@/lib/site-config'

// Define protected routes
const isAdminRoute = createRouteMatcher(['/admin(.*)'])

// Sensitive endpoints that need strict rate limiting
const STRICT_PATHS = [
  '/api/tokens/spend',
  '/api/payments/purchase',
  '/api/predictions/settle',
  '/api/commissions/orders',
  '/api/upload/image',
  '/api/posts',
  '/api/votes',
  '/api/follow',
]

function isStrictPath(pathname: string): boolean {
  return STRICT_PATHS.some(p => pathname.startsWith(p))
}

function isDeleteProfile(req: NextRequest): boolean {
  return req.nextUrl.pathname === '/api/profile/me' && req.method === 'DELETE'
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  try {
    // 사이트 모드 라우트 차단
    if (!isRouteAllowed(req.nextUrl.pathname)) {
      if (req.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: '이 사이트에서는 사용할 수 없는 기능입니다.' },
          { status: 404 }
        )
      }
      return NextResponse.redirect(new URL('/', req.url))
    }

    // Rate limiting for API routes
    if (req.nextUrl.pathname.startsWith('/api/')) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown'

      const isStrict = isStrictPath(req.nextUrl.pathname) || isDeleteProfile(req)
      const preset = isStrict ? RATE_LIMITS.STRICT : RATE_LIMITS.STANDARD
      const key = `${ip}:${req.nextUrl.pathname}`

      const result = rateLimit(key, preset.limit, preset.windowMs)

      if (!result.success) {
        return NextResponse.json(
          { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
          {
            status: 429,
            headers: {
              'Retry-After': '60',
              'X-RateLimit-Limit': String(preset.limit),
              'X-RateLimit-Remaining': '0',
            },
          }
        )
      }
    }

    // Protect admin routes - require authentication (페이지 라우트만)
    if (isAdminRoute(req) && !req.nextUrl.pathname.startsWith('/api')) {
      const { userId } = await auth()

      if (!userId) {
        const signInUrl = new URL('/sign-up', req.url)
        signInUrl.searchParams.set('redirect_url', req.url)
        return NextResponse.redirect(signInUrl)
      }
    }
  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.next()
  }
})

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, etc.
     * - API routes (trpc)
     */
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
