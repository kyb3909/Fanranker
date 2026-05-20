"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plug } from "lucide-react"

interface Check {
  ok: boolean
  latencyMs: number
  error: string | null
}

interface HealthData {
  checks: Record<string, Check>
  checkedAt: string
}

const SERVICE_LABELS: Record<string, string> = {
  supabase: "Supabase (DB)",
  clerk: "Clerk (인증)",
}

export function ApiHealthStrip() {
  const { data, isLoading } = useSWR<HealthData>("/api/admin/system/health-ping", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-blue-600" />
        <h2 className="text-lg font-semibold">외부 서비스 상태</h2>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-xs font-medium">
            메인 앱이 직접 의존하는 외부 서비스 — 1분마다 갱신
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="text-muted-foreground text-sm">확인 중…</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(data.checks).map(([key, check]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        check.ok ? "bg-green-500" : "bg-primary"
                      }`}
                    />
                    <span className="text-sm font-medium">{SERVICE_LABELS[key] ?? key}</span>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs ${check.ok ? "text-green-600" : "text-primary"}`}>
                      {check.ok ? "정상" : "오류"}
                    </div>
                    <div className="text-muted-foreground text-xs">{check.latencyMs}ms</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {data && (
            <div className="mt-2 space-y-1">
              {Object.entries(data.checks)
                .filter(([, c]) => c.error)
                .map(([key, c]) => (
                  <p key={key} className="text-primary text-xs">
                    {SERVICE_LABELS[key] ?? key}: {c.error}
                  </p>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
