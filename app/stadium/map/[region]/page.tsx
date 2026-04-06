import { notFound } from "next/navigation"
import { getRegion } from "@/lib/stadium/regions"
import { RegionMapClient } from "./client"

interface Props {
  params: Promise<{ region: string }>
}

export async function generateMetadata({ params }: Props) {
  const { region: regionId } = await params
  const region = getRegion(regionId)
  if (!region) return { title: "Not Found" }

  return {
    title: `${region.name} — Stadium Map`,
    description: `${region.league} 경기장을 탐험하세요`,
  }
}

export default async function RegionMapPage({ params }: Props) {
  const { region: regionId } = await params
  const region = getRegion(regionId)
  if (!region || region.comingSoon) return notFound()

  return (
    <RegionMapClient
      regionId={region.id}
      regionName={region.nameEn}
      league={region.league}
      leagueId={region.leagueId}
      mapImage={region.mapImage}
    />
  )
}
