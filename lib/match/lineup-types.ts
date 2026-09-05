/** Provider-neutral display contract. LFA player IDs survive localization. */
export interface DisplayPlayer {
  id?: string
  label: string
  number: number | null
  roman: string | null
  goals?: number
  goalMinutes?: string[]
  ownGoals?: number
  red?: boolean
  subOut?: string | null
  subIn?: string | null
  subPartner?: string
}
export interface DisplaySide {
  teamLabel: string
  formation: string | null
  starters: DisplayPlayer[]
  bench: DisplayPlayer[]
}
export type LineupResponse =
  | { status: "none" }
  | { status: "pending"; kickoff: string }
  | {
      status: "ready"
      kickoff: string
      home: DisplaySide
      away: DisplaySide
      fetchedAt: string
      projected?: boolean
      source?: "lfa"
      matchId?: string
    }
