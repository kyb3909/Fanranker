/**
 * LFA 팀명·선수명 → 한글 대조 — **순수 모듈** (2026-08-25 분리).
 *
 * ⚠️ preview.ts 안에 있던 것을 옮겼다. 거기는 Supabase 를 import 하므로 테스트가 env 없이
 *    못 돈다 — 그래서 "Inter 가 사전에 있는데도 영문으로 나오는" 버그에 테스트를 붙일 수가
 *    없었다. injury-terms 와 같은 이유로 분리한다.
 *
 * ⚠️ 사전 조회(cachedTeamPairs·cachedSquad)는 preview.ts 에 남는다 — 그쪽이 Supabase 다.
 *    여기는 **받은 쌍 목록으로 고르기만** 한다.
 * ⚠️ 뉴스 표기 파이프라인의 findUniqueRomanizedMatch 와는 **다른 함수**다. 합치지 말 것 —
 *    거기서 느슨해지면 사전 오염으로 직결된다.
 */

/* ── 팀명·선수명 한글화 ──
 *
 * 정보 탭이 통째로 영문이었다 — 상대 전적 "R. Santander 2-1 Villarreal", 결장자
 * "G. Guliashvili" (2026-08-18 운영자: "선수단 이름도 전혀 반영이 안되어있어").
 * 콘텐츠 한글 원칙이 이 탭에만 적용되지 않고 있었다.
 *
 * 둘 다 **유일하게 결정될 때만** 바꾸고, 아니면 원문을 남긴다 — 틀린 한글보다 낫다. */

export function nameTokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !["the", "afc", "club"].includes(t))
}

/**
 * LFA 축약 팀명 → 한글. LFA 표기가 제각각이라("R. Santander"·"alaves"·"Ath.") 느슨하게
 * 보되, **정확일치를 접두일치보다 높게** 친다.
 *
 * ⚠️ 접두 겹침만으로 동급 판정하면 오답이 난다 (2026-08-18 실측):
 *    "Ath." 가 "AEK Athens" 의 "athens" 에 걸려 AEK아테네가 됐고,
 *    "Villarreal" 은 "Aston Villa" 의 "villa" 와 동점이 돼 둘 다 버려졌다.
 *    3글자 토큰은 정확일치만 인정하고, 정확일치가 있으면 그쪽이 이긴다.
 */
export function localizeTeam(lfaName: string, pairs: [string, string][]): string {
  const a = nameTokens(lfaName)
  if (a.length === 0) return lfaName

  /**
   * ⚠️ **이름 전체가 같은 후보가 있으면 그쪽이 이긴다** (2026-08-25).
   *
   * 실사고: "Inter" 가 매치센터에 영문 그대로 떴다. 사전에 **있는데도** 그랬다 —
   * "Inter"(인테르나치오날레 밀라노) · "Inter Miami" · "Inter Turku" 셋이 모두
   * `inter` 토큰을 정확일치로 갖고 있어 **3파전 동점**이 됐고, "애매하면 원문 유지"
   * 규칙에 걸려 버려졌다.
   *
   * 토큰 점수만으로는 "이름이 통째로 같은 것" 과 "긴 이름의 일부가 같은 것" 을 못 가른다.
   * 전자가 명백히 정답이므로 먼저 본다. 여기서도 여럿이면 그때는 진짜 애매한 것이니
   * 아래 점수 방식으로 넘긴다.
   */
  const exact = new Set(
    pairs
      .filter(([en]) => {
        const b = nameTokens(en)
        return b.length === a.length && b.every((t, i) => t === a[i])
      })
      .map(([, kr]) => kr)
  )
  if (exact.size === 1) return [...exact][0]

  const score = (t: string, b: string[]): number => {
    if (b.some((u) => u === t)) return 2
    if (t.length >= 4 && b.some((u) => u.startsWith(t) || t.startsWith(u))) return 1
    return 0
  }

  let best = 0
  const hits = new Set<string>()
  for (const [en, kr] of pairs) {
    const b = nameTokens(en)
    if (b.length === 0) continue
    const total = a.reduce((sum, t) => sum + score(t, b), 0)
    if (total === 0) continue
    if (total > best) {
      best = total
      hits.clear()
    }
    if (total === best) hits.add(kr)
  }
  return hits.size === 1 ? [...hits][0] : lfaName
}

/** "G. Guliashvili" → 한글. 이니셜은 앞뒤 어디든 올 수 있어 성 토큰으로만 본다 */
export function localizePlayer(lfaName: string, squad: [string, string][]): string {
  const surname = nameTokens(lfaName)
  if (surname.length === 0 || squad.length === 0) return lfaName
  const hits = new Set<string>()
  for (const [en, kr] of squad) {
    const rt = nameTokens(en)
    if (surname.every((t) => rt.some((u) => u === t || u.startsWith(t) || t.startsWith(u)))) {
      hits.add(kr)
    }
    if (hits.size > 1) return lfaName
  }
  return hits.size === 1 ? [...hits][0] : lfaName
}
