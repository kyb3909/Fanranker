/**
 * 사가 신원 감사 — **한글 표기와 로마자 키가 같은 사람을 가리키는가** (2026-08-25).
 *
 * ## 왜 필요한가
 * 사가의 기본키는 추출기(LLM)가 낸 로마자 문자열이다. 그런데 2026-08-25 에
 * "Tottenham sign **Savinho** from Man City" 기사에서 추출기가 `fabinho`(파비뉴 —
 * 다른 선수)를 냈고, 그 문자열이 그대로 키가 돼 **같은 이적이 두 사가로 갈렸다.**
 * 화면에는 "사비뉴 이적 사가"가 둘 떠 있었다.
 *
 * `canonical.ts` 의 근거 검증이 **앞으로 들어올 것**을 막는다면, 이 감사는
 * **이미 들어와 있는 것**을 찾는다. 둘 다 있어야 한다 — 검증을 붙이기 전에 생긴
 * 데이터는 검증이 안 잡고, 검증에도 구멍은 생기기 때문이다.
 *
 * ## 판정 방법
 * 사가의 한글 표기가 사전에 있으면, 그 한글이 가진 로마자 키들과 사가의 키를 견준다.
 * 하나라도 **호환**되면 정상이다. 호환은 두 가지만 인정한다:
 *   · 악센트·대소문자만 다름   — `alvarez` ≡ `Álvarez`
 *   · 토큰 순서·부분집합       — `rafael-leao` ≡ `leao-rafael`, `henderson` ⊂ `jordan-henderson`
 *
 * ⚠️ **오탈자 허용(편집거리)은 넣지 않는다.** 실측에서 `luis-hall` vs `lewis-hall`,
 *    `savinho` vs `fabinho` 가 잡혔는데, 편집거리를 허용했다면 앞의 것을 놓쳤을 것이다.
 *    한 글자 차이가 곧 다른 사람인 경우가 이 도메인에는 흔하다.
 */

import { normalizePlayerKey } from "./identity"

export interface AuditSaga {
  slug: string
  playerKey: string
  playerNameKr: string | null
  entryCount: number
}

export interface AuditAlias {
  romanized: string | null
  preferredKo: string
}

export interface IdentityMismatch {
  slug: string
  /** 사가가 신원으로 쓰는 로마자 키 */
  sagaKey: string
  /** 사가가 화면에 쓰는 한글 표기 */
  koName: string
  /** 사전이 그 한글에 물려 둔 로마자 키들 */
  dictKeys: string[]
  entryCount: number
}

/** 한글 대조 키 — 공백·가운뎃점만 접는다 (표기 자체는 건드리지 않는다) */
function koKey(s: string): string {
  return s.replace(/[\s·]+/g, "").trim()
}

function tokens(key: string): string[] {
  return key.split("-").filter(Boolean)
}

/** 토큰 순서가 달라도, 한쪽이 다른 쪽의 부분집합이어도 같은 사람으로 본다 */
function compatible(a: string, b: string): boolean {
  if (a === b) return true
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (ta.size === 0 || tb.size === 0) return false
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  for (const t of small) if (!big.has(t)) return false
  return true
}

/**
 * 한글 ↔ 로마자가 어긋난 사가를 찾는다.
 * 한글이 사전에 없으면 판정하지 않는다 — 근거가 없으면 침묵이 옳다.
 */
export function findIdentityMismatches(
  sagas: AuditSaga[],
  aliases: AuditAlias[]
): IdentityMismatch[] {
  const byKo = new Map<string, Set<string>>()
  for (const a of aliases) {
    if (!a.romanized || !a.preferredKo) continue
    const key = normalizePlayerKey(a.romanized)
    if (!key) continue
    const k = koKey(a.preferredKo)
    const set = byKo.get(k) ?? new Set<string>()
    set.add(key)
    byKo.set(k, set)
  }

  const out: IdentityMismatch[] = []
  for (const s of sagas) {
    if (!s.playerNameKr) continue
    const dict = byKo.get(koKey(s.playerNameKr))
    if (!dict || dict.size === 0) continue

    const sagaKey = normalizePlayerKey(s.playerKey)
    if (!sagaKey) continue
    if ([...dict].some((d) => compatible(sagaKey, d))) continue

    out.push({
      slug: s.slug,
      sagaKey,
      koName: s.playerNameKr,
      dictKeys: [...dict].sort(),
      entryCount: s.entryCount,
    })
  }
  // 엔트리가 많은 것부터 — 갈라진 사가는 독자 눈에 먼저 띈다
  return out.sort((a, b) => b.entryCount - a.entryCount)
}
