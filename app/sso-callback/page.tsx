"use client"

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs"

export default function SSOCallbackPage() {
  return (
    <div className="worldcup-scope flex min-h-screen items-center justify-center">
      <AuthenticateWithRedirectCallback />
    </div>
  )
}
