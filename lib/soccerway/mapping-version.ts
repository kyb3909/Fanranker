/**
 * Soccerway 매핑 술어/파서 버전 — 순수 상수 (2026-09-07 분리).
 *
 * 규칙이 바뀌면 올린다. 버전이 오르면 전 경기 재평가가 열린다 (원장 유니크가 버전을 포함).
 *  .2 (2026-08-07): 2연전 목록 템플릿(B) 지원 — .1 은 단일 템플릿만 알아서
 *  UCL 예선 쌍 페이지가 전부 parse_failed(dead_letter)로 남았다 (원장 실측).
 *
 * 따로 둔 이유: 감사관(invariant-audit)이 "이 버전의 봉인된 판정"만 보려고 값을 읽는데,
 * 러너(match-mapping.ts)를 통째로 import 하면 페이지 파서·검색 클라이언트까지 딸려 온다.
 */
export const PREDICATE_VERSION = "match-mapping@2026-08-07.2"
