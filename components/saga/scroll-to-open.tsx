"use client"

import { useEffect } from "react"

/**
 * 떡밥에서 ?from= 으로 진입하면 펼쳐진 기사 위치로 스크롤.
 * 연표가 시간순(오래된 것 위)이라 방금 클릭한 최신 기사는 아래쪽에 있기 때문.
 */
export function ScrollToOpenArticle() {
  useEffect(() => {
    const el = document.querySelector("details[open][data-article]")
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])
  return null
}
