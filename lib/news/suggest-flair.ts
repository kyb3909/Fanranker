/**
 * 봇 뉴스 자동 말머리 추천 — 규칙 기반(AI 없음).
 *
 * 제목 문자열에서 (1) 팀 말머리와 (2) 성격 말머리(이적/뉴스)를 추론한다.
 * 검수자가 말머리를 직접 고르지 않으면 이 추천값으로 발행된다.
 * 완벽할 필요 없음 — 검수 화면에서 언제든 수정 가능한 "추천"이다.
 */

export interface FlairOption {
  id: string
  name: string
  team_id: string | null
}

/** 팀 말머리(name) → 제목에 나타날 수 있는 표기 변형. name 자체는 항상 매칭 후보. */
const TEAM_ALIASES: Record<string, string[]> = {
  맨유: ["맨체스터 유나이티드", "맨체스터유나이티드", "맨 유나이티드"],
  맨시티: ["맨체스터 시티", "맨체스터시티"],
  뮌헨: ["바이에른", "바이언"],
  바르샤: ["바르셀로나", "바르사", "바르셀로나"],
  레알: ["레알 마드리드", "레알마드리드"],
  토트넘: ["토튼햄", "스퍼스"],
  유벤투스: ["유벤투스", "유베"],
  인테르: ["인터밀란", "인테르 밀란"],
}

/**
 * 이적/영입 성격을 가리키는 키워드.
 * ⚠️ `FA` 단독 매칭 금지 — "FIFA"의 부분 문자열에 걸려 인판티노 행정 기사가
 * 이적 태그를 달았다 (2026-08-04 실사고). 자유계약 키워드가 FA 를 커버한다.
 */
const TRANSFER_RE =
  /영입|이적|계약|임대|이적료|이적설|영입설|합류|사인|방출|콜업|떠나|잔류|바이아웃|바이백|메디컬|자유계약|영입\s*추진|영입\s*경쟁/

interface SuggestedFlairs {
  /** 매칭된 팀 말머리 id (없으면 null) */
  teamFlairId: string | null
  /** 성격 말머리 id — "이적" 또는 "뉴스" (목록에 있으면) */
  kindFlairId: string | null
  /** 단일 대표 말머리 — 팀이 있으면 팀, 없으면 성격. posts.flair_id 용 */
  primaryFlairId: string | null
  /** 추천 말머리 전체 (중복 없이, 팀 → 성격 순) — 다중 저장용 */
  flairIds: string[]
}

export function suggestFlairs(title: string, flairs: FlairOption[]): SuggestedFlairs {
  const t = title || ""

  // 1) 팀 말머리 매칭 (team_id 가 있는 것 우선, 그다음 리그/기타). name + 별칭.
  let teamFlairId: string | null = null
  const teamCandidates = [...flairs].sort((a, b) => {
    // team_id 있는 팀을 먼저 검사 (더 구체적)
    const at = a.team_id ? 0 : 1
    const bt = b.team_id ? 0 : 1
    return at - bt
  })
  for (const f of teamCandidates) {
    if (f.name === "이적" || f.name === "뉴스") continue // 성격 말머리는 팀 매칭에서 제외
    const aliases = [f.name, ...(TEAM_ALIASES[f.name] ?? [])]
    if (aliases.some((a) => a && t.includes(a))) {
      teamFlairId = f.id
      break
    }
  }

  // 2) 성격 말머리 — 이적 키워드 있으면 "이적", 없으면 "뉴스"
  const kindName = TRANSFER_RE.test(t) ? "이적" : "뉴스"
  const kindFlairId = flairs.find((f) => f.name === kindName)?.id ?? null

  const primaryFlairId = teamFlairId ?? kindFlairId

  const flairIds = [...new Set([teamFlairId, kindFlairId].filter((x): x is string => !!x))]

  return { teamFlairId, kindFlairId, primaryFlairId, flairIds }
}
