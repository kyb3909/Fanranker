import type { ReactNode } from "react"
import { Suspense } from "react"
import { Header } from "@/components/header/header"
import { AppShellClient } from "@/components/app-shell-client"

interface AppShellProps {
  children: ReactNode
}

function HeaderFallback() {
  return (
    <header className="border-border bg-card/95 sticky top-0 z-50 w-full border-b backdrop-blur-md">
      <div className="mx-auto max-w-[1280px] px-6 sm:px-10">
        <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2" />
      </div>
    </header>
  )
}

export function AppShell({ children }: AppShellProps) {
  return (
    <AppShellClient
      header={
        <Suspense fallback={<HeaderFallback />}>
          <Header />
        </Suspense>
      }
    >
      {children}
    </AppShellClient>
  )
}
