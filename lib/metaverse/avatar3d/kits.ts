import { ADDITIONAL_KIT_CATALOG } from "./club-kit-collections"

export type KitRarity = "starter" | "common" | "rare" | "elite"
export type KitSlot = "home" | "away" | "third" | "retro"
export type KitPattern =
  | "plain"
  | "chevron"
  | "vertical-stripes"
  | "center-stripe"
  | "split"
  | "hoops"
  | "vertical-gradient"
  | "tonal-geometric"
  | "flow-streak"
  | "tonal-texture"
export type KitCollarStyle = "v" | "crew" | "polo"
export type KitDesignProfile = "classic" | "contrast-raglan"
export type ClubKey =
  | "arsenal"
  | "chelsea"
  | "manchester-united"
  | "liverpool"
  | "manchester-city"
  | "tottenham"
  | "real-madrid"
  | "barcelona"
  | "atletico-madrid"
  | "bayern-munich"
  | "psg"
  | "ac-milan"
  | "juventus"
  | "inter-milan"
  | "roma"
  | "napoli"
  | "dortmund"
  | "leverkusen"

export type ClubDefinition = {
  clubKey: ClubKey
  referenceName: string
  storeLabel: string
}

export const CLUB_ROADMAP: readonly ClubDefinition[] = [
  { clubKey: "arsenal", referenceName: "아스날", storeLabel: "North London Red" },
  { clubKey: "chelsea", referenceName: "첼시", storeLabel: "West London Blue" },
  {
    clubKey: "manchester-united",
    referenceName: "맨체스터 유나이티드",
    storeLabel: "Manchester Red",
  },
  { clubKey: "liverpool", referenceName: "리버풀", storeLabel: "Mersey Red" },
  { clubKey: "manchester-city", referenceName: "맨체스터 시티", storeLabel: "Manchester Sky" },
  { clubKey: "tottenham", referenceName: "토트넘", storeLabel: "North London Lily" },
  { clubKey: "real-madrid", referenceName: "레알 마드리드", storeLabel: "Madrid White" },
  { clubKey: "barcelona", referenceName: "바르셀로나", storeLabel: "Catalan Stripe" },
  { clubKey: "atletico-madrid", referenceName: "아틀레티코 마드리드", storeLabel: "Madrid Stripe" },
  { clubKey: "bayern-munich", referenceName: "바이에른 뮌헨", storeLabel: "Bavarian Red" },
  { clubKey: "psg", referenceName: "PSG", storeLabel: "Paris Navy" },
  { clubKey: "ac-milan", referenceName: "AC 밀란", storeLabel: "Milan Red Black" },
  { clubKey: "juventus", referenceName: "유벤투스", storeLabel: "Turin Black White" },
  { clubKey: "inter-milan", referenceName: "인테르", storeLabel: "Milan Blue Black" },
  { clubKey: "roma", referenceName: "로마", storeLabel: "Rome Wine" },
  { clubKey: "napoli", referenceName: "나폴리", storeLabel: "Naples Sky" },
  { clubKey: "dortmund", referenceName: "도르트문트", storeLabel: "Ruhr Yellow" },
  { clubKey: "leverkusen", referenceName: "레버쿠젠", storeLabel: "Rhine Red Black" },
] as const

export type KitPalette = {
  primary: string
  secondary: string
  dark: string
  accent: string
  shorts: string
  socks: string
  boots: string
  sole: string
}

export type KitSponsorStyle = "serif-italic" | "sans" | "wide"

// Shirt-front sponsor mark. Operator call (2026-08-29): use the real sponsor
// names fans recognize. When `logo` names a file in
// scripts/avatar3d/sponsor-logos/ the generator prints it as a single-color
// silhouette (like real kit sponsor prints); otherwise `text` is rendered in a
// generic typeface. Crests and club badges stay out either way.
export type KitSponsor = {
  text: string
  style?: KitSponsorStyle
  color?: string
  logo?: string
}

export type KitItem = {
  mode: "palette-v1"
  clubKey: ClubKey
  slot: KitSlot
  kitKey: string
  revision: number
  name: string
  collection: string
  priceGold: number
  rarity: KitRarity
  pattern?: KitPattern
  collar?: KitCollarStyle
  design?: KitDesignProfile
  sponsor?: KitSponsor
  palette: KitPalette
}

export const KIT_MATERIAL_SLOTS: Record<keyof KitPalette, string> = {
  primary: "KIT_PRIMARY",
  secondary: "KIT_SECONDARY",
  dark: "KIT_DARK",
  accent: "KIT_ACCENT",
  shorts: "KIT_SHORTS",
  socks: "KIT_SOCKS",
  boots: "KIT_BOOTS",
  sole: "KIT_SOLE",
}

export const DEFAULT_KIT_KEY = "red-horizon-home"
export const INITIAL_KIT_BALANCE = 2_400

const ORIGINAL_KIT_CATALOG: readonly KitItem[] = [
  {
    mode: "palette-v1",
    clubKey: "arsenal",
    slot: "home",
    kitKey: DEFAULT_KIT_KEY,
    revision: 1,
    name: "Red Horizon 26",
    collection: "26/27 HOME INSPIRED",
    priceGold: 0,
    rarity: "starter",
    pattern: "plain",
    collar: "crew",
    design: "contrast-raglan",
    palette: {
      primary: "#C8102E",
      secondary: "#F7F3EA",
      dark: "#8A0E24",
      accent: "#7A1734",
      shorts: "#F7F3EA",
      socks: "#C8102E",
      boots: "#151923",
      sole: "#D6D9DE",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "arsenal",
    slot: "away",
    kitKey: "ivory-orbit-away",
    revision: 1,
    name: "Banana Signal 26",
    collection: "26/27 AWAY INSPIRED",
    priceGold: 500,
    rarity: "common",
    pattern: "chevron",
    collar: "crew",
    design: "contrast-raglan",
    palette: {
      primary: "#162A5A",
      secondary: "#162A5A",
      dark: "#D32135",
      accent: "#F4D925",
      shorts: "#162A5A",
      socks: "#162A5A",
      boots: "#11182A",
      sole: "#F4D925",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "arsenal",
    slot: "away",
    kitKey: "signal-night-third",
    revision: 1,
    name: "Noir Cannon",
    collection: "22/23 AWAY INSPIRED",
    priceGold: 900,
    rarity: "elite",
    palette: {
      primary: "#11100F",
      secondary: "#11100F",
      dark: "#C9A44D",
      accent: "#B98B36",
      shorts: "#11100F",
      socks: "#11100F",
      boots: "#050505",
      sole: "#C9A44D",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "arsenal",
    slot: "away",
    kitKey: "cobalt-current",
    revision: 1,
    name: "Aqua Split",
    collection: "11/12 AWAY INSPIRED",
    priceGold: 600,
    rarity: "common",
    palette: {
      primary: "#22A7B8",
      secondary: "#162B63",
      dark: "#0D1836",
      accent: "#D31D38",
      shorts: "#162B63",
      socks: "#22A7B8",
      boots: "#0D1836",
      sole: "#E9E3D3",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "arsenal",
    slot: "retro",
    kitKey: "sand-relay",
    revision: 1,
    name: "Golden Navy",
    collection: "01/02 AWAY INSPIRED",
    priceGold: 750,
    rarity: "rare",
    palette: {
      primary: "#C5A35D",
      secondary: "#17284C",
      dark: "#0B1732",
      accent: "#A3112B",
      shorts: "#17284C",
      socks: "#C5A35D",
      boots: "#0B1732",
      sole: "#EEE6D5",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "arsenal",
    slot: "retro",
    kitKey: "violet-pulse",
    revision: 1,
    name: "Highbury Wine",
    collection: "05/06 HOME INSPIRED",
    priceGold: 800,
    rarity: "rare",
    palette: {
      primary: "#6D1731",
      secondary: "#6D1731",
      dark: "#C1A15A",
      accent: "#E8D7B5",
      shorts: "#F1E9DC",
      socks: "#6D1731",
      boots: "#26131B",
      sole: "#D5C7AE",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "arsenal",
    slot: "retro",
    kitKey: "classic-yellow-navy",
    revision: 1,
    name: "Classic Yellow",
    collection: "70s AWAY INSPIRED",
    priceGold: 650,
    rarity: "rare",
    palette: {
      primary: "#F2CF22",
      secondary: "#18315D",
      dark: "#0D1D3C",
      accent: "#C91F36",
      shorts: "#18315D",
      socks: "#F2CF22",
      boots: "#111827",
      sole: "#E6E0D2",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "arsenal",
    slot: "retro",
    kitKey: "royal-violet-third",
    revision: 1,
    name: "Royal Violet",
    collection: "12/13 THIRD INSPIRED",
    priceGold: 850,
    rarity: "elite",
    palette: {
      primary: "#5B337D",
      secondary: "#16131D",
      dark: "#0A0910",
      accent: "#D13A48",
      shorts: "#16131D",
      socks: "#5B337D",
      boots: "#0A0910",
      sole: "#D13A48",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "chelsea",
    slot: "home",
    kitKey: "west-london-blue-26-home",
    revision: 1,
    name: "Lion Blue 26",
    collection: "26/27 HOME INSPIRED",
    priceGold: 0,
    rarity: "starter",
    palette: {
      primary: "#034694",
      secondary: "#034694",
      dark: "#F4C66D",
      accent: "#D7A94B",
      shorts: "#034694",
      socks: "#F4F0E8",
      boots: "#0B1730",
      sole: "#D7A94B",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "chelsea",
    slot: "away",
    kitKey: "west-london-black-26-away",
    revision: 1,
    name: "Midwest Night 26",
    collection: "26/27 AWAY INSPIRED",
    priceGold: 550,
    rarity: "common",
    palette: {
      primary: "#111214",
      secondary: "#111214",
      dark: "#D6A94A",
      accent: "#F0C55A",
      shorts: "#111214",
      socks: "#111214",
      boots: "#050608",
      sole: "#D6A94A",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "chelsea",
    slot: "retro",
    kitKey: "west-london-yellow-retro",
    revision: 1,
    name: "Electric Yellow",
    collection: "YELLOW AWAY HERITAGE",
    priceGold: 700,
    rarity: "rare",
    palette: {
      primary: "#F3DB19",
      secondary: "#F3DB19",
      dark: "#111214",
      accent: "#034694",
      shorts: "#111214",
      socks: "#F3DB19",
      boots: "#071017",
      sole: "#F3DB19",
    },
  },
  {
    mode: "palette-v1",
    clubKey: "chelsea",
    slot: "retro",
    kitKey: "west-london-gallery-retro",
    revision: 1,
    name: "Gallery Stripe",
    collection: "70s AWAY HERITAGE",
    priceGold: 800,
    rarity: "elite",
    palette: {
      primary: "#F4F1E9",
      secondary: "#F4F1E9",
      dark: "#1D5E43",
      accent: "#B51F32",
      shorts: "#F4F1E9",
      socks: "#1D5E43",
      boots: "#151719",
      sole: "#B51F32",
    },
  },
] as const

export const CLUB_SPONSORS: Record<ClubKey, KitSponsor> = {
  arsenal: { text: "Fly Emirates", style: "serif-italic", logo: "fly-emirates.svg" },
  chelsea: { text: "SAMSUNG", style: "wide", logo: "samsung.svg" },
  "manchester-united": { text: "Snapdragon", style: "sans", logo: "snapdragon.svg" },
  liverpool: { text: "Standard Chartered", style: "sans", logo: "standard-chartered.svg" },
  "manchester-city": { text: "ETIHAD AIRWAYS", style: "wide", logo: "etihad.svg" },
  tottenham: { text: "AIA", style: "wide", logo: "aia.svg" },
  "real-madrid": { text: "Fly Emirates", style: "serif-italic", logo: "fly-emirates.svg" },
  barcelona: { text: "Spotify", style: "sans", logo: "spotify.svg" },
  // 줄무늬(빨강+크림) 위라 자동 색이 묻힘 — 실물처럼 네이비로 고정
  "atletico-madrid": {
    text: "Riyadh Air",
    style: "sans",
    logo: "riyadh-air.svg",
    color: "#172B52",
  },
  "bayern-munich": { text: "Telekom", style: "sans", logo: "telekom.svg" },
  psg: { text: "QATAR AIRWAYS", style: "wide", logo: "qatar-airways.svg" },
  "ac-milan": { text: "Fly Emirates", style: "serif-italic", logo: "fly-emirates.svg" },
  juventus: { text: "Jeep", style: "wide", logo: "jeep.svg" },
  "inter-milan": { text: "PIRELLI", style: "wide", logo: "pirelli.svg" },
  roma: { text: "Riyadh Season", style: "sans" },
  napoli: { text: "MSC", style: "wide" },
  dortmund: { text: "EVONIK", style: "sans", logo: "evonik.svg" },
  leverkusen: { text: "Barmenia", style: "sans" },
}

// 운영 노출 대상 (2026-08-29 운영자 지시: 일단 빅6 + 레알·바르사·아틀레티코·
// 뮌헨·PSG·밀란·인테르·유벤투스, 그리고 **올해 홈 유니폼 1벌씩만**).
// 정의는 club-kit-collections 에 그대로 있으니 여기 목록에 clubKey 를 넣거나
// 아래 slot 필터를 풀면 복구된다 — 바꾼 뒤 pnpm avatar:kits 재실행.
const ACTIVE_CLUBS: ReadonlySet<ClubKey> = new Set([
  "arsenal",
  "chelsea",
  "manchester-united",
  "liverpool",
  "manchester-city",
  "tottenham",
  "real-madrid",
  "barcelona",
  "atletico-madrid",
  "bayern-munich",
  "psg",
  "ac-milan",
  "inter-milan",
  "juventus",
])

export const KIT_CATALOG: readonly KitItem[] = [...ORIGINAL_KIT_CATALOG, ...ADDITIONAL_KIT_CATALOG]
  .filter((kit) => ACTIVE_CLUBS.has(kit.clubKey) && kit.slot === "home")
  .map((kit) => (kit.sponsor ? kit : { ...kit, sponsor: CLUB_SPONSORS[kit.clubKey] }))

export const KIT_BY_KEY = new Map(KIT_CATALOG.map((kit) => [kit.kitKey, kit]))

export const AVAILABLE_CLUBS = CLUB_ROADMAP.filter((club) =>
  KIT_CATALOG.some((kit) => kit.clubKey === club.clubKey)
)

export function getKitsForClub(clubKey: ClubKey): readonly KitItem[] {
  return KIT_CATALOG.filter((kit) => kit.clubKey === clubKey)
}

export function getKit(kitKey: string): KitItem {
  const kit = KIT_BY_KEY.get(kitKey)
  if (!kit) throw new Error(`Unknown avatar kit: ${kitKey}`)
  return kit
}
