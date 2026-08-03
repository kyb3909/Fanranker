/**
 * 사가 identity — 멱등키와 slug 의 단일 소스 (PRD D2·D3·D4).
 *
 * transfer 의 identity 에 목적지 클럽이 **없는** 것이 설계의 핵심이다: 밀란 관심 기사와
 * 바이에른 관심 기사가 문서를 쪼개면 안 된다. 목적지들은 문서 안의 구혼자 스레드 몫.
 */

import type { SagaType } from "./stages"

/** 선수 키 정규화 — 소문자·공백/특수문자 접기. 사전(news_alias_dictionary) 매칭 후의 영문 키 기준 */
export function normalizePlayerKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // 분음부호 제거 (Sáenz → saenz)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export interface TransferIdentity {
  playerKey: string
  direction: "in" | "out"
  windowKey: string // '2026-summer'
}

export function transferIdentityKey(t: TransferIdentity): string {
  return `transfer:${normalizePlayerKey(t.playerKey)}:${t.direction}:${t.windowKey}`
}

export function identityKey(type: SagaType, subject: Record<string, unknown>): string {
  switch (type) {
    case "transfer":
      return transferIdentityKey({
        playerKey: String(subject.player_key ?? ""),
        direction: subject.direction === "out" ? "out" : "in",
        windowKey: String(subject.window_key ?? ""),
      })
    case "match":
      // D3: 외부 API fixture_id 가 곧 identity — 매칭 문제 원천 차단
      return `match:${String(subject.fixture_id ?? "")}`
    case "season":
      // D4: 팀 + 시즌
      return `season:${String(subject.team_id ?? "")}:${String(subject.season ?? "")}`
  }
}

/** slug — URL 용. 멱등키와 달리 사람이 읽는 값이라 충돌 시 suffix 를 붙인다(create 쪽 몫) */
export function baseSlug(type: SagaType, subject: Record<string, unknown>): string {
  if (type === "transfer") {
    const key = normalizePlayerKey(String(subject.player_key ?? "player"))
    const dir = subject.direction === "out" ? "out" : "in"
    const win = String(subject.window_key ?? "").replace("2026-summer", "2026s")
    return `${key}-${dir}-${win}`
  }
  if (type === "match") return `m-${String(subject.fixture_id ?? "")}`
  return `${normalizePlayerKey(String(subject.team_id ?? "team"))}-${String(subject.season ?? "")}`
}
