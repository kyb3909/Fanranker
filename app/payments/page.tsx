"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2,
  CreditCard,
  ArrowLeft,
  Circle,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
} from "lucide-react"
import { useRouter } from "next/navigation"

interface Transaction {
  id: string
  type: "earn" | "spend" | "reset" | "purchase"
  amount: number
  description: string
  createdAt: Date
  balanceAfter?: number
}

interface TokenInfo {
  balance: number
  totalEarned: number
  totalSpent: number
  lastResetAt: string
}

export default function PaymentsPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "earn" | "spend">("all")

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/")
      return
    }

    async function fetchTransactions() {
      if (!isSignedIn) return

      setIsLoading(true)
      try {
        // Fetch token balance
        const balanceRes = await fetch("/api/tokens/balance")
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json()
          setTokenInfo({
            balance: balanceData.balance,
            totalEarned: balanceData.totalEarned || 0,
            totalSpent: 0,
            lastResetAt: balanceData.lastResetAt,
          })
        }

        // Fetch transaction history
        const historyRes = await fetch("/api/tokens/history")
        if (historyRes.ok) {
          const historyData = await historyRes.json()
          setTransactions(historyData.transactions || [])
        }
      } catch {
        setErrorMessage("내역을 불러오는데 실패했습니다.")
      } finally {
        setIsLoading(false)
      }
    }

    if (isSignedIn) {
      fetchTransactions()
    }
  }, [isSignedIn, isLoaded, router])

  // 필터링된 거래 목록
  const filteredTransactions = transactions.filter((tx) => {
    if (activeTab === "all") return true
    if (activeTab === "earn") return tx.type === "earn" || tx.type === "reset"
    if (activeTab === "spend") return tx.type === "spend"
    return true
  })

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isSignedIn) {
    return null
  }

  return (
    <main id="main-content" className="mx-auto max-w-[800px] px-4 py-6" tabIndex={-1}>
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <CreditCard className="text-primary h-6 w-6" />
          <h1 className="text-xl font-bold">볼 내역</h1>
        </div>
      </div>

      {/* 에러 상태 */}
      {errorMessage && (
        <Card className="mb-6 p-8 text-center">
          <p className="mb-3 text-sm text-red-500">{errorMessage}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            다시 시도
          </Button>
        </Card>
      )}

      {/* 현재 잔액 카드 */}
      {tokenInfo && (
        <Card className="from-primary/10 to-primary/5 border-primary/20 mb-6 bg-gradient-to-br p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground mb-1 text-sm">현재 보유 볼</p>
              <div className="flex items-center gap-2">
                <Circle className="fill-primary text-primary h-6 w-6" />
                <span className="text-primary text-3xl font-bold">{tokenInfo.balance}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-muted-foreground text-xs">매일 자정 10볼 충전</p>
              <p className="text-muted-foreground mt-1 text-xs">
                마지막 충전:{" "}
                {new Date(tokenInfo.lastResetAt).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 통계 카드 */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
            <span className="text-muted-foreground text-sm">총 획득</span>
          </div>
          <p className="text-xl font-bold text-emerald-600">+{tokenInfo?.totalEarned || 0} 볼</p>
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-red-500" />
            <span className="text-muted-foreground text-sm">총 사용</span>
          </div>
          <p className="text-xl font-bold text-red-600">-{tokenInfo?.totalSpent || 0} 볼</p>
        </Card>
      </div>

      {/* 탭 */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="w-full"
      >
        <TabsList className="mb-4 grid w-full grid-cols-3">
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="earn">획득</TabsTrigger>
          <TabsTrigger value="spend">사용</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            <Card className="p-8 text-center">
              <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">내역을 불러오는 중...</p>
            </Card>
          ) : filteredTransactions.length > 0 ? (
            <div className="space-y-2">
              {filteredTransactions.map((tx) => (
                <Card key={tx.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`rounded-full p-2 ${
                          tx.type === "earn" || tx.type === "reset"
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-red-100 text-red-600"
                        }`}
                      >
                        {tx.type === "earn" || tx.type === "reset" ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{tx.description}</p>
                        <p className="text-muted-foreground text-xs">
                          {new Date(tx.createdAt).toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold ${
                          tx.type === "earn" || tx.type === "reset"
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {tx.type === "earn" || tx.type === "reset" ? "+" : "-"}
                        {Math.abs(tx.amount)} 볼
                      </p>
                      {tx.balanceAfter !== undefined && (
                        <p className="text-muted-foreground text-xs">잔액: {tx.balanceAfter}</p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <Circle className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">
                {activeTab === "all"
                  ? "거래 내역이 없습니다"
                  : activeTab === "earn"
                    ? "획득 내역이 없습니다"
                    : "사용 내역이 없습니다"}
              </h3>
              <p className="text-muted-foreground text-sm">
                매일 자정에 10볼이 자동으로 충전됩니다.
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </main>
  )
}
