/**
 * 발행 전 표기 검증 루프 (2026-08-07 운영자 지시:
 * "발행하기 전에 저 루프를 모두 다 돌고 나서 무결함이 검증된 다음에 발행")
 *
 * 자동발행 게이트가 미등재 선수명을 만나면 곧장 보류하지 않고, 소급 도구
 * (naming-audit)와 같은 검증 루프를 발행 전에 돌린다:
 *   미등재 이름 → LLM 표기 후보 제안 → 네이버 뉴스 검색량 대조 → 압도 표기 승자
 *   → 사전 자동 등재 (기사 표기는 옛 표기 alt 로) → 발행 초크의 사전 치환이
 *   본문을 대표 표기로 정리 → 발행.
 *
 * fail-closed 유지: 네이버 근거가 없는 이름은 등재하지 않고 보류(사람 검수)로
 * 남는다. 인프라 실패(네이버 미가동·후보 생성 실패)는 판정이 아니므로 낙인 없이
 * retry_wait — 이미지 게이트의 infra 구분(2026-08-06)과 같은 규율.
 *
 * 이 자동 등재는 "무인 사서"의 부활이 아니다: 사서 폐지 사유는 근거 없는 등재
 * (은퇴 레전드·감독을 선수로)였고, 여기는 naming-audit(8/4 운영자 승인 가동 중)과
 * 동일하게 **네이버 실사용 근거가 있는 승자만** 등재한다.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { verifySpelling } from "@/lib/naming/verify"
import { isClubName } from "@/lib/naming/pick"
import { normalizePlayerKey } from "@/lib/saga/identity"
import { suggestExisting } from "@/lib/news/alias-suggest"
import type { NamingCategory } from "@/lib/news/naming-normalize"

type ServiceClient = SupabaseClient<never, never, never> | { from: CallableFunction }

/** 기사 1건당 검증 상한 — LLM 1회 + 네이버 최대 4회/이름이라 폭주 방지 */
const MAX_VERIFICATIONS_PER_ARTICLE = 8

/**
 * 기존 항목 흡수 판정용 자모 유사도 하한 (2026-08-07 비니시우스 실사고).
 *
 * ⚠️ 유사도 단독으로는 흡수 금지 — 실측: "비니시우스 주니어"↔"주니오르" 0.875 (진짜 변형)
 * vs "가브리엘 마르티네스"↔"마르티넬리" 0.865 (다른 선수!) — 임계값으로 못 가른다.
 * 판별자는 **로마자 일치**: 같은 선수의 표기 변형은 로마자가 같고(Junior→vinicius junior
 * = 사전 surfaces), 다른 선수는 다르다(Martinez ≠ martinelli). 유사도는 후보 축소용.
 */
const ABSORB_SIMILARITY_MIN = 0.75

export interface LoopDictionaryEntry {
  id: string
  preferred_ko: string
  romanized: string | null
  surfaces: string[] | null
  hangul_alts: string[] | null
}

export interface NamingLoopResult {
  /** 네이버 근거로 사전에 새로 등재된 이름 (기사 표기 → 대표 표기) */
  registered: { name: string; preferred: string }[]
  /** 검증을 통과하지 못한 이름 — 기존대로 보류(사람 검수) 사유가 된다 */
  stillUnknown: string[]
  /** 인프라 실패로 검증 자체를 못 한 이름 — 낙인 없이 retry_wait 대상 */
  infraFailed: string[]
}

/** 로마자 → 비교용 토큰 ("Michael Carrick" → ["michael","carrick"]) */
function romanTokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1)
}

/**
 * 로마자 토큰 포함 관계로 **같은 인물인 기존 항목**을 찾는다 (2026-08-09).
 *
 * 실사고: 기사가 성씨만 '카릭'이라 썼는데 사전에는 '마이클 캐릭'(Michael Carrick)이
 * 풀네임으로만 있었다. 자모 유사도는 길이 차이 때문에 이 둘을 못 잇고, 네이버 검증은
 * LLM 이 낸 후보([카릭, 마이클 카릭, 미하엘 카릭])에 정답이 없어서 **오표기를 152건
 * 근거로 확정**했다. 같은 방식으로 'Xabi Alonso'가 '샤비 알론소'로 확정되기도 했다.
 *
 * 로마자는 LLM 이 거의 틀리지 않는다(누구인지는 안다) — 흔들리는 건 한글 음차뿐이다.
 * 그래서 로마자로 신원을 맞추고, **한글 표기는 사전을 따른다**. 사전이 네이버보다 위다.
 *
 * ⚠️ 유일할 때만 흡수한다. 'Silva' 한 토큰은 Gabriel Silva·Thiago Silva 양쪽의
 * 부분집합이라 아무 데나 붙을 수 있다 — 후보가 둘 이상이면 판단하지 않는다.
 *
 * 단 **정확 일치가 있으면 그것이 이긴다**. 같은 인물이 성씨 항목('캐릭')과 풀네임
 * 항목('마이클 캐릭')으로 둘 다 등재되는 건 정상인데(각포/코디 각포 선례), 부분집합만
 * 보면 둘 다 걸려 "모호함"으로 포기해버린다 — 실측에서 실제로 그랬다.
 */
export function findUniqueRomanizedMatch(
  dictionary: LoopDictionaryEntry[],
  romanized: string | null
): LoopDictionaryEntry | null {
  const want = romanTokens(romanized)
  if (want.length === 0) return null
  const wantSet = new Set(want)
  const wantKey = [...want].sort().join(" ")

  // ① 로마자 토큰 집합이 정확히 같은 항목 (성씨 입력 → 성씨 항목)
  const exact = dictionary.filter(
    (d) => [...new Set(romanTokens(d.romanized))].sort().join(" ") === wantKey
  )
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null // 동명이인 — 판단하지 않는다

  // ② 포함 관계 (성씨 입력 → 풀네임 항목, 또는 그 반대)
  const subset = dictionary.filter((d) => {
    const have = new Set(romanTokens(d.romanized))
    if (have.size === 0) return false
    return want.every((t) => have.has(t)) || [...have].every((t) => wantSet.has(t))
  })
  return subset.length === 1 ? subset[0] : null
}

/** verifySpelling 실패 사유 중 "판정 불가(인프라)"와 "근거 부족(판정)"의 구분 */
function isInfraReason(reason: string | undefined): boolean {
  if (!reason) return false
  return reason.includes("네이버 API 미가동") || reason.includes("후보 생성 실패")
}

export async function resolveUnknownPlayersViaNaver(
  supabase: ServiceClient,
  names: string[],
  contextTitle: string,
  cache?: Map<string, { preferred: string } | "unknown" | "infra">,
  dictionary: LoopDictionaryEntry[] = [],
  /** 등재 분류 — 호출부가 검사관에게서 역할을 받아 넘긴다 (감독을 선수로 등재 금지) */
  category: NamingCategory = "player"
): Promise<NamingLoopResult> {
  const result: NamingLoopResult = { registered: [], stillUnknown: [], infraFailed: [] }
  const memo = cache ?? new Map()
  let verifications = 0

  const preferredIndex = new Map(
    dictionary.map((d) => [d.preferred_ko.replace(/\s+/g, ""), d] as const)
  )

  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue

    // 클럽명 오탐 차단 (실사고: '리버풀'이 선수로 추출됨) — 미등재 취급하지 않는다
    if (isClubName(name)) continue

    const cached = memo.get(name)
    if (cached === "unknown") {
      result.stillUnknown.push(name)
      continue
    }
    if (cached === "infra") {
      result.infraFailed.push(name)
      continue
    }
    if (cached) {
      // 같은 런에서 이미 검증·등재된 이름
      continue
    }

    if (verifications >= MAX_VERIFICATIONS_PER_ARTICLE) {
      // 상한 초과분은 시도조차 못 했다 — 판정이 아니므로 재시도로
      result.infraFailed.push(name)
      continue
    }
    verifications++

    const v = await verifySpelling(name, contextTitle)
    const romanKey = v.romanized ? normalizePlayerKey(v.romanized) : null

    // ── 기존 항목 흡수 (비니시우스 주니어 실사고: 신규 등재만 알고 변형을 몰랐다) ──
    // ① 네이버 승자가 이미 사전의 대표 표기와 같으면 → 그 항목의 별칭으로 흡수
    // ② 승자 판정 실패(주니오르/주니어처럼 양쪽 병용)여도, 자모 유사 후보의
    //    로마자와 일치하면 같은 선수의 변형 → 흡수. 로마자 불일치는 다른 선수(마르티네스류).
    let absorbTarget: LoopDictionaryEntry | null = null
    if (v.winner) {
      absorbTarget = preferredIndex.get(v.winner.replace(/\s+/g, "")) ?? null
    }
    if (!absorbTarget && romanKey && dictionary.length > 0) {
      const sims = suggestExisting(
        name,
        dictionary.map((d) => ({
          id: d.id,
          preferred_ko: d.preferred_ko,
          romanized: d.romanized ?? "",
          hangul_alts: d.hangul_alts,
        })),
        { min: ABSORB_SIMILARITY_MIN, limit: 3 }
      )
      for (const s of sims) {
        const entry = dictionary.find((d) => d.id === s.id)
        if (!entry) continue
        const entryRoman = entry.romanized ? normalizePlayerKey(entry.romanized) : null
        const surfaceKeys = (entry.surfaces ?? []).map((x) => normalizePlayerKey(x))
        if ((entryRoman && entryRoman === romanKey) || surfaceKeys.includes(romanKey)) {
          absorbTarget = entry
          break
        }
      }
    }

    // ③ 로마자 신원 일치 — 성씨만 쓴 표기가 풀네임 항목에 닿는 유일한 경로다.
    //    v.winner(네이버 승자)보다 **먼저** 적용된다: 후보 목록에 정답이 없으면
    //    네이버 승자 자체가 오표기이므로, 이미 검증된 사전이 우선이어야 한다.
    if (!absorbTarget) absorbTarget = findUniqueRomanizedMatch(dictionary, v.romanized)

    if (absorbTarget && absorbTarget.preferred_ko !== name) {
      const absorbError = await absorbAliasIntoEntry(supabase, absorbTarget.id, name)
      if (absorbError) {
        memo.set(name, "infra")
        result.infraFailed.push(name)
        continue
      }
      memo.set(name, { preferred: absorbTarget.preferred_ko })
      result.registered.push({ name, preferred: absorbTarget.preferred_ko })
      continue
    }

    if (!v.winner || !v.romanized) {
      if (isInfraReason(v.reason)) {
        memo.set(name, "infra")
        result.infraFailed.push(name)
      } else {
        memo.set(name, "unknown")
        result.stillUnknown.push(name)
      }
      continue
    }

    const registerError = await registerVerifiedPlayer(supabase, {
      articleName: name,
      preferred: v.winner,
      romanized: v.romanized,
      category,
      notes: `발행 게이트 등재(${category}) — 네이버: ${v.counts.map((c) => `${c.candidate} ${c.total}건`).join(", ")}`,
    })
    if (registerError) {
      // 등재 실패는 인프라 실패로 취급 — 다음 회차에 다시 시도
      memo.set(name, "infra")
      result.infraFailed.push(name)
      continue
    }

    memo.set(name, { preferred: v.winner })
    result.registered.push({ name, preferred: v.winner })
  }

  return result
}

/** 기존 사전 항목에 표기 변형을 별칭으로 흡수 (admin 1클릭 alias 모드와 동일 효과) */
export async function absorbAliasIntoEntry(
  supabase: ServiceClient,
  entryId: string,
  alias: string
): Promise<string | null> {
  const { data: existing, error: readError } = await (supabase as SupabaseClient)
    .from("news_alias_dictionary")
    .select("hangul_alts")
    .eq("id", entryId)
    .maybeSingle()
  if (readError) return readError.message
  if (!existing) return "entry_not_found"
  const merged = Array.from(new Set([...((existing.hangul_alts as string[] | null) ?? []), alias]))
  const { error } = await (supabase as SupabaseClient)
    .from("news_alias_dictionary")
    .update({ hangul_alts: merged, updated_at: new Date().toISOString() })
    .eq("id", entryId)
  return error ? error.message : null
}

/**
 * 네이버 검증을 통과한 표기를 사전에 등재. naming-audit(소급 감사)과 같은 형태 —
 * id 는 romanized 키 기반, 기사 표기가 대표와 다르면 옛 표기(alt)로 흡수해
 * 발행 초크의 사전 치환이 본문을 대표 표기로 바꾸게 한다.
 */
export async function registerVerifiedPlayer(
  supabase: ServiceClient,
  input: {
    articleName: string
    preferred: string
    romanized: string
    notes: string
    /**
     * 등재 분류. 감독을 player 로 넣으면 무인 사서를 폐지시킨 그 오염("은퇴 레전드·
     * 감독을 선수로")이 재발한다 — 호출부가 역할을 알 때만 coach 를 넘길 것.
     */
    category?: NamingCategory
  }
): Promise<string | null> {
  const category = input.category ?? "player"
  const romanKey = normalizePlayerKey(input.romanized)
  const id = `${category}_auto_${romanKey.replace(/-/g, "_")}`.slice(0, 60)

  // 이미 있으면 새 표기를 별칭으로 흡수 — 예전 ignoreDuplicates 는 조용히 no-op 이라
  // 변형 표기가 영영 등재되지 않았다 (비니시우스 실사고 계열의 잠복 버그)
  const { data: existing } = await (supabase as SupabaseClient)
    .from("news_alias_dictionary")
    .select("id")
    .eq("id", id)
    .maybeSingle()
  if (existing) {
    if (input.articleName !== input.preferred) {
      return absorbAliasIntoEntry(supabase, id, input.articleName)
    }
    return null
  }

  const { error } = await (supabase as SupabaseClient).from("news_alias_dictionary").insert({
    id,
    category,
    preferred_ko: input.preferred,
    romanized: input.romanized,
    surfaces: [romanKey.replace(/-/g, " "), input.preferred],
    hangul_alts: input.preferred !== input.articleName ? [input.articleName] : [],
    confidence: 0.7,
    notes: input.notes,
  })
  return error ? error.message : null
}
