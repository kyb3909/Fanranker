/**
 * 리그 → 국가 지도 매핑
 * pin 좌표는 각 국가 지도 이미지 기준 % (0~100)
 */

interface MapConfig {
  country: string
  countryName: string
  mapImage: string
}

const LEAGUE_MAP_CONFIG: Record<string, MapConfig> = {
  // 한국 리그 (공용 지도)
  kbo: { country: "KR", countryName: "대한민국", mapImage: "/maps/korea.png" },
  kleague1: { country: "KR", countryName: "대한민국", mapImage: "/maps/korea.png" },
  kleague2: { country: "KR", countryName: "대한민국", mapImage: "/maps/korea.png" },
  kbl: { country: "KR", countryName: "대한민국", mapImage: "/maps/korea.png" },
  wkbl: { country: "KR", countryName: "대한민국", mapImage: "/maps/korea.png" },
  kovo_men: { country: "KR", countryName: "대한민국", mapImage: "/maps/korea.png" },
  kovo_women: { country: "KR", countryName: "대한민국", mapImage: "/maps/korea.png" },

  // 해외 리그
  epl: { country: "GB", countryName: "잉글랜드", mapImage: "/maps/england.png" },
  laliga: { country: "ES", countryName: "스페인", mapImage: "/maps/spain.png" },
  seriea: { country: "IT", countryName: "이탈리아", mapImage: "/maps/italy.png" },
  ligue1: { country: "FR", countryName: "프랑스", mapImage: "/maps/france.png" },
  bundesliga: { country: "DE", countryName: "독일", mapImage: "/maps/germany.png" },
  mlb: { country: "US", countryName: "미국", mapImage: "/maps/usa.png" },
  nba: { country: "US", countryName: "미국", mapImage: "/maps/usa.png" },
  npb: { country: "JP", countryName: "일본", mapImage: "/maps/japan.png" },
}

export function getMapConfig(leagueId: string): MapConfig | null {
  return LEAGUE_MAP_CONFIG[leagueId] ?? null
}
