"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Coins, ArrowLeft, ArrowUpRight, ArrowDownLeft } from "lucide-react"
import { useRouter } from "next/navigation"

interface Transaction {
  id: string
  type: "earn" | "spend"
  transactionType: string
  amount: number
  description: string
  createdAt: string
  balanceAfter: number
}

interface GoldInfo {
  balance: number
}

export default function PaymentsPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [goldInfo, setGoldInfo] = useState<GoldInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "earn" | "spend">("all")

  useEffect(() => {
    if (isLoaded && !isSignedIn) return

    async function fetchData() {
      if (!isSignedIn) return

      setIsLoading(true)
      try {
        const [balanceRes, historyRes] = await Promise.all([
          fetch("/api/gold/balance"),
          fetch("/api/gold/history"),
        ])

        if (balanceRes.ok) {
          const balanceData = await balanceRes.json()
          setGoldInfo({ balance: balanceData.balance })
        }

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
      fetchData()
    }
  }, [isSignedIn, isLoaded, router])

  const filteredTransactions = transactions.filter((tx) => {
    if (activeTab === "all") return true
    if (activeTab === "earn") return tx.type === "earn"
    if (activeTab === "spend") return tx.type === "spend"
    return true
  })

  const totalEarned = transactions
    .filter((tx) => tx.type === "earn")
    .reduce((sum, tx) => sum + tx.amount, 0)
  const totalSpent = transactions
    .filter((tx) => tx.type === "spend")
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center px-4 py-20">
        <div className="bg-card border-border max-w-sm rounded-xl border p-8 text-center">
          <Coins className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h2 className="mb-2 text-lg font-bold">로그인이 필요합니다</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            골드 내역을 보려면 먼저 로그인해주세요.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              홈으로
            </Button>
            <Button onClick={() => router.push("/sign-up")}>로그인 / 가입</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <main id="main-content" className="mx-auto max-w-[800px] px-4 py-6" tabIndex={-1}>
        {/* 헤더 */}
        <div className="mb-6 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            style={{ color: "var(--wc-mute, #7a6b65)" }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="wc-sec-eb">GOLD HISTORY</div>
            <h1
              className="font-black tracking-tight"
              style={{
                fontSize: "clamp(20px, 3vw, 26px)",
                color: "var(--wc-ink, #1a1416)",
                letterSpacing: "-0.02em",
              }}
            >
              <Coins
                className="mr-2 inline-block h-5 w-5 align-text-bottom"
                style={{ color: "var(--wc-gold-deep, #b8941a)" }}
              />
              골드 내역
            </h1>
          </div>
        </div>

        {/* 에러 상태 */}
        {errorMessage && (
          <Card className="mb-6 p-8 text-center">
            <p className="text-primary mb-3 text-sm">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              다시 시도
            </Button>
          </Card>
        )}

        {/* 현재 잔액 카드 */}
        {goldInfo && (
          <Card className="mb-6 border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground mb-1 text-sm">보유 골드</p>
                <div className="flex items-center gap-2">
                  <Coins className="h-6 w-6 text-amber-500" />
                  <span className="text-3xl font-bold text-amber-600">{goldInfo.balance}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs">다른 유저의 승부예측을</p>
                <p className="text-muted-foreground text-xs">구매할 때 사용됩니다</p>
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
            <p className="text-xl font-bold text-emerald-600">+{totalEarned} 골드</p>
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <ArrowUpRight className="text-primary h-4 w-4" />
              <span className="text-muted-foreground text-sm">총 사용</span>
            </div>
            <p className="text-primary text-xl font-bold">-{totalSpent} 골드</p>
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
                            tx.type === "earn"
                              ? "bg-emerald-100 text-emerald-600"
                              : "bg-primary/15 text-primary"
                          }`}
                        >
                          {tx.type === "earn" ? (
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
                            tx.type === "earn" ? "text-emerald-600" : "text-primary"
                          }`}
                        >
                          {tx.type === "earn" ? "+" : ""}
                          {tx.amount} 골드
                        </p>
                        <p className="text-muted-foreground text-xs">잔액: {tx.balanceAfter}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Coins className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                <h3 className="mb-2 text-lg font-semibold">
                  {activeTab === "all"
                    ? "거래 내역이 없습니다"
                    : activeTab === "earn"
                      ? "획득 내역이 없습니다"
                      : "사용 내역이 없습니다"}
                </h3>
                <p className="text-muted-foreground text-sm">
                  골드는 컨텐츠를 구매할 때 사용됩니다.
                </p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
