/**
 * 팀 게시판 레지스트리 (2026-08-23 운영자: EPL 6 + 유럽 8 팀 보드 신설).
 *
 * 게시판 노출 자체는 categories DB 행(마이그 20260823_team_boards.sql)이 담당하고,
 * 여기는 **헤더 커스텀 재료만** 든다 — 크리에이터 보드의 lib/constants/creators.ts 와
 * 같은 2파일 패턴. 아스날 보드(20260822b)의 slug 하드코딩 분기를 일반화한 것.
 *
 * - crest: 헤더 엠블럼. public/season 에 실자산이 있는 팀만 (없는 팀은 텍스트 헤더 —
 *   새 구단 로고 반입은 로고 정책 결정 사항이라 여기서 늘리지 않는다)
 * - sagaTeamId: sagas.subject->>'team_id' — active 시즌 사가가 있으면 헤더 우측에
 *   "시즌 사가 →" 링크가 자동으로 붙는다 (없는 팀은 위키 생성 시 자동 등장)
 */
export interface TeamBoardInfo {
  slug: string
  name: string
  crest: string | null
  sagaTeamId: string | null
}

export const TEAM_BOARDS: Record<string, TeamBoardInfo> = {
  // ── EPL ──
  arsenal: {
    slug: "arsenal",
    name: "아스날",
    crest: "/season/crest-arsenal.png",
    sagaTeamId: "arsenal",
  },
  chelsea: {
    slug: "chelsea",
    name: "첼시",
    crest: "/season/crest-chelsea.png",
    sagaTeamId: "chelsea",
  },
  liverpool: {
    slug: "liverpool",
    name: "리버풀",
    crest: "/season/crest-liverpool.png",
    sagaTeamId: "liverpool",
  },
  mancity: {
    slug: "mancity",
    name: "맨시티",
    crest: "/season/crest-mancity.png",
    sagaTeamId: "man-city",
  },
  manutd: { slug: "manutd", name: "맨유", crest: "/season/crest-manutd.png", sagaTeamId: null },
  tottenham: {
    slug: "tottenham",
    name: "토트넘",
    crest: "/season/crest-tottenham.png",
    sagaTeamId: null,
  },
  // ── 라리가 ──
  realmadrid: {
    slug: "realmadrid",
    name: "레알",
    crest: "/season/crest-realmadrid.png",
    sagaTeamId: null,
  },
  barcelona: {
    slug: "barcelona",
    name: "바르셀로나",
    crest: "/season/crest-barcelona.png",
    sagaTeamId: null,
  },
  atletico: {
    slug: "atletico",
    name: "아틀레티코",
    crest: "/season/crest-atletico.png",
    sagaTeamId: null,
  },
  // ── 분데스리가 ──
  bayern: { slug: "bayern", name: "뮌헨", crest: "/season/crest-bayern.png", sagaTeamId: null },
  dortmund: {
    slug: "dortmund",
    name: "도르트문트",
    crest: "/season/crest-dortmund.png",
    sagaTeamId: null,
  },
  // ── 세리에A ──
  milan: { slug: "milan", name: "밀란", crest: "/season/crest-milan.png", sagaTeamId: null },
  juventus: {
    slug: "juventus",
    name: "유벤투스",
    crest: "/season/crest-juventus.png",
    sagaTeamId: null,
  },
  inter: { slug: "inter", name: "인테르", crest: "/season/crest-inter.png", sagaTeamId: null },
}

export function getTeamBoard(slug: string): TeamBoardInfo | null {
  return TEAM_BOARDS[slug] ?? null
}
