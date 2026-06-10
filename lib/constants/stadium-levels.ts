/**
 * 경기장 레벨 정의 (클라이언트용 캐시)
 * DB stadium_level_thresholds 테이블과 동기화
 */

interface StadiumLevel {
  level: number
  requiredPoints: number
  nameKo: string
  nameEn: string
  description: string
  emoji: string
}

export const STADIUM_LEVELS: StadiumLevel[] = [
  {
    level: 1,
    requiredPoints: 0,
    nameKo: "빈 땅",
    nameEn: "Empty lot",
    description: "아무것도 없는 빈 땅",
    emoji: "🌱",
  },
  {
    level: 2,
    requiredPoints: 1000,
    nameKo: "공터",
    nameEn: "Open field",
    description: "잔디가 깔린 공터",
    emoji: "🌿",
  },
  {
    level: 3,
    requiredPoints: 5000,
    nameKo: "동네 운동장",
    nameEn: "Neighborhood field",
    description: "동네 아이들이 뛰어노는 운동장",
    emoji: "🏗️",
  },
  {
    level: 4,
    requiredPoints: 15000,
    nameKo: "소규모 구장",
    nameEn: "Small stadium",
    description: "벤치와 그물이 있는 소규모 구장",
    emoji: "⚽",
  },
  {
    level: 5,
    requiredPoints: 40000,
    nameKo: "지역 경기장",
    nameEn: "Regional stadium",
    description: "관중석이 생긴 지역 경기장",
    emoji: "🏟️",
  },
  {
    level: 6,
    requiredPoints: 100000,
    nameKo: "프로 구장",
    nameEn: "Pro stadium",
    description: "전광판이 달린 프로 구장",
    emoji: "📺",
  },
  {
    level: 7,
    requiredPoints: 250000,
    nameKo: "대형 경기장",
    nameEn: "Large stadium",
    description: "대형 스크린과 조명이 있는 경기장",
    emoji: "💡",
  },
  {
    level: 8,
    requiredPoints: 500000,
    nameKo: "국가대표 경기장",
    nameEn: "National stadium",
    description: "국가대표급 시설의 경기장",
    emoji: "🇰🇷",
  },
  {
    level: 9,
    requiredPoints: 1000000,
    nameKo: "명문 구장",
    nameEn: "Prestigious stadium",
    description: "역사와 전통의 명문 구장",
    emoji: "👑",
  },
  {
    level: 10,
    requiredPoints: 2500000,
    nameKo: "월드클래스 스타디움",
    nameEn: "World-class stadium",
    description: "세계 최고 수준의 경기장",
    emoji: "🏆",
  },
]

function getStadiumLevel(level: number): StadiumLevel {
  return STADIUM_LEVELS.find((l) => l.level === level) ?? STADIUM_LEVELS[0]
}

function getNextLevelThreshold(
  currentPoints: number
): { nextLevel: number; requiredPoints: number } | null {
  for (const level of STADIUM_LEVELS) {
    if (level.requiredPoints > currentPoints) {
      return { nextLevel: level.level, requiredPoints: level.requiredPoints }
    }
  }
  return null // 최대 레벨 도달
}
