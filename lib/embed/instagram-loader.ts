/**
 * Instagram embed.js 공용 로더
 *
 * embed-card / embed-preview-card / post-card-content 3곳에서 중복되던
 * Instagram embed.js 로드 로직을 단일 모듈로 통합.
 *
 * SRI(Subresource Integrity) 미적용 사유:
 * Instagram이 embed.js를 비정기적으로 갱신하여 해시 고정 시 임베드가 전부 깨짐.
 * 대신 CORS(crossorigin=anonymous) + Referrer-Policy(no-referrer)로 요청 경계를 보강하고,
 * next.config.mjs의 CSP script-src로 허용 도메인을 제한 (현재: https://www.instagram.com만 허용).
 */

type InstgrmWindow = Window &
  typeof globalThis & {
    instgrm?: { Embeds: { process: () => void } }
    __igEmbedLoading?: boolean
  }

const SCRIPT_SRC = "https://www.instagram.com/embed.js"
const POLL_INTERVAL_MS = 100
const POLL_MAX_ATTEMPTS = 100 // 10초 후 포기

export function loadInstagramEmbedJs(callback: () => void): void {
  if (typeof window === "undefined") return
  const win = window as InstgrmWindow

  if (win.instgrm) {
    callback()
    return
  }

  if (win.__igEmbedLoading) {
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (win.instgrm) {
        clearInterval(interval)
        callback()
      } else if (attempts > POLL_MAX_ATTEMPTS) {
        clearInterval(interval)
        win.__igEmbedLoading = false
      }
    }, POLL_INTERVAL_MS)
    return
  }

  win.__igEmbedLoading = true
  const script = document.createElement("script")
  script.src = SCRIPT_SRC
  script.async = true
  script.crossOrigin = "anonymous"
  script.referrerPolicy = "no-referrer"
  script.onload = () => {
    win.__igEmbedLoading = false
    callback()
  }
  script.onerror = () => {
    win.__igEmbedLoading = false
  }
  document.body.appendChild(script)
}

export function processInstagramEmbeds(): void {
  if (typeof window === "undefined") return
  const win = window as InstgrmWindow
  win.instgrm?.Embeds.process()
}
