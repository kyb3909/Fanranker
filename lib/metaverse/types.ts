/**
 * 메타버스 공유 타입.
 */

/** Phaser 씬 init 시 전달되는 유저 식별 정보 */
export interface MetaversePlayerIdentity {
  userId: string
  nickname: string
  avatarKey?: string // 향후 스프라이트 선택 (Phase 4)
}

/** Realtime presence로 동기화되는 플레이어 상태 */
export interface RemotePlayerState {
  userId: string
  nickname: string
  x: number
  y: number
  direction: Direction
  isMoving: boolean
  updatedAt: number // epoch ms
}

export type Direction = "up" | "down" | "left" | "right"

/** 월드 채널 broadcast chat 메시지 */
export interface WorldChatMessage {
  userId: string
  nickname: string
  x: number
  y: number
  text: string
  timestamp: number
}

/** 채팅방 채널 broadcast 메시지 */
export interface RoomChatMessage {
  userId: string
  nickname: string
  text: string
  timestamp: number
}

/**
 * 사이드스크롤러 Presence 페이로드 — 월드맵 (Direction 4방향) 과 달리 2방향 facing.
 * 원격에서도 점프/킥 anim 동기 위해 action state 공유.
 */
export type SideScrollerFacing = "east" | "west"
export type SideScrollerActionState = "idle" | "walking" | "jumping" | "kicking" | "turning"

export interface SideScrollerPresence {
  userId: string
  nickname: string
  x: number
  y: number
  facing: SideScrollerFacing
  action: SideScrollerActionState
  updatedAt: number
  /** 아바타 프리셋 키 — `lib/metaverse/avatar/presets.ts` 참조. 없으면 기본 프리셋. */
  avatarKey?: string
}

/**
 * 공유 공 상태 — peer ownership. 마지막으로 찬 사람이 authority.
 * 주기적으로 (200ms) broadcast, 수신자는 최신 ts 만 받아들여 덮어씀.
 */
export interface SharedBallState {
  x: number
  y: number
  vx: number
  vy: number
  ownerId: string // 마지막 킥 유저
  ts: number
}

/** 월드 Plot (DB → 클라이언트) */
export interface WorldPlot {
  id: string
  plotCode: string
  plazaName: string
  pinX: number
  pinY: number
  widthUnits: number
  heightUnits: number
}

/** 채팅방 메타 (DB → 클라이언트) */
export interface ChatRoomMeta {
  id: string
  plotId: string
  ownerUserId: string
  signText: string
  createdAt: string
  lastActivityAt: string
}
