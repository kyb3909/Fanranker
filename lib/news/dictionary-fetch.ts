import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * 표기 사전 전량 조회 (2026-08-09).
 *
 * ⚠️ **PostgREST 는 한 요청에 최대 1,000행만 돌려주고, 초과분은 오류 없이 조용히 자른다.**
 * 실측 사고: player+coach+team+media = 1,041행인데 955건만 도착했고, 방금 등재한 매체
 * 항목(로마노 등)이 통째로 빠져 있었다. 에러도 경고도 없다 — 그냥 사전이 짧아진다.
 *
 * 이게 위험한 이유는 **사전이 자동 등재로 매일 자라기 때문**이다. 상한을 넘는 순간
 * 꼬리쪽 항목의 교정이 조용히 멈추고, 증상은 "요즘 표기가 좀 틀리네"로만 나타난다.
 * 표기 정확도를 지키는 모든 경로(발행 전 게이트·전방 교정·소급 감사·예방 주입)가
 * 이 함수를 쓰는 이유다.
 */

/** PostgREST 기본 상한과 같은 값 — 이보다 크게 잡아도 서버가 잘라서 무의미하다 */
const PAGE_SIZE = 1000
/** 폭주 방지 — 사전이 2만 건을 넘을 일은 없다 (넘으면 설계를 다시 봐야 한다) */
const MAX_PAGES = 20

export async function fetchDictionaryRows<T>(
  supabase: SupabaseClient<never, never, never> | { from: CallableFunction },
  columns: string,
  categories: readonly string[]
): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const { data, error } = await (supabase as SupabaseClient)
      .from("news_alias_dictionary")
      .select(columns)
      .in("category", [...categories])
      // 페이지 경계가 흔들리지 않도록 안정 정렬 — 없으면 행이 중복/누락될 수 있다
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE_SIZE) return out
  }
  return out
}
