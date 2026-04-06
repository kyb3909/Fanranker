"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { RegionMap, type MapPin } from "@/components/stadium/region-map"
import { STADIUM_LEVELS } from "@/lib/constants/stadium-levels"

interface Props {
  regionId: string
  regionName: string
  league: string
  leagueId: string
  mapImage: string
}

interface TeamData {
  team_id: string
  team_name: string
  team_short_name: string
  city: string
  pin_x: number
  pin_y: number
  color: string
  stadium_name: string | null
  stadium: {
    level: number
    total_points: number
    fan_count: number
  }
}

function calcProgressPct(level: number, totalPoints: number): number {
  const current = STADIUM_LEVELS.find((l) => l.level === level)
  const next = STADIUM_LEVELS.find((l) => l.level === level + 1)
  if (!current || !next) return level >= 10 ? 100 : 0
  const range = next.requiredPoints - current.requiredPoints
  if (range <= 0) return 100
  return Math.min(100, ((totalPoints - current.requiredPoints) / range) * 100)
}

export function RegionMapClient({ regionName, league, leagueId, mapImage }: Props) {
  const { data } = useSWR(`/api/stadiums/map?league=${leagueId}`, fetcher, {
    revalidateOnFocus: false,
  })

  const teams: TeamData[] = data?.teams ?? []

  const pins: MapPin[] = teams.map((t) => ({
    team_id: t.team_id,
    name: t.stadium_name || t.city,
    team_name: t.team_name,
    team_short_name: t.team_short_name,
    pin_x: t.pin_x,
    pin_y: t.pin_y,
    color: t.color,
    level: t.stadium.level,
    total_points: t.stadium.total_points,
    fan_count: t.stadium.fan_count,
    progress_pct: calcProgressPct(t.stadium.level, t.stadium.total_points),
  }))

  return <RegionMap regionName={regionName} league={league} mapImage={mapImage} pins={pins} />
}
