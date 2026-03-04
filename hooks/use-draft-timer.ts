'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface UseDraftTimerOptions {
  deadlineAt: string | null
  isMyTurn: boolean
  timerSeconds: number
  onTimeout: () => void
}

export function useDraftTimer({ deadlineAt, isMyTurn, timerSeconds, onTimeout }: UseDraftTimerOptions) {
  const [remaining, setRemaining] = useState(timerSeconds)
  const [isWarning, setIsWarning] = useState(false)
  const timeoutCalledRef = useRef(false)

  useEffect(() => {
    if (!deadlineAt) {
      setRemaining(timerSeconds)
      setIsWarning(false)
      return
    }

    timeoutCalledRef.current = false
    const deadline = new Date(deadlineAt).getTime()

    const tick = () => {
      const now = Date.now()
      const diff = Math.max(0, Math.ceil((deadline - now) / 1000))
      setRemaining(diff)
      setIsWarning(diff <= 10 && diff > 0)

      if (diff <= 0 && isMyTurn && !timeoutCalledRef.current) {
        timeoutCalledRef.current = true
        onTimeout()
      }
    }

    tick()
    const interval = setInterval(tick, 1000)

    return () => clearInterval(interval)
  }, [deadlineAt, isMyTurn, timerSeconds, onTimeout])

  const progress = deadlineAt ? (remaining / timerSeconds) * 100 : 100

  return { remaining, isWarning, progress }
}
