import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchDictionaryRows } from "@/lib/news/dictionary-fetch"
import {
  buildNamingPairs,
  buildNotationHints,
  buildSourceLabelMap,
  type NamingPair,
  type NotationEntry,
  type NotationHint,
} from "./rules"

/**
 * 표기 사전 로딩 — **뉴스 파이프라인의 유일한 사전 진입점**.
 *
 * 왜 하나여야 하는가: 2026-08-09 이전에는 7개 경로가 각자 사전을 읽었고
 * category 필터·페이징·검사 범위·실패 처리가 전부 달랐다. 하나만 어긋나도
 * 조용히 지나가서, 하루에 같은 병이 다섯 번 터졌다. 범위를 **고를 수 없게**
 * 만드는 것이 이 모듈의 목적이다 — 새 소비자는 여기서 받은 뷰만 쓴다.
 *
 * ⚠️ 사가(saga) 경로는 여기 합치지 않는다. `lib/saga/*` 는 의도적으로 player
 * 한정이다 — 사가는 선수 이적이라 감독을 섞으면 무인 사서를 폐지시킨 오염이
 * 재발한다. 그쪽은 별개 정책이고, 그 사실 자체가 아키텍처 가드 테스트에 적혀 있다.
 */

/** 인물 — 표기 치환·게이트·신원 판정 대상 */
const PERSON_CATEGORIES = ["player", "coach"] as const
/** 출처 라벨 — 매체와 구단(공식 발표) */
const LABEL_CATEGORIES = ["media", "team"] as const
/** 사전에서 읽어오는 전체 범위 */
const NOTATION_CATEGORIES = [...PERSON_CATEGORIES, ...LABEL_CATEGORIES] as const

export type PersonCategory = (typeof PERSON_CATEGORIES)[number]

const COLUMNS = "id, category, preferred_ko, romanized, surfaces, hangul_alts, disambiguation"

/** 한 번 읽어 만든 사전 뷰 — 소비자는 필요한 조각만 꺼내 쓴다 */
interface Notation {
  /** 전체 항목 (인물 + 라벨) */
  entries: NotationEntry[]
  /** 인물만 — 게이트·신원 판정용 */
  persons: NotationEntry[]
  /** 인물 표기 치환 쌍 (alt → preferred), 긴 표기 우선 */
  pairs: NamingPair[]
  /** 출처 라벨 키 → 대표 표기 */
  labels: Map<string, string>
  /** 스캐너 예방 힌트 재료 */
  hints: NotationHint[]
}

function toView(entries: NotationEntry[]): Notation {
  const persons = entries.filter((e) =>
    (PERSON_CATEGORIES as readonly string[]).includes(e.category)
  )
  const labelRows = entries.filter((e) =>
    (LABEL_CATEGORIES as readonly string[]).includes(e.category)
  )
  return {
    entries,
    persons,
    // 치환은 **인물 + 구단·매체 전부**를 대상으로 한다 (2026-08-09 운영자 "네이버 우선").
    // 인물만 보던 시절의 실측: 아스날 36건 vs 아스널 10건 — 우리 사전도 네이버도
    // '아스널'인데 구단이 치환 대상이 아니라 틀린 쪽이 3.6배 많았다. 같은 팀이 기사마다
    // 다른 이름으로 나오면 독자는 매체로 안 본다.
    // 안전은 buildNamingPairs 가 진다 — 한글 alt 만, 2자 이상, 대표 표기 충돌 시 제외.
    pairs: buildNamingPairs(entries),
    labels: buildSourceLabelMap(labelRows),
    hints: buildNotationHints(entries),
  }
}

/** 빈 사전 — 조회 실패 시 "교정 없이 진행"을 선택한 호출부가 쓴다 */
function emptyNotation(): Notation {
  return toView([])
}

/**
 * 사전 전량 로드. **던진다** — 조용한 빈 배열은 금지다.
 * 조용한 실패가 바로 2026-08-09 무음 절단 사고의 성질이었다. 교정을 생략할지
 * 발행을 멈출지는 경로마다 다르므로, 그 선택은 호출부가 명시적으로 한다
 * (교정 경로는 `loadNotationSafe`, 감사 경로는 이 함수를 그대로 쓴다).
 */
export async function loadNotation(
  supabase: SupabaseClient<never, never, never> | { from: CallableFunction }
): Promise<Notation> {
  const rows = await fetchDictionaryRows<NotationEntry>(supabase, COLUMNS, NOTATION_CATEGORIES)
  return toView(rows)
}

/**
 * 실패해도 발행을 막지 않는 로더 — 교정 초크포인트용.
 * 사전 장애로 기사 발행이 통째로 멈추는 것보다, 교정 없이 나가고 소급 감사가
 * 잡는 편이 낫다는 판단 (naming-audit 이 매일 23:20 에 돈다).
 */
export async function loadNotationSafe(
  supabase: SupabaseClient<never, never, never> | { from: CallableFunction }
): Promise<Notation> {
  try {
    return await loadNotation(supabase)
  } catch {
    return emptyNotation()
  }
}

/**
 * 런 도중 새로 등재된 인물을 뷰에 반영 — 같은 회차의 뒷 기사가 다시 막히지 않게.
 * (news-auto-publish 의 네이버 검증 루프가 쓴다)
 */
export function addRuntimePerson(
  notation: Notation,
  entry: { preferred_ko: string; hangul_alts?: string[] | null }
): void {
  const row: NotationEntry = {
    id: `runtime_${notation.persons.length}`,
    category: "player",
    preferred_ko: entry.preferred_ko,
    romanized: null,
    surfaces: null,
    hangul_alts: entry.hangul_alts ?? [],
  }
  notation.entries.push(row)
  notation.persons.push(row)
}
