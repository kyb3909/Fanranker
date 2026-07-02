"use client"

/**
 * 예측 완료 모달 레이아웃 검증 하니스 (dev 전용 — design-demo layout 이 prod 차단).
 * 실제 제출 없이 모달을 렌더해 오버플로/색상 문제를 재현·검증한다.
 */

import { useState } from "react"
import { PredictionSuccessDialog } from "@/components/betting/prediction-success-dialog"
import type { PredictionSuccessState } from "@/types/betting"

const MOCK: PredictionSuccessState = {
  isOpen: true,
  message: "1경기 조합 3볼 베팅 완료! (잔액: 1볼)",
  showCommunity: true,
  distribution: [
    {
      gameId: "g1",
      homeTeam: "스위스",
      awayTeam: "알제리",
      gameType: "일반",
      myPick: "home",
      counts: { home: 4, draw: 3, away: 2 },
      total: 9,
    },
  ],
}

export default function SuccessModalDemoPage() {
  const [state, setState] = useState(MOCK)
  return (
    <div className="min-h-screen bg-neutral-100 p-8">
      <button
        onClick={() => setState({ ...MOCK, isOpen: true })}
        className="rounded bg-neutral-800 px-4 py-2 text-sm text-white"
      >
        모달 열기
      </button>
      <PredictionSuccessDialog
        state={state}
        onClose={() => setState((s) => ({ ...s, isOpen: false }))}
      />
    </div>
  )
}
