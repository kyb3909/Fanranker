/**
 * WorldChannel — 월드맵 전용 Supabase Realtime 래퍼.
 *
 * 단일 채널 `metaverse:world` 에 대해:
 *  - Presence: 내 위치(x/y/direction/isMoving) 브로드캐스트 + 원격 유저 수신
 *  - Broadcast `chat:world`: 월드 채팅 (proximity 필터는 수신 측 Scene에서)
 *
 * 위치 업데이트는 `POSITION_THROTTLE_MS` (200ms) 간격 throttle.
 * React/Phaser 양쪽에서 사용 가능한 순수 클래스 (훅 아님).
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import { METAVERSE } from "@/lib/metaverse/constants"
import type {
  ChatRoomMeta,
  MetaversePlayerIdentity,
  RemotePlayerState,
  Direction,
  WorldChatMessage,
} from "@/lib/metaverse/types"

interface PresencePayload {
  userId: string
  nickname: string
  x: number
  y: number
  direction: Direction
  isMoving: boolean
  updatedAt: number
}

type RemoteChangeCallback = (remotePlayers: Map<string, RemotePlayerState>) => void
type ChatCallback = (msg: WorldChatMessage) => void
type RoomCreatedCallback = (room: ChatRoomMeta) => void
type RoomClosedCallback = (payload: { plotId: string }) => void

export class WorldChannel {
  private channel: RealtimeChannel | null = null
  private readonly supabase: SupabaseClient
  private readonly identity: MetaversePlayerIdentity
  private lastPublishAt = 0
  private pendingPublishTimer: ReturnType<typeof setTimeout> | null = null
  private currentState = {
    x: 0,
    y: 0,
    direction: "down" as Direction,
    isMoving: false,
  }
  private readonly remoteListeners = new Set<RemoteChangeCallback>()
  private readonly chatListeners = new Set<ChatCallback>()
  private readonly roomCreatedListeners = new Set<RoomCreatedCallback>()
  private readonly roomClosedListeners = new Set<RoomClosedCallback>()

  constructor(supabase: SupabaseClient, identity: MetaversePlayerIdentity) {
    this.supabase = supabase
    this.identity = identity
  }

  /** 초기 위치를 설정 (connect 전 호출 권장 — join 시 첫 track에 반영됨) */
  setInitialPosition(x: number, y: number) {
    this.currentState.x = x
    this.currentState.y = y
  }

  async connect(): Promise<void> {
    if (this.channel) return

    this.channel = this.supabase.channel(METAVERSE.CHANNEL_WORLD, {
      config: { presence: { key: this.identity.userId } },
    })

    this.channel.on("presence", { event: "sync" }, () => this.emitRemoteChange())
    this.channel.on("presence", { event: "join" }, () => this.emitRemoteChange())
    this.channel.on("presence", { event: "leave" }, () => this.emitRemoteChange())

    this.channel.on("broadcast", { event: "chat:world" }, ({ payload }) => {
      const msg = payload as WorldChatMessage
      for (const cb of this.chatListeners) cb(msg)
    })

    // 서버측 방 생성/닫힘 이벤트 수신 → 씬이 Signboard 동기화
    this.channel.on("broadcast", { event: "room:created" }, ({ payload }) => {
      const room = payload as ChatRoomMeta
      for (const cb of this.roomCreatedListeners) cb(room)
    })
    this.channel.on("broadcast", { event: "room:closed" }, ({ payload }) => {
      const p = payload as { plotId: string }
      for (const cb of this.roomClosedListeners) cb(p)
    })

    await new Promise<void>((resolve, reject) => {
      this.channel!.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          void this.publishPositionImmediate()
          resolve()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(err instanceof Error ? err : new Error(`world channel ${status}`))
        }
      })
    })
  }

  async disconnect(): Promise<void> {
    if (!this.channel) return
    if (this.pendingPublishTimer) {
      clearTimeout(this.pendingPublishTimer)
      this.pendingPublishTimer = null
    }
    try {
      await this.channel.untrack()
    } catch {
      /* noop */
    }
    await this.supabase.removeChannel(this.channel)
    this.channel = null
    this.remoteListeners.clear()
    this.chatListeners.clear()
    this.roomCreatedListeners.clear()
    this.roomClosedListeners.clear()
  }

  /** 내 위치 업데이트 — throttle 적용. Phaser update()에서 매 프레임 호출해도 안전. */
  publishPosition(x: number, y: number, direction: Direction, isMoving: boolean): void {
    this.currentState = { x, y, direction, isMoving }
    const now = Date.now()
    const elapsed = now - this.lastPublishAt

    if (elapsed >= METAVERSE.POSITION_THROTTLE_MS) {
      void this.publishPositionImmediate()
    } else if (!this.pendingPublishTimer) {
      this.pendingPublishTimer = setTimeout(() => {
        this.pendingPublishTimer = null
        void this.publishPositionImmediate()
      }, METAVERSE.POSITION_THROTTLE_MS - elapsed)
    }
  }

  private async publishPositionImmediate(): Promise<void> {
    if (!this.channel) return
    const payload: PresencePayload = {
      userId: this.identity.userId,
      nickname: this.identity.nickname,
      ...this.currentState,
      updatedAt: Date.now(),
    }
    try {
      await this.channel.track(payload)
      this.lastPublishAt = Date.now()
    } catch (err) {
      console.warn("[metaverse] presence track failed", err)
    }
  }

  /** 월드 채팅 브로드캐스트 */
  publishChat(text: string): void {
    if (!this.channel) return
    const msg: WorldChatMessage = {
      userId: this.identity.userId,
      nickname: this.identity.nickname,
      x: this.currentState.x,
      y: this.currentState.y,
      text,
      timestamp: Date.now(),
    }
    void this.channel.send({ type: "broadcast", event: "chat:world", payload: msg })
    // 자기 자신 메시지는 수신 이벤트로 안 들어오므로 수동 dispatch
    for (const cb of this.chatListeners) cb(msg)
  }

  onRemotePlayersChange(cb: RemoteChangeCallback): () => void {
    this.remoteListeners.add(cb)
    return () => {
      this.remoteListeners.delete(cb)
    }
  }

  onChatMessage(cb: ChatCallback): () => void {
    this.chatListeners.add(cb)
    return () => {
      this.chatListeners.delete(cb)
    }
  }

  onRoomCreated(cb: RoomCreatedCallback): () => void {
    this.roomCreatedListeners.add(cb)
    return () => {
      this.roomCreatedListeners.delete(cb)
    }
  }

  onRoomClosed(cb: RoomClosedCallback): () => void {
    this.roomClosedListeners.add(cb)
    return () => {
      this.roomClosedListeners.delete(cb)
    }
  }

  private emitRemoteChange(): void {
    if (!this.channel) return
    const state = this.channel.presenceState<PresencePayload>()
    const remote = new Map<string, RemotePlayerState>()
    for (const [key, presences] of Object.entries(state)) {
      if (key === this.identity.userId) continue
      const p = presences[0]
      if (p) {
        remote.set(p.userId, {
          userId: p.userId,
          nickname: p.nickname,
          x: p.x,
          y: p.y,
          direction: p.direction,
          isMoving: p.isMoving,
          updatedAt: p.updatedAt,
        })
      }
    }
    for (const cb of this.remoteListeners) cb(remote)
  }
}
