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
