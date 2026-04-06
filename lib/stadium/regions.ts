export interface Region {
  id: string
  name: string
  nameEn: string
  league: string
  leagueId: string
  mapImage: string
  thumbnailImage: string
  comingSoon?: boolean
}

export const REGIONS: Region[] = [
  {
    id: "england",
    name: "잉글랜드",
    nameEn: "England",
    league: "Premier League",
    leagueId: "epl",
    mapImage: "/map/regions/england-map.webp",
    thumbnailImage: "/map/regions/england-thumb.webp",
  },
  {
    id: "spain",
    name: "스페인",
    nameEn: "Spain",
    league: "La Liga",
    leagueId: "laliga",
    mapImage: "",
    thumbnailImage: "",
    comingSoon: true,
  },
  {
    id: "italy",
    name: "이탈리아",
    nameEn: "Italy",
    league: "Serie A",
    leagueId: "seriea",
    mapImage: "",
    thumbnailImage: "",
    comingSoon: true,
  },
  {
    id: "germany",
    name: "독일",
    nameEn: "Germany",
    league: "Bundesliga",
    leagueId: "bundesliga",
    mapImage: "",
    thumbnailImage: "",
    comingSoon: true,
  },
  {
    id: "france",
    name: "프랑스",
    nameEn: "France",
    league: "Ligue 1",
    leagueId: "ligue1",
    mapImage: "",
    thumbnailImage: "",
    comingSoon: true,
  },
  {
    id: "korea",
    name: "대한민국",
    nameEn: "Korea",
    league: "K League",
    leagueId: "kl1",
    mapImage: "",
    thumbnailImage: "",
    comingSoon: true,
  },
]

export function getRegion(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id)
}
