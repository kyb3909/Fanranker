// Self-destructing Service Worker
// Dev 환경에서 /_next/static/* Cache-first 전략이 Turbopack HMR과 충돌해
// "module factory not available" 에러를 유발. 기존 SW를 안전하게 제거하기 위해
// install → activate 시 모든 캐시 삭제 + 자기 자신 unregister + 열린 탭 리로드.
//
// 이 파일이 한 번 브라우저에 전파되면 SW는 영구 제거됨.
// 추후 PWA를 다시 도입할 경우 다른 이름(예: sw-v2.js)으로 새로 등록하는 걸 권장.

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 1) 이 origin의 모든 캐시 삭제
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))

      // 2) 자기 자신 unregister
      await self.registration.unregister()

      // 3) 열린 모든 탭을 강제 새로고침하여 깨끗한 상태로 진입
      const clients = await self.clients.matchAll({ type: "window" })
      for (const client of clients) {
        client.navigate(client.url)
      }
    })()
  )
})

// Fetch 핸들러 없음 → 이 SW는 어떤 요청도 가로채지 않음.
// 만약 기존 SW가 이미 활성 상태라면 24시간 내 브라우저가 이 파일을 재검증하면서
// 업데이트 감지 → activate 단계에서 자기 제거 실행.
