// Legacy single-player draft modes (not used by multiplayer draft)
// Keep for backward compatibility if any pages reference it

interface LegacyPlayer {
  id: string
  name: string
  position: string
  rating: number
  salary: number
}

interface LegacyGameConfig {
  id: string
  name: string
  description: string
  category: string
  icon: string
  totalPicks: number
  picksPerTeam: number
  budget: number
  positions: string[]
  timerSeconds: number
  salaryRange: { min: number; max: number }
  players: LegacyPlayer[]
}

// ============================
// EPL Draft
// ============================
const epl: LegacyGameConfig = {
  id: "epl",
  name: "EPL 드래프트",
  description: "프리미어리그 최고의 선수들",
  category: "스포츠",
  icon: "⚽",
  totalPicks: 20,
  picksPerTeam: 5,
  budget: 30,
  positions: ["FW", "MF", "DF", "GK"],
  timerSeconds: 30,
  salaryRange: { min: 1, max: 10 },
  players: [
    { id: "epl-1", name: "홀란드", position: "FW", rating: 95, salary: 10 },
    { id: "epl-2", name: "살라", position: "FW", rating: 93, salary: 9 },
    { id: "epl-3", name: "손흥민", position: "FW", rating: 91, salary: 9 },
    { id: "epl-4", name: "사카", position: "FW", rating: 90, salary: 8 },
    { id: "epl-5", name: "파머", position: "MF", rating: 89, salary: 8 },
    { id: "epl-6", name: "오데가르드", position: "MF", rating: 90, salary: 8 },
    { id: "epl-7", name: "브루노 페르난데스", position: "MF", rating: 89, salary: 7 },
    { id: "epl-8", name: "라이스", position: "MF", rating: 88, salary: 7 },
    { id: "epl-9", name: "이사크", position: "FW", rating: 88, salary: 7 },
    { id: "epl-10", name: "왓킨스", position: "FW", rating: 86, salary: 6 },
    { id: "epl-11", name: "살리바", position: "DF", rating: 90, salary: 8 },
    { id: "epl-12", name: "반다이크", position: "DF", rating: 89, salary: 7 },
    { id: "epl-13", name: "가브리엘", position: "DF", rating: 88, salary: 7 },
    { id: "epl-14", name: "디아스", position: "DF", rating: 87, salary: 6 },
    { id: "epl-15", name: "알렉산더-아놀드", position: "DF", rating: 88, salary: 7 },
    { id: "epl-16", name: "알리송", position: "GK", rating: 90, salary: 7 },
    { id: "epl-17", name: "라야", position: "GK", rating: 88, salary: 6 },
    { id: "epl-18", name: "고든", position: "FW", rating: 85, salary: 5 },
    { id: "epl-19", name: "마디슨", position: "MF", rating: 85, salary: 5 },
    { id: "epl-20", name: "칼라피오리", position: "DF", rating: 84, salary: 5 },
    { id: "epl-21", name: "엔소 페르난데스", position: "MF", rating: 83, salary: 4 },
    { id: "epl-22", name: "엘랑가", position: "FW", rating: 82, salary: 4 },
    { id: "epl-23", name: "온나나", position: "GK", rating: 84, salary: 4 },
    { id: "epl-24", name: "구엘히", position: "DF", rating: 83, salary: 4 },
    { id: "epl-25", name: "잭슨", position: "FW", rating: 84, salary: 5 },
    { id: "epl-26", name: "카이세도", position: "MF", rating: 83, salary: 4 },
    { id: "epl-27", name: "솔란케", position: "FW", rating: 82, salary: 3 },
    { id: "epl-28", name: "바이스호스트", position: "DF", rating: 81, salary: 3 },
    { id: "epl-29", name: "마르티네스", position: "GK", rating: 86, salary: 5 },
    { id: "epl-30", name: "로드리고", position: "MF", rating: 82, salary: 3 },
  ],
}

// ============================
// World Soccer Draft
// ============================
const soccer: LegacyGameConfig = {
  id: "soccer",
  name: "축구 선수 드래프트",
  description: "세계 최고의 축구 선수들",
  category: "스포츠",
  icon: "⚽",
  totalPicks: 20,
  picksPerTeam: 5,
  budget: 30,
  positions: ["FW", "MF", "DF", "GK"],
  timerSeconds: 30,
  salaryRange: { min: 1, max: 10 },
  players: [
    { id: "soc-1", name: "비니시우스 주니오르", position: "FW", rating: 95, salary: 10 },
    { id: "soc-2", name: "음바페", position: "FW", rating: 94, salary: 10 },
    { id: "soc-3", name: "벨링엄", position: "MF", rating: 93, salary: 9 },
    { id: "soc-4", name: "홀란드", position: "FW", rating: 95, salary: 10 },
    { id: "soc-5", name: "로드리", position: "MF", rating: 92, salary: 9 },
    { id: "soc-6", name: "살라", position: "FW", rating: 93, salary: 9 },
    { id: "soc-7", name: "야말", position: "FW", rating: 90, salary: 8 },
    { id: "soc-8", name: "손흥민", position: "FW", rating: 91, salary: 8 },
    { id: "soc-9", name: "페드리", position: "MF", rating: 89, salary: 7 },
    { id: "soc-10", name: "뮈니에", position: "MF", rating: 88, salary: 7 },
    { id: "soc-11", name: "하킴 지예흐", position: "MF", rating: 86, salary: 6 },
    { id: "soc-12", name: "아라우호", position: "DF", rating: 88, salary: 7 },
    { id: "soc-13", name: "살리바", position: "DF", rating: 90, salary: 8 },
    { id: "soc-14", name: "루벤 디아스", position: "DF", rating: 88, salary: 7 },
    { id: "soc-15", name: "알폰소 데이비스", position: "DF", rating: 87, salary: 6 },
    { id: "soc-16", name: "쿠르투아", position: "GK", rating: 91, salary: 8 },
    { id: "soc-17", name: "알리송", position: "GK", rating: 90, salary: 7 },
    { id: "soc-18", name: "김민재", position: "DF", rating: 87, salary: 6 },
    { id: "soc-19", name: "귄도안", position: "MF", rating: 87, salary: 6 },
    { id: "soc-20", name: "무시알라", position: "MF", rating: 89, salary: 7 },
    { id: "soc-21", name: "이강인", position: "MF", rating: 85, salary: 5 },
    { id: "soc-22", name: "오시멘", position: "FW", rating: 88, salary: 7 },
    { id: "soc-23", name: "마르키뇨스", position: "DF", rating: 87, salary: 6 },
    { id: "soc-24", name: "테어 슈테겐", position: "GK", rating: 89, salary: 6 },
    { id: "soc-25", name: "비르츠", position: "MF", rating: 88, salary: 7 },
    { id: "soc-26", name: "카마빙가", position: "MF", rating: 86, salary: 5 },
    { id: "soc-27", name: "하베르츠", position: "FW", rating: 84, salary: 4 },
    { id: "soc-28", name: "가비", position: "MF", rating: 84, salary: 4 },
    { id: "soc-29", name: "쿠프메나", position: "DF", rating: 85, salary: 5 },
    { id: "soc-30", name: "도나루마", position: "GK", rating: 87, salary: 5 },
  ],
}

// ============================
// Slam Dunk Draft
// ============================
const slamDunk: LegacyGameConfig = {
  id: "slam-dunk",
  name: "슬램덩크 드래프트",
  description: "북산고 vs 산왕공고 드림팀",
  category: "애니메이션",
  icon: "🏀",
  totalPicks: 20,
  picksPerTeam: 5,
  budget: 30,
  positions: ["PG", "SG", "SF", "PF", "C"],
  timerSeconds: 30,
  salaryRange: { min: 1, max: 10 },
  players: [
    { id: "sd-1", name: "강백호", position: "PF", rating: 88, salary: 8 },
    { id: "sd-2", name: "서태웅", position: "SF", rating: 95, salary: 10 },
    { id: "sd-3", name: "채치수", position: "C", rating: 87, salary: 7 },
    { id: "sd-4", name: "정대만", position: "SG", rating: 90, salary: 9 },
    { id: "sd-5", name: "송태섭", position: "PG", rating: 85, salary: 7 },
    { id: "sd-6", name: "신준섭", position: "PG", rating: 93, salary: 10 },
    { id: "sd-7", name: "이정환", position: "SF", rating: 92, salary: 9 },
    { id: "sd-8", name: "정우성", position: "C", rating: 91, salary: 9 },
    { id: "sd-9", name: "남강일", position: "PG", rating: 89, salary: 8 },
    { id: "sd-10", name: "변덕규", position: "PF", rating: 85, salary: 6 },
    { id: "sd-11", name: "윤대협", position: "SG", rating: 88, salary: 7 },
    { id: "sd-12", name: "황태산", position: "C", rating: 86, salary: 6 },
    { id: "sd-13", name: "권준호", position: "PG", rating: 84, salary: 5 },
    { id: "sd-14", name: "진소연", position: "SG", rating: 82, salary: 4 },
    { id: "sd-15", name: "강동준", position: "SF", rating: 83, salary: 5 },
    { id: "sd-16", name: "어영달", position: "PG", rating: 78, salary: 3 },
    { id: "sd-17", name: "미키오", position: "C", rating: 88, salary: 7 },
    { id: "sd-18", name: "사와키타", position: "SF", rating: 91, salary: 9 },
    { id: "sd-19", name: "후쿠다", position: "PF", rating: 86, salary: 6 },
    { id: "sd-20", name: "마키", position: "SF", rating: 90, salary: 8 },
    { id: "sd-21", name: "진", position: "PG", rating: 87, salary: 7 },
    { id: "sd-22", name: "센도", position: "SF", rating: 94, salary: 10 },
    { id: "sd-23", name: "우오즈미", position: "C", rating: 89, salary: 8 },
    { id: "sd-24", name: "후지마", position: "PG", rating: 88, salary: 7 },
    { id: "sd-25", name: "하나미치 2년후", position: "PF", rating: 93, salary: 10 },
  ],
}

// ============================
// K-POP Idol Draft
// ============================
const idol: LegacyGameConfig = {
  id: "idol",
  name: "아이돌 드래프트",
  description: "K-POP 스타 선발전",
  category: "엔터테인먼트",
  icon: "🎤",
  totalPicks: 20,
  picksPerTeam: 5,
  budget: 30,
  positions: ["보컬", "댄스", "랩", "비주얼"],
  timerSeconds: 30,
  salaryRange: { min: 1, max: 10 },
  players: [
    { id: "idol-1", name: "지드래곤", position: "랩", rating: 98, salary: 10 },
    { id: "idol-2", name: "태양", position: "보컬", rating: 95, salary: 9 },
    { id: "idol-3", name: "지민 (BTS)", position: "댄스", rating: 96, salary: 10 },
    { id: "idol-4", name: "정국", position: "보컬", rating: 97, salary: 10 },
    { id: "idol-5", name: "RM", position: "랩", rating: 95, salary: 9 },
    { id: "idol-6", name: "뷔", position: "비주얼", rating: 96, salary: 9 },
    { id: "idol-7", name: "카리나", position: "댄스", rating: 93, salary: 8 },
    { id: "idol-8", name: "윈터", position: "보컬", rating: 91, salary: 8 },
    { id: "idol-9", name: "장원영", position: "비주얼", rating: 94, salary: 9 },
    { id: "idol-10", name: "안유진", position: "비주얼", rating: 92, salary: 8 },
    { id: "idol-11", name: "민지", position: "댄스", rating: 92, salary: 8 },
    { id: "idol-12", name: "하니", position: "비주얼", rating: 91, salary: 7 },
    { id: "idol-13", name: "지수", position: "비주얼", rating: 93, salary: 8 },
    { id: "idol-14", name: "제니", position: "랩", rating: 94, salary: 9 },
    { id: "idol-15", name: "로제", position: "보컬", rating: 92, salary: 8 },
    { id: "idol-16", name: "리사", position: "댄스", rating: 95, salary: 9 },
    { id: "idol-17", name: "슈가", position: "랩", rating: 94, salary: 8 },
    { id: "idol-18", name: "J-Hope", position: "댄스", rating: 93, salary: 7 },
    { id: "idol-19", name: "태연", position: "보컬", rating: 96, salary: 9 },
    { id: "idol-20", name: "아이유", position: "보컬", rating: 97, salary: 10 },
    { id: "idol-21", name: "현진", position: "댄스", rating: 90, salary: 6 },
    { id: "idol-22", name: "펠릭스", position: "비주얼", rating: 89, salary: 6 },
    { id: "idol-23", name: "방찬", position: "랩", rating: 88, salary: 5 },
    { id: "idol-24", name: "닝닝", position: "보컬", rating: 88, salary: 5 },
    { id: "idol-25", name: "해린", position: "댄스", rating: 89, salary: 6 },
  ],
}

// ============================
// NBA Draft
// ============================
const nba: LegacyGameConfig = {
  id: "nba",
  name: "NBA 드래프트",
  description: "현역 NBA 올스타",
  category: "스포츠",
  icon: "🏀",
  totalPicks: 20,
  picksPerTeam: 5,
  budget: 30,
  positions: ["PG", "SG", "SF", "PF", "C"],
  timerSeconds: 30,
  salaryRange: { min: 1, max: 10 },
  players: [
    { id: "nba-1", name: "니콜라 요키치", position: "C", rating: 97, salary: 10 },
    { id: "nba-2", name: "루카 돈치치", position: "PG", rating: 96, salary: 10 },
    { id: "nba-3", name: "야니스 아데토쿤보", position: "PF", rating: 96, salary: 10 },
    { id: "nba-4", name: "셰이 길저스-알렉산더", position: "SG", rating: 95, salary: 9 },
    { id: "nba-5", name: "제이슨 테이텀", position: "SF", rating: 93, salary: 9 },
    { id: "nba-6", name: "스테판 커리", position: "PG", rating: 93, salary: 9 },
    { id: "nba-7", name: "케빈 듀란트", position: "SF", rating: 92, salary: 8 },
    { id: "nba-8", name: "앤서니 에드워즈", position: "SG", rating: 91, salary: 8 },
    { id: "nba-9", name: "르브론 제임스", position: "SF", rating: 91, salary: 8 },
    { id: "nba-10", name: "앤서니 데이비스", position: "PF", rating: 90, salary: 7 },
    { id: "nba-11", name: "빅터 웸바냐마", position: "C", rating: 90, salary: 8 },
    { id: "nba-12", name: "데빈 부커", position: "SG", rating: 89, salary: 7 },
    { id: "nba-13", name: "타이리즈 할리버튼", position: "PG", rating: 89, salary: 7 },
    { id: "nba-14", name: "지미 버틀러", position: "SF", rating: 88, salary: 6 },
    { id: "nba-15", name: "파올로 반케로", position: "PF", rating: 87, salary: 6 },
    { id: "nba-16", name: "자 모란트", position: "PG", rating: 88, salary: 6 },
    { id: "nba-17", name: "카와이 레너드", position: "SF", rating: 87, salary: 6 },
    { id: "nba-18", name: "칼 앤서니 타운스", position: "C", rating: 86, salary: 5 },
    { id: "nba-19", name: "트레이 영", position: "PG", rating: 87, salary: 5 },
    { id: "nba-20", name: "폴 조지", position: "SF", rating: 85, salary: 5 },
    { id: "nba-21", name: "브랜든 잉그램", position: "SF", rating: 85, salary: 4 },
    { id: "nba-22", name: "드웨인 폭스", position: "PG", rating: 84, salary: 4 },
    { id: "nba-23", name: "루디 고베르", position: "C", rating: 85, salary: 4 },
    { id: "nba-24", name: "제일런 브런슨", position: "PG", rating: 89, salary: 7 },
    { id: "nba-25", name: "도노반 미첼", position: "SG", rating: 88, salary: 6 },
  ],
}

// ============================
// NBA Legend Draft
// ============================
const nbaLegend: LegacyGameConfig = {
  id: "nba-legend",
  name: "NBA 레전드 드래프트",
  description: "역대 최고의 전설들",
  category: "스포츠",
  icon: "🏆",
  totalPicks: 20,
  picksPerTeam: 5,
  budget: 30,
  positions: ["PG", "SG", "SF", "PF", "C"],
  timerSeconds: 30,
  salaryRange: { min: 1, max: 10 },
  players: [
    { id: "nbl-1", name: "마이클 조던", position: "SG", rating: 99, salary: 10 },
    { id: "nbl-2", name: "르브론 제임스", position: "SF", rating: 98, salary: 10 },
    { id: "nbl-3", name: "코비 브라이언트", position: "SG", rating: 97, salary: 10 },
    { id: "nbl-4", name: "매직 존슨", position: "PG", rating: 97, salary: 9 },
    { id: "nbl-5", name: "래리 버드", position: "SF", rating: 96, salary: 9 },
    { id: "nbl-6", name: "샤킬 오닐", position: "C", rating: 97, salary: 10 },
    { id: "nbl-7", name: "팀 던컨", position: "PF", rating: 96, salary: 9 },
    { id: "nbl-8", name: "카림 압둘-자바", position: "C", rating: 97, salary: 9 },
    { id: "nbl-9", name: "하킴 올라주원", position: "C", rating: 95, salary: 8 },
    { id: "nbl-10", name: "스테판 커리", position: "PG", rating: 95, salary: 9 },
    { id: "nbl-11", name: "케빈 가넷", position: "PF", rating: 94, salary: 8 },
    { id: "nbl-12", name: "앨런 아이버슨", position: "PG", rating: 93, salary: 8 },
    { id: "nbl-13", name: "칼 말론", position: "PF", rating: 94, salary: 7 },
    { id: "nbl-14", name: "존 스탁턴", position: "PG", rating: 93, salary: 7 },
    { id: "nbl-15", name: "찰스 바클리", position: "PF", rating: 93, salary: 7 },
    { id: "nbl-16", name: "이세아 토마스", position: "PG", rating: 91, salary: 6 },
    { id: "nbl-17", name: "패트릭 유잉", position: "C", rating: 91, salary: 6 },
    { id: "nbl-18", name: "스카티 피펜", position: "SF", rating: 92, salary: 7 },
    { id: "nbl-19", name: "데니스 로드맨", position: "PF", rating: 88, salary: 5 },
    { id: "nbl-20", name: "레이 앨런", position: "SG", rating: 89, salary: 5 },
    { id: "nbl-21", name: "클라이드 드렉슬러", position: "SG", rating: 90, salary: 6 },
    { id: "nbl-22", name: "게리 페이턴", position: "PG", rating: 90, salary: 6 },
    { id: "nbl-23", name: "드웨인 웨이드", position: "SG", rating: 94, salary: 8 },
    { id: "nbl-24", name: "케빈 듀란트", position: "SF", rating: 95, salary: 9 },
    { id: "nbl-25", name: "빌 러셀", position: "C", rating: 96, salary: 8 },
  ],
}

// ============================
// Korea National Team Draft
// ============================
const korea: LegacyGameConfig = {
  id: "korea",
  name: "한국 국가대표팀 드래프트",
  description: "태극전사 선발전",
  category: "스포츠",
  icon: "🇰🇷",
  totalPicks: 20,
  picksPerTeam: 5,
  budget: 30,
  positions: ["FW", "MF", "DF", "GK"],
  timerSeconds: 30,
  salaryRange: { min: 1, max: 10 },
  players: [
    { id: "kr-1", name: "손흥민", position: "FW", rating: 91, salary: 10 },
    { id: "kr-2", name: "이강인", position: "MF", rating: 85, salary: 8 },
    { id: "kr-3", name: "김민재", position: "DF", rating: 87, salary: 9 },
    { id: "kr-4", name: "황희찬", position: "FW", rating: 83, salary: 7 },
    { id: "kr-5", name: "조규성", position: "FW", rating: 80, salary: 6 },
    { id: "kr-6", name: "이재성", position: "MF", rating: 82, salary: 7 },
    { id: "kr-7", name: "황인범", position: "MF", rating: 81, salary: 6 },
    { id: "kr-8", name: "정우영", position: "MF", rating: 80, salary: 5 },
    { id: "kr-9", name: "김영권", position: "DF", rating: 79, salary: 5 },
    { id: "kr-10", name: "김진수", position: "DF", rating: 78, salary: 4 },
    { id: "kr-11", name: "김승규", position: "GK", rating: 81, salary: 5 },
    { id: "kr-12", name: "조현우", position: "GK", rating: 80, salary: 5 },
    { id: "kr-13", name: "박지성 (레전드)", position: "MF", rating: 90, salary: 9 },
    { id: "kr-14", name: "차범근 (레전드)", position: "FW", rating: 89, salary: 9 },
    { id: "kr-15", name: "홍명보 (레전드)", position: "DF", rating: 88, salary: 8 },
    { id: "kr-16", name: "안정환 (레전드)", position: "FW", rating: 85, salary: 7 },
    { id: "kr-17", name: "이영표 (레전드)", position: "MF", rating: 84, salary: 6 },
    { id: "kr-18", name: "기성용", position: "MF", rating: 82, salary: 5 },
    { id: "kr-19", name: "구자철", position: "MF", rating: 80, salary: 4 },
    { id: "kr-20", name: "차두리", position: "DF", rating: 79, salary: 4 },
    { id: "kr-21", name: "백승호", position: "MF", rating: 78, salary: 3 },
    { id: "kr-22", name: "오현규", position: "FW", rating: 77, salary: 3 },
    { id: "kr-23", name: "김태환", position: "DF", rating: 77, salary: 3 },
    { id: "kr-24", name: "이기제", position: "FW", rating: 76, salary: 2 },
    { id: "kr-25", name: "송범근", position: "GK", rating: 78, salary: 3 },
  ],
}

// ============================
// Three Kingdoms Draft
// ============================
const threeKingdoms: LegacyGameConfig = {
  id: "three-kingdoms",
  name: "삼국지 드래프트",
  description: "역사 속 영웅 장수들",
  category: "역사/전략",
  icon: "⚔️",
  totalPicks: 20,
  picksPerTeam: 5,
  budget: 30,
  positions: ["무장", "지장", "궁수", "책사"],
  timerSeconds: 30,
  salaryRange: { min: 1, max: 10 },
  players: [
    { id: "tk-1", name: "관우", position: "무장", rating: 98, salary: 10 },
    { id: "tk-2", name: "여포", position: "무장", rating: 99, salary: 10 },
    { id: "tk-3", name: "제갈량", position: "책사", rating: 99, salary: 10 },
    { id: "tk-4", name: "조조", position: "지장", rating: 97, salary: 10 },
    { id: "tk-5", name: "장비", position: "무장", rating: 95, salary: 9 },
    { id: "tk-6", name: "조운", position: "무장", rating: 96, salary: 9 },
    { id: "tk-7", name: "사마의", position: "책사", rating: 97, salary: 9 },
    { id: "tk-8", name: "주유", position: "지장", rating: 95, salary: 9 },
    { id: "tk-9", name: "황충", position: "궁수", rating: 93, salary: 8 },
    { id: "tk-10", name: "마초", position: "무장", rating: 93, salary: 8 },
    { id: "tk-11", name: "하후돈", position: "무장", rating: 91, salary: 7 },
    { id: "tk-12", name: "장합", position: "무장", rating: 89, salary: 7 },
    { id: "tk-13", name: "육손", position: "지장", rating: 92, salary: 8 },
    { id: "tk-14", name: "감녕", position: "무장", rating: 88, salary: 6 },
    { id: "tk-15", name: "태사자", position: "궁수", rating: 89, salary: 7 },
    { id: "tk-16", name: "방통", position: "책사", rating: 93, salary: 8 },
    { id: "tk-17", name: "하후연", position: "궁수", rating: 87, salary: 6 },
    { id: "tk-18", name: "장료", position: "무장", rating: 90, salary: 7 },
    { id: "tk-19", name: "서서", position: "책사", rating: 88, salary: 6 },
    { id: "tk-20", name: "위연", position: "무장", rating: 88, salary: 6 },
    { id: "tk-21", name: "강유", position: "지장", rating: 87, salary: 5 },
    { id: "tk-22", name: "허저", position: "무장", rating: 86, salary: 5 },
    { id: "tk-23", name: "전위", position: "무장", rating: 87, salary: 5 },
    { id: "tk-24", name: "주창", position: "무장", rating: 82, salary: 3 },
    { id: "tk-25", name: "곽가", position: "책사", rating: 92, salary: 7 },
  ],
}

// ============================
// All Game Modes Export
// ============================
export const GAME_MODES: Record<string, LegacyGameConfig> = {
  epl,
  soccer,
  "slam-dunk": slamDunk,
  idol,
  nba,
  "nba-legend": nbaLegend,
  korea,
  "three-kingdoms": threeKingdoms,
}

export const GAME_MODE_LIST = Object.values(GAME_MODES)

// ============================
// Snake Draft Order Generator
// ============================
export function generateSnakeDraftOrder(totalPicks: number, teamCount: number = 4): number[] {
  const order: number[] = []
  const rounds = Math.ceil(totalPicks / teamCount)

  for (let round = 0; round < rounds; round++) {
    const isReverse = round % 2 === 1
    for (let team = 0; team < teamCount; team++) {
      if (order.length >= totalPicks) break
      order.push(isReverse ? teamCount - 1 - team : team)
    }
  }

  return order.slice(0, totalPicks)
}

// ============================
// Team Colors
// ============================
export const TEAM_PRESETS = [
  { id: "team-1", name: "팀 A", color: "from-slate-500 to-slate-600" },
  { id: "team-2", name: "팀 B", color: "from-zinc-500 to-zinc-600" },
  { id: "team-3", name: "팀 C", color: "from-stone-500 to-stone-600" },
  { id: "team-4", name: "팀 D", color: "from-gray-500 to-gray-600" },
]
