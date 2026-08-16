import { lookup } from "node:dns/promises"

/**
 * SSRF 방지 가드 — 외부 URL을 서버에서 fetch 하기 전에 호스트를 실제 IP로
 * resolve 해 사설/예약/링크로컬 대역이면 차단한다 (DNS 리바인딩·리다이렉트 우회 방지).
 *
 * `/api/og` (HTML 메타 추출) 와 `/api/upload/image` (외부 이미지 재호스팅) 가 공유.
 */
export class SsrfBlockedError extends Error {}

/** 호스트를 실제 IP로 resolve 해 사설/예약/링크로컬 대역이면 차단 (DNS 리바인딩 방지). */
export async function assertPublicUrl(u: URL): Promise<void> {
  const hostname = u.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new SsrfBlockedError()
  }
  let addrs: { address: string }[]
  try {
    addrs = await lookup(hostname, { all: true })
  } catch {
    throw new SsrfBlockedError() // resolve 실패 → 차단
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new SsrfBlockedError()
  }
}

function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const a = Number(v4[1])
    const b = Number(v4[2])
    if (a === 0 || a === 10 || a === 127) return true // 현재망 / 사설 / 루프백
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 169 && b === 254) return true // 링크로컬 + 클라우드 메타데이터
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64.0.0/10
    return false
  }
  const v6 = ip.toLowerCase()
  if (v6 === "::1" || v6 === "::") return true // 루프백 / 미지정
  if (/^fe[89ab]/.test(v6)) return true // fe80::/10 링크로컬
  if (/^f[cd]/.test(v6)) return true // fc00::/7 ULA
  const mapped = v6.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateIp(mapped[1]) // IPv4-mapped
  return false
}

/**
 * 리다이렉트를 직접(redirect:"manual") 따라가며 매 홉마다 호스트를 IP로 resolve 해
 * 사설 대역이면 차단하는 fetch. 최종 (비-리다이렉트) 응답을 반환한다.
 * 호스트가 차단 대상이면 SsrfBlockedError, 리다이렉트가 너무 많으면 RangeError 를 throw.
 */
export async function ssrfSafeFetch(
  url: URL,
  init: RequestInit = {},
  opts: { maxHops?: number } = {}
): Promise<Response> {
  const maxHops = opts.maxHops ?? 4
  let target = url
  for (let hops = 0; ; hops++) {
    if (hops > maxHops) {
      throw new RangeError("too many redirects")
    }
    await assertPublicUrl(target)
    const res = await fetch(target.toString(), { ...init, redirect: "manual" })
    const loc = res.headers.get("location")
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, target)
      if (!["http:", "https:"].includes(next.protocol)) {
        throw new SsrfBlockedError()
      }
      target = next
      continue
    }
    return res
  }
}
