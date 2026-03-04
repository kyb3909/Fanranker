'use client'

import { useState, useEffect } from 'react'

/**
 * 게스트 ID 관리 (localStorage 기반)
 * 로그인 안 한 유저의 식별자
 */
export function useGuestId(): string {
  const [guestId, setGuestId] = useState('')

  useEffect(() => {
    let id = localStorage.getItem('draft_guest_id')
    if (!id) {
      id = `guest_${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem('draft_guest_id', id)
    }
    setGuestId(id)
  }, [])

  return guestId
}
