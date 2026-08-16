/**
 * 표기(notation) 모듈 — 뉴스 파이프라인에서 "무엇을 어떻게 표기하는가"의 유일한 소유자.
 *
 * ## 왜 있는가
 * 2026-08-09 하루에 표기 사고가 다섯 번 났다. 감독 이름이 4중 방어를 통과했고,
 * 매체명이 영·한으로 섞여 68건 나갔고, 사전이 1,000행에서 조용히 잘렸고,
 * 네이버가 오답을 근거와 함께 확정했고, 그걸 잡아야 할 표기 감시 자체가 사각이었다.
 * 전부 원인이 같았다 — **사전은 하나인데 읽는 경로가 7개였고 전부 제각각이었다.**
 * 그래서 매번 다르게 틀렸고, 다섯 번 다 사람이 눈으로 찾았다.
 *
 * ## 규칙
 * 뉴스 경로에서 `news_alias_dictionary` 를 직접 읽지 마라. 여기서 받아 써라.
 * 이 규칙은 말로만 있지 않다 — `__tests__/arch/notation-single-door.test.ts` 가
 * 모듈 밖 직접 접근을 실패로 만든다. 8번째 경로가 조용히 어긋나는 것을 막는 장치다.
 *
 * ## 쓰는 법
 * ```ts
 * const notation = await loadNotationSafe(supabase)   // 교정 경로 (실패해도 진행)
 * const notation = await loadNotation(supabase)       // 감사 경로 (실패는 던진다)
 *
 * title   = applyNamingPairs(title, notation.pairs)
 * title   = normalizeSourceLabel(title, notation.labels)
 * content = applyNamingPairsToTipTap(content, notation.pairs)
 * unknown = unknownPersonNames(names, notation.persons)
 * ```
 *
 * ⚠️ 사가(`lib/saga/*`)는 여기 합치지 않는다 — 의도적으로 player 한정이다.
 * 사가는 선수 이적이라 감독을 섞으면 무인 사서를 폐지시킨 오염이 재발한다.
 */

export { loadNotation, loadNotationSafe, addRuntimePerson, type PersonCategory } from "./load"

export {
  // 인물 표기 치환
  buildNamingPairs,
  applyNamingPairs,
  applyNamingPairsToTipTap,
  // 출처 라벨
  sourceKey,
  buildSourceLabelMap,
  normalizeSourceLabel,
  // 신원 판정
  unknownPersonNames,
  findUniqueRomanizedMatch,
  // 예방 힌트

  // 위반 탐지
  findNotationViolations,
  findAliasPoisoning,
  type NotationEntry,
} from "./rules"
