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
  try {
    // Protect admin routes - require authentication (페이지 라우트만)
    if (isAdminRoute(req) && !req.nextUrl.pathname.startsWith('/api')) {
      const { userId } = await auth()
      
      if (!userId) {
        const signInUrl = new URL('/sign-in', req.url)
        signInUrl.searchParams.set('redirect_url', req.url)
        return NextResponse.redirect(signInUrl)
      }
    }

    // Note: API routes should use currentUser() instead of auth()
    // This middleware only handles page route protection
    // Supabase Third-Party Auth with Clerk doesn't require
    // Supabase session management in middleware. Authentication is handled
    // via Clerk tokens passed to Supabase client in client/server code.
  } catch (error) {
    console.error('Middleware error:', error)
    // Return a proper response instead of throwing
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
