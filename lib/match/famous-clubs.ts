/**
 * 유명 구단 판정 — 일정 행 타로 버튼 노출용 (2026-08-21 운영자:
 * "각 경기 오른쪽에 타로점 버튼, 좀 유명한 클럽이 있을 때만").
 *
 * 사전 변환 **후의 표시 통칭**에 대한 부분 일치로 판정한다 — 원문(LFA 영문·betman
 * 한글)이 아니라 화면에 보이는 이름 기준이라, 사전이 자라면 판정도 따라온다.
 * 유명 구단인데 사전에 아직 없어 로마자로 뜨는 경우는 버튼이 안 뜰 뿐 — 안전한 실패.
 *
 * ⚠️ 키워드는 화이트리스트 리그 안에서 **다른 팀과 부분 일치가 안 겹치는 표기**만
 *    넣을 것 ("인테르"는 "인터 투르쿠"와 안 겹치지만, 접두 "인터"였다면 사고 —
 *    2026-08-20 인터 투르쿠 오염 전례).
 */
const FAMOUS_KEYWORDS = [
  // EPL
  "아스날",
  "리버풀",
  "첼시",
  "토트넘",
  "맨체스터",
  "맨시티",
  "맨유",
  "뉴캐슬",
  "아스톤 빌라",
  "애스턴 빌라",
  "울버햄튼",
  // 라리가
  "레알 마드리드",
  "바르셀로나",
  "아틀레티코",
  // 분데스리가
  "바이에른",
  "도르트문트",
  "레버쿠젠",
  "라이프치히",
  // 세리에 A
  "유벤투스",
  "인테르",
  "나폴리",
  "밀란",
  "로마",
  // 리그 1
  "파리 생제르맹",
  "PSG",
  "마르세유",
  "모나코",
  // 유럽 대항전 단골
  "아약스",
  "포르투",
  "벤피카",
  "셀틱",
  // 로마자 폴백 — 위 구단이 사전에 아직 없어 원문으로 뜨는 경우 (2026-08-23 실측:
  // Torino–Milan 행이 로마자라 버튼 누락). 위 한글 목록과 같은 구단만 넣는다.
  // ⚠️ "Real"·"Inter" 같은 짧은 접두 금지 (Real Sociedad·Inter Turku 오염)
  "Arsenal",
  "Liverpool",
  "Chelsea",
  "Tottenham",
  "Manchester",
  "Newcastle",
  "Aston Villa",
  "Real Madrid",
  "Barcelona",
  "Atletico Madrid",
  "Bayern",
  "Dortmund",
  "Leverkusen",
  "Leipzig",
  "Juventus",
  "Napoli",
  "Milan",
  "Roma",
  "Paris Saint",
  "Marseille",
  "Monaco",
  "Ajax",
  "Porto",
  "Benfica",
  "Celtic",
]

/** 표시 라벨 중 하나라도 유명 구단 키워드에 걸리면 true */
export function hasFamousClub(...teamLabels: string[]): boolean {
  return teamLabels.some((label) =>
    FAMOUS_KEYWORDS.some((k) => label.toLowerCase().includes(k.toLowerCase()))
  )
}
