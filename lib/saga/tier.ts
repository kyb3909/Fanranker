/**
 * 사가 티어/출처 판정 — /transfer 상황판의 검증된 룰(lib/transfer/feed.ts)을
 * 그대로 소비한다 (P0 오딧: /transfer 는 사가로 흡수·대체 예정이라 룰의 소유권이
 * 이쪽으로 넘어온다. 지금은 재수출 — 복제하면 두 벌이 갈라진다).
 *
 * origin 해석 체인(기자 브래킷 → naver author → 링크 도메인)은 운영자 방침
 * 2026-07-26 "야후·레딧 등 유통 채널 출처 표시 금지"를 그대로 계승.
 */

import {
  classifyTier,
  bracketSource,
  outletFromAuthor,
  outletFromUrl,
  type TransferTier,
} from "@/lib/transfer/feed"

export { classifyTier }
export type { TransferTier }

export interface SagaOrigin {
  reporter: string | null
  outlet: string
  url: string | null
}

/** 티커 행 → saga_entries.origin jsonb. 출처를 못 찾으면 outlet '출처 미상' */
export function resolveOrigin(row: {
  original_title: string | null
  author: string | null
  link_url: string | null
  external_url: string | null
}): SagaOrigin {
  const reporter = bracketSource(row.original_title)
  const outlet = outletFromAuthor(row.author) ?? outletFromUrl(row.link_url) ?? "출처 미상"
  return {
    reporter,
    outlet: reporter && outlet === "출처 미상" ? reporter : outlet,
    url: row.link_url || row.external_url,
  }
}
