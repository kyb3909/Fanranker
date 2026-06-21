"use client"

import { Suspense, useEffect, useState } from "react"
import { useSignIn } from "@clerk/nextjs"
import { useSearchParams, useRouter } from "next/navigation"
import { Spinner } from "@/components/ui/spinner"

/**
 * 원클릭 로그인 링크 — Clerk sign-in token(ticket)을 URL 로 받아 즉시 로그인.
 * 2FA/인증코드 등 모든 단계를 우회한다. 토큰은 1회용·단기 만료라 관리자만 발급 가능.
 * 사용: /login-link?ticket=<sign_in_token>
 */
function Redeemer() {
  const { signIn, setActive, isLoaded } = useSignIn()
  const params = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState("")

  useEffect(() => {
    if (!isLoaded || !signIn) return
    const ticket = params.get("ticket") || params.get("__clerk_ticket")
    if (!ticket) {
      setError("로그인 토큰이 없어요. 받은 링크를 그대로 열어주세요.")
      return
    }
    signIn
      .create({ strategy: "ticket", ticket })
      .then((res) => {
        if (res.status === "complete") return setActive!({ session: res.createdSessionId })
        throw new Error(`status: ${res.status}`)
      })
      .then(() => router.replace("/"))
      .catch((e: unknown) => {
        const msg =
          (e as { errors?: { message?: string }[] })?.errors?.[0]?.message ||
          (e as { message?: string })?.message ||
          String(e)
        setError(
          `로그인에 실패했어요 (${msg}). 링크가 만료됐을 수 있어요 — 새 링크를 요청해주세요.`
        )
      })
  }, [isLoaded, signIn, params, router, setActive])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <>
          <Spinner className="size-6" />
          <p className="text-muted-foreground text-sm">로그인 중…</p>
        </>
      )}
    </div>
  )
}

export default function LoginLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Spinner className="size-6" />
        </div>
      }
    >
      <Redeemer />
    </Suspense>
  )
}
