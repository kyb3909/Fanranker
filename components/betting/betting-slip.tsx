"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDown, ChevronUp, Circle, Loader2, X, Newspaper } from "lucide-react"
import type { SelectedBet, GroupedMatch } from "@/types/betting"
import { getGameTypeLabel, formatMatchTime } from "@/types/betting"
import { BoardIcon } from "@/components/sidebar/board-icon"

interface BettingSlipProps {
  selectedBets: SelectedBet[]
  groupedMatches: GroupedMatch[]
  isSlipExpanded: boolean
  setIsSlipExpanded: (expanded: boolean) => void
  betAmount: number
  setBetAmount: (amount: number) => void
  userBalls: number
  totalOdds: number
  expectedReturn: number
  isSubmitting: boolean
  onRemoveBet: (gameId: string) => void
  onClearAllBets: () => void
  onSubmit: () => void
  isJournalist?: boolean
  analysisTitle?: string
  setAnalysisTitle?: (text: string) => void
  analysisText?: string
  setAnalysisText?: (text: string) => void
  /** rail: 좌측 sticky 레일 (항상 펼침, 접기 헤더 없음) */
  variant?: "rail"
  /**
   * 비로그인이면 가짜 잔고 대신 "로그인하면 매일 10볼" 안내 + CTA 를 로그인 유도로.
   * (2026-07-30 워룸 — 이전엔 잔고 10을 보여주고 제출은 에러로 끝났다)
   */
  isSignedIn?: boolean
}

export function BettingSlip({
  selectedBets,
  groupedMatches,
  isSlipExpanded,
  setIsSlipExpanded,
  betAmount,
  setBetAmount,
  userBalls,
  totalOdds,
  expectedReturn,
  isSubmitting,
  onRemoveBet,
  onClearAllBets,
  onSubmit,
  isJournalist,
  analysisTitle = "",
  setAnalysisTitle,
  analysisText = "",
  setAnalysisText,
  variant,
  isSignedIn = true,
}: BettingSlipProps) {
  const isRail = variant === "rail"
  const [mascotError, setMascotError] = useState(false)

  // CC6 — Rail 빈 상태 with mascot
  if (selectedBets.length === 0 && isRail) {
    return (
      <div
        style={{
          background: "var(--wc-card)",
          border: "1px solid var(--wc-line)",
          borderRadius: 12,
          boxShadow: "var(--wc-shadow-1)",
          padding: "0 20px 24px",
          textAlign: "center",
          minHeight: 240,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {mascotError ? (
          <div style={{ fontSize: 36, marginTop: 20, marginBottom: 4 }} aria-hidden>
            🎯
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/mascot/bet-slip.png"
            alt=""
            width={256}
            height={256}
            style={{ marginTop: 20, marginBottom: 4, objectFit: "contain" }}
            onError={() => setMascotError(true)}
          />
        )}
        <p style={{ fontSize: 13, color: "var(--wc-mute)", marginTop: mascotError ? 8 : 0 }}>
          전술 분석 중… 마음 가는 경기를 슬립에 담아보세요
        </p>

        {/* 선택 전에도 오늘 남은 볼을 안내 (베팅 후 잔액 그대로 반영) */}
        <div
          style={{
            marginTop: 16,
            padding: "10px 16px",
            background: "var(--wc-soft)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--wc-mute)" }}>
            {isSignedIn ? "오늘 사용 가능한 볼" : "가입하면 매일"}
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontWeight: 800,
              color: "var(--wc-burgundy)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Circle
              style={{
                width: 12,
                height: 12,
                fill: "var(--wc-burgundy)",
                color: "var(--wc-burgundy)",
              }}
            />
            {isSignedIn ? `${userBalls.toLocaleString()}개` : "무료 10개"}
          </span>
        </div>
      </div>
    )
  }

  if (selectedBets.length === 0) return null

  // 선택 항목 라벨 헬퍼
  const selectionLabel = (bet: SelectedBet, groupedMatch: GroupedMatch) => {
    const s = bet.selection
    const label =
      s === "home" || s === "1"
        ? groupedMatch.homeTeam
        : s === "away" || s === "2"
          ? groupedMatch.awayTeam
          : s === "draw" || s === "X"
            ? "무승부"
            : s === "over"
              ? "오버"
              : s === "under"
                ? "언더"
                : s === "odd"
                  ? "홀"
                  : s === "even"
                    ? "짝"
                    : s
    return bet.handicap !== null
      ? `${label} (${bet.handicap > 0 ? "+" : ""}${bet.handicap})`
      : label
  }

  // 비로그인은 잔고 조건 없이 클릭 가능해야 한다 — 클릭이 로그인 모달로 이어지는 게 퍼널
  const canSubmit =
    !isSubmitting &&
    selectedBets.length > 0 &&
    (!isSignedIn || (betAmount > 0 && !selectedBets.some((b) => !b.odds || b.odds <= 0)))

  // CC1–CC5 내부 컨텐츠
  const innerContent = (
    <>
      {/* 전체 삭제 헤더 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 10,
          borderBottom: "1px solid var(--wc-line)",
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--wc-mute)" }}>
          선택한 경기 {selectedBets.length}개
        </span>
        <button
          onClick={onClearAllBets}
          style={{ fontSize: 12, fontWeight: 600, color: "var(--wc-mute)" }}
          aria-label="선택한 경기 전체 삭제"
        >
          전체 삭제
        </button>
      </div>

      {/* CC2 — 선택 항목 미니 카드 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxHeight: isRail ? "50vh" : "40vh",
          overflowY: "auto",
          marginBottom: 12,
        }}
      >
        {selectedBets.map((bet) => {
          const groupedMatch = groupedMatches.find((m) => m.matchKey === bet.matchKey)
          const game = groupedMatch?.games.find((g) => g.id === bet.gameId)
          if (!groupedMatch || !game) return null

          const marketLabel = getGameTypeLabel(bet.gameType, bet.sport)
          const handicapSuffix =
            bet.gameType.includes("핸디캡") && bet.handicap !== null
              ? ` (${groupedMatch.homeTeam.slice(0, 4)} ${bet.handicap > 0 ? "+" : ""}${bet.handicap})`
              : ""
          const lineSuffix =
            bet.gameType.includes("언더오버") && bet.overUnderLine != null
              ? ` · 기준 ${bet.overUnderLine}`
              : ""

          return (
            <div
              key={bet.gameId}
              style={{
                background: "#fff",
                border: "1px solid var(--wc-line)",
                borderRadius: 12,
                padding: "10px 12px",
              }}
            >
              {/* 행 1: 리그 · 시간 · 마켓 + X */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 4,
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 11, color: "var(--wc-mute-2)", lineHeight: 1.4 }}>
                  {groupedMatch.leagueCode} · {formatMatchTime(groupedMatch.matchTime)} ·{" "}
                  {marketLabel}
                  {handicapSuffix}
                  {lineSuffix}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveBet(bet.gameId)
                  }}
                  style={{ color: "var(--wc-mute)", flexShrink: 0 }}
                  aria-label={`${groupedMatch.homeTeam} vs ${groupedMatch.awayTeam} 선택 삭제`}
                >
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              {/* 행 2: 매치명 */}
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "var(--wc-ink)",
                  wordBreak: "keep-all",
                  marginBottom: 5,
                }}
              >
                {groupedMatch.homeTeam} vs {groupedMatch.awayTeam}
              </div>

              {/* 행 3: 선택 팀 + 배점 */}
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--wc-burgundy)" }}>
                  선택 {selectionLabel(bet, groupedMatch)}
                </span>
                {bet.odds && (
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--wc-ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {bet.odds.toFixed(2)}배
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 베팅 금액 + 제출 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* CC1 — 보유 볼 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--wc-mute)" }}>
            {isSignedIn ? "보유 볼" : "가입하면 매일"}
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontWeight: 700,
              color: "var(--wc-ink)",
            }}
          >
            <Circle
              style={{ width: 12, height: 12, fill: "var(--wc-ink)", color: "var(--wc-ink)" }}
            />
            {isSignedIn ? userBalls.toLocaleString() : "무료 10볼"}
          </span>
        </div>

        {/* CC3 — 베팅 금액 인풋 (suffix inside) */}
        <div style={{ position: "relative" }}>
          <input
            type="number"
            inputMode="numeric"
            enterKeyHint="done"
            pattern="[0-9]*"
            value={betAmount}
            onChange={(e) =>
              setBetAmount(Math.max(0, Math.min(userBalls, parseInt(e.target.value) || 0)))
            }
            style={{
              height: 38,
              width: "100%",
              borderRadius: 12,
              border: "1px solid var(--wc-line-2)",
              paddingRight: 40,
              paddingLeft: 12,
              fontSize: 14,
              color: "var(--wc-ink)",
              background: "var(--wc-paper)",
              fontVariantNumeric: "tabular-nums",
              outline: "none",
              textAlign: "right",
              boxSizing: "border-box",
            }}
            min={0}
            max={userBalls}
          />
          <span
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 13,
              color: "var(--wc-mute)",
              pointerEvents: "none",
            }}
          >
            볼
          </span>
        </div>

        {/* CC3 — 퀵 버튼 세그먼트 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid var(--wc-line-2)",
          }}
        >
          {[1, 3, 5, 10].map((amount, i) => (
            <button
              key={amount}
              onClick={() => setBetAmount(Math.min(amount, userBalls))}
              disabled={amount > userBalls}
              style={{
                height: 32,
                fontSize: 12,
                fontWeight: 600,
                borderLeft: i > 0 ? "1px solid var(--wc-line-2)" : "none",
                background: betAmount === amount ? "var(--wc-burgundy)" : "#fff",
                color: betAmount === amount ? "#fff" : "var(--wc-ink)",
                opacity: amount > userBalls ? 0.4 : 1,
                cursor: amount > userBalls ? "not-allowed" : "pointer",
                transition: "background .15s",
              }}
            >
              {amount}
            </button>
          ))}
        </div>

        {/* 기자 분석글 */}
        {isJournalist && setAnalysisText && setAnalysisTitle && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Newspaper style={{ width: 14, height: 14, color: "var(--wc-blue)" }} />
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--wc-blue)" }}>분析글</span>
            </div>
            <Input
              value={analysisTitle}
              onChange={(e) => setAnalysisTitle(e.target.value)}
              placeholder="분析글 제목 (선택)"
              maxLength={100}
              className="text-sm"
            />
            <Textarea
              value={analysisText}
              onChange={(e) => setAnalysisText(e.target.value)}
              placeholder="이 조합에 대한 분析글을 작성하세요..."
              maxLength={5000}
              rows={3}
              className="resize-none text-sm"
            />
            <span style={{ fontSize: 12, color: "var(--wc-mute)" }}>
              {analysisText.length}/5000
            </span>
          </div>
        )}

        {/* CC4 — 배점 요약 박스 */}
        <div
          style={{
            background: "var(--wc-soft)",
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12.5, color: "var(--wc-mute)" }}>총 배점</span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--wc-ink)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {totalOdds.toFixed(2)}배
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12.5, color: "var(--wc-mute)" }}>예상 획득 점수</span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "var(--wc-burgundy)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {(betAmount * totalOdds).toFixed(2)}점
            </span>
          </div>
        </div>

        {/* CC5 — CTA: 아이콘 제거, 48px, radius 10 */}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            height: 48,
            width: "100%",
            borderRadius: 12,
            background: "var(--wc-burgundy)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? "pointer" : "not-allowed",
            border: "none",
            transition: "opacity .15s",
          }}
        >
          {isSubmitting ? (
            <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
          ) : !isSignedIn ? (
            "로그인하고 오늘 경기 예측하기"
          ) : (
            `${selectedBets.length}경기 ${betAmount.toLocaleString()}볼 예측하기`
          )}
        </button>
      </div>
    </>
  )

  // Rail 모드 — 항상 펼침, 접기 헤더 없음
  if (isRail) {
    return (
      <div
        style={{
          background: "var(--wc-card)",
          border: "1px solid var(--wc-line)",
          borderRadius: 12,
          boxShadow: "var(--wc-shadow-1)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 16px 20px" }}>{innerContent}</div>
      </div>
    )
  }

  // 기본 — 하단 sticky
  return (
    <>
      {isSlipExpanded && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setIsSlipExpanded(false)}
          aria-hidden="true"
        />
      )}
      <div className="sticky bottom-0 z-40 pt-2 pb-2 sm:pt-4 sm:pb-3">
        <Card
          className="rounded-lg border-2"
          style={{
            background: "var(--wc-card)",
            borderColor: "var(--wc-burgundy)",
            boxShadow: "var(--wc-shadow-3)",
          }}
        >
          <div
            className="flex cursor-pointer items-center justify-between p-3 sm:p-4"
            onClick={() => setIsSlipExpanded(!isSlipExpanded)}
            role="button"
            aria-expanded={isSlipExpanded}
            aria-label={`예측 슬립 ${isSlipExpanded ? "접기" : "펼치기"}, ${selectedBets.length}경기 선택됨`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setIsSlipExpanded(!isSlipExpanded)
              }
            }}
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-medium sm:text-sm">{selectedBets.length}경기 선택</span>
              {selectedBets.length > 0 && selectedBets[0].sport && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] sm:text-xs"
                  style={{
                    background: "var(--wc-soft)",
                    color: "var(--wc-burgundy)",
                    fontWeight: 600,
                  }}
                >
                  <BoardIcon
                    slug={selectedBets[0].sport}
                    className="mr-1 inline-block h-3 w-3 align-[-2px]"
                  />
                  {selectedBets[0].sport}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {isSlipExpanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </div>
          </div>

          {isSlipExpanded && (
            <div style={{ borderTop: "1px solid var(--wc-line)", padding: "12px 16px 20px" }}>
              {innerContent}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
