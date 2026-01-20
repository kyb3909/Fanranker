/**
 * Clerk Authentication Example Component
 *
 * This component demonstrates how to use Clerk's authentication
 * components in your Next.js application.
 *
 * Use this as a reference for implementing auth in your pages/components.
 *
 * @see https://clerk.com/docs/nextjs/getting-started/quickstart
 */

'use client'

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'

export function ClerkAuthExample() {
  return (
    <div className="flex items-center gap-4">
      {/* Show when user is NOT signed in */}
      <SignedOut>
        <SignInButton mode="modal">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            로그인
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
            회원가입
          </button>
        </SignUpButton>
      </SignedOut>

      {/* Show when user IS signed in */}
      <SignedIn>
        <UserButton
          appearance={{
            elements: {
              avatarBox: 'w-10 h-10',
            },
          }}
        />
      </SignedIn>
    </div>
  )
}
