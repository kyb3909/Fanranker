/**
 * 사가 클러스터링 — "클러스터 1개 = 이벤트 1개 = 엔트리 1개" (PRD D9).
 *
 * 로마노가 쏘고 20개 매체가 받아쓰는 이적 뉴스의 구조를 접는다:
 * 1) 사가 배정: extracted.player + direction + window → identity_key (identity.ts)
 * 2) 사가 안에서 이벤트 묶기: 같은 단계 신호 + 같은 날(KST) + 제목 유사도
 * 3) 클러스터 안에서 origin 선출: official > tier1 > rumor, 동률이면 먼저 보도한 것.
 *    나머지는 echoes (접힘 표시용).
 *
 * 순수 함수 — DB 접근 없음. 드라이런과 실파이프라인이 같은 코드를 쓴다.
 */

import { identityKey, kstDay, normalizePlayerKey, transferClusterKey } from "./identity"
import type { ExtractedTransfer } from "./extract"
import type { TransferTier } from "./tier"

export interface ClusterInput {
  /** saga_reservoir.id 또는 티커 id — 결과 추적용 불투명 키 */
  ref: string
  title: string
  extracted: ExtractedTransfer
  tier: TransferTier
  occurredAt: string // ISO
}

interface SagaCluster {
  clusterKey: string
  stageSignal: ExtractedTransfer["stage_signal"]
  origin: ClusterInput
  echoes: ClusterInput[]
}

interface SagaGroup {
  identityKey: string
  playerKey: string
  direction: "in" | "out"
  clusters: SagaCluster[]
}

const TIER_RANK: Record<TransferTier, number> = { official: 0, tier1: 1, rumor: 2 }

/**
 * 같은 사가 안에서 **같은 원문 URL 을 이미 담은 엔트리**를 찾는다 (2026-08-06, 점검 F7).
 *
 * 실사고: 같은 ajansspor 기사가 발행 경로 2곳(기사 훅·저수지)에서 서로 다른 stage
 * 신호로 추출돼 엔트리 2개가 됐다 — cluster_key 에 신호가 박혀 있어 같은 URL 이라도
 * 신호가 갈리면 dedupe 지점이 없었다. 같은 기사 1건은 사건 1개다: origin 이든 echo 든
 * 이 URL 을 이미 담은 엔트리가 있으면 새 엔트리 대신 그 엔트리에 접는다.
 * 비교는 canonical(호스트+경로) 기준 — 호출부가 정규화 함수를 주입한다(뉴스 쪽과 공유).
 */
export function findEntryWithUrl<
  T extends { origin: { url?: string | null } | null; echoes: { url?: string | null }[] | null },
>(entries: T[], url: string, canonical: (u: string) => string): T | null {
  const target = canonical(url)
  for (const entry of entries) {
    const originUrl = entry.origin?.url
    if (originUrl && canonical(originUrl) === target) return entry
    for (const echo of entry.echoes ?? []) {
      if (echo.url && canonical(echo.url) === target) return entry
    }
  }
  return null
}

/** 제목 토큰 Jaccard — 브래킷·구두점 제거 후 3글자 이상 토큰만 */
export function titleSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/^\[[^\]]*\]\s*/, "")
        .split(/[^a-z0-9가-힣]+/)
        .filter((t) => t.length >= 3)
    )
  const ta = tok(a)
  const tb = tok(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

// KST 날짜 버킷("같은 날의 같은 신호"가 에코 판정의 1차 울타리)은 identity.kstDay 단일 소스

/**
 * 사가 → 클러스터 2단 그루핑.
 * 에코 판정: 같은 stage_signal + 같은 KST 날 + (유사도 ≥ threshold 또는 신호가 bid
 * 이상의 구체 이벤트). "관심" 단계는 서로 다른 구혼자 기사가 흔해 유사도를 요구한다.
 */
export function clusterBatch(
  rows: ClusterInput[],
  windowKey: string,
  { similarityThreshold = 0.35 }: { similarityThreshold?: number } = {}
): SagaGroup[] {
  // 1) 사가 배정
  const bySaga = new Map<string, ClusterInput[]>()
  for (const row of rows) {
    if (!row.extracted.is_transfer || !row.extracted.player) continue
    const key = identityKey("transfer", {
      player_key: row.extracted.player,
      direction: row.extracted.direction,
      window_key: windowKey,
    })
    const list = bySaga.get(key)
    if (list) list.push(row)
    else bySaga.set(key, [row])
  }

  // 2) 사가 안에서 이벤트 클러스터
  const groups: SagaGroup[] = []
  for (const [key, list] of bySaga) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    const clusters: {
      rows: ClusterInput[]
      signal: ExtractedTransfer["stage_signal"]
      day: string
    }[] = []

    for (const row of list) {
      const day = kstDay(row.occurredAt)
      const signal = row.extracted.stage_signal
      const home = clusters.find(
        (c) =>
          c.day === day &&
          c.signal === signal &&
          // 구체 이벤트(bid~done)는 하루 한 건으로 접고, 저신호(interest/contact/null)는
          // 제목이 실제로 닮았을 때만 접는다 — 서로 다른 구혼자 기사 오병합 방지
          (isConcrete(signal) ||
            c.rows.some((r) => titleSimilarity(r.title, row.title) >= similarityThreshold))
      )
      if (home) home.rows.push(row)
      else clusters.push({ rows: [row], signal, day })
    }

    const first = list[0]
    groups.push({
      identityKey: key,
      playerKey: normalizePlayerKey(first.extracted.player as string),
      direction: first.extracted.direction,
      clusters: clusters.map((c) => {
        const sorted = [...c.rows].sort(
          (a, b) =>
            TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.occurredAt.localeCompare(b.occurredAt)
        )
        const origin = sorted[0]
        return {
          // c.rows 는 전부 같은 KST 날(c.day 그루핑)이라 첫 행 기준으로 충분
          clusterKey: transferClusterKey(
            first.extracted.player as string,
            c.signal,
            c.rows[0].occurredAt
          ),
          stageSignal: c.signal,
          origin,
          echoes: sorted.slice(1),
        }
      }),
    })
  }

  return groups
}

function isConcrete(signal: ExtractedTransfer["stage_signal"]): boolean {
  return signal === "bid" || signal === "negotiation" || signal === "medical" || signal === "done"
}
