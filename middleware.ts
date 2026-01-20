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

// Define protected routes
const isAdminRoute = createRouteMatcher(['/admin(.*)'])

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Protect admin routes - require authentication
  if (isAdminRoute(req)) {
    const { userId } = await auth.protect()
    
    if (!userId) {
      return NextResponse.redirect(new URL('/sign-in', req.url))
    }

    // Admin check will be done in the page/API route itself
    // Middleware only checks authentication, not authorization
  }

  // Note: Supabase Third-Party Auth with Clerk doesn't require
  // Supabase session management in middleware. Authentication is handled
  // via Clerk tokens passed to Supabase client in client/server code.
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
