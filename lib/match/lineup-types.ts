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
      /** 실제 공급자 요청과 DB 저장을 연결하는 운영 증거. 캐시 조회 시 새로 만들지 않는다. */
      observation?: { id: string; requestedAt: string; fingerprint: string | null }
    }
