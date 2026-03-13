// Service Worker for 공놀이 PWA
const CACHE_NAME = "gongnori-v1"

// 오프라인 시 캐시할 핵심 리소스
const PRECACHE_URLS = [
  "/",
  "/icon.svg",
  "/icon-light-32x32.png",
  "/apple-icon.png",
]

// 설치: 핵심 리소스 프리캐시
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

// 활성화: 이전 캐시 정리
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

// Fetch: Network-first 전략 (API 제외)
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API 요청은 캐시하지 않음
  if (url.pathname.startsWith("/api/")) return

  // POST 등 비-GET 요청은 캐시하지 않음
  if (request.method !== "GET") return

  // 네비게이션 요청 (HTML 페이지)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/"))
    )
    return
  }

  // 정적 리소스: Cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|gif|ico|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // 기타: Network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
