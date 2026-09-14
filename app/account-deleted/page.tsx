"use client"
import { useClerk } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
export default function AccountDeletedPage() {
  const { signOut } = useClerk()
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-12">
      <h1 className="text-xl font-semibold">탈퇴 처리된 계정입니다</h1>
      <p className="text-muted-foreground text-sm">
        기존 계정으로 서비스를 이용할 수 없습니다. 로그아웃 후 홈으로 이동해주세요.
      </p>
      <Button onClick={() => signOut({ redirectUrl: "/" })}>로그아웃하고 홈으로</Button>
    </main>
  )
}
