/**
 * SideScrollerChannel — 사이드스크롤러 전용 Supabase Realtime 래퍼.
 *
 * 월드맵의 `WorldChannel` 과 같은 패턴이지만 사이드스크롤러에 특화된 payload 사용:
 *  - Presence: x/y/facing(east|west)/action(idle|walking|jumping|kicking|headbutt)
 *  - Broadcast `chat`: 방 전체 채팅 (proximity 필터 없음 — 공간이 좁음)
 *  - Broadcast `ball:state`: 공 위치·속도 + 마지막 킥 유저. peer ownership, 200ms throttle.
 *  - Broadcast `headbutt:hit`: 박치기 타겟 knock-back 알림 (타겟 측 수신해 반응).
 *
 * 채널 이름은 `METAVERSE.CHANNEL_SIDESCROLL` (글로벌 방). 추후 방별 분리 시 이름 파라미터화.
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import { METAVERSE } from "@/lib/metaverse/constants"
import type {
  MetaversePlayerIdentity,
  RoomChatMessage,
  SharedBallState,
  SideScrollerActionState,
  SideScrollerFacing,
  SideScrollerPresence,
} from "@/lib/metaverse/types"

type RemoteChangeCb = (remote: Map<string, SideScrollerPresence>) => void
type ChatCb = (msg: RoomChatMessage) => void
type BallStateCb = (state: SharedBallState) => void

const BALL_SYNC_THROTTLE_MS = 200

export class SideScrollerChannel {
  private channel: RealtimeChannel | null = null
  private readonly supabase: SupabaseClient
  private readonly identity: MetaversePlayerIdentity
  private lastPresenceAt = 0
  private pendingPresenceTimer: ReturnType<typeof setTimeout> | null = null
  private currentPresence = {
    x: 0,
    y: 0,
    facing: "east" as SideScrollerFacing,
    action: "idle" as SideScrollerActionState,
  }
  private lastBallPublishAt = 0
  private readonly remoteListeners = new Set<RemoteChangeCb>()
  private readonly chatListeners = new Set<ChatCb>()
  private readonly ballListeners = new Set<BallStateCb>()

  constructor(supabase: SupabaseClient, identity: MetaversePlayerIdentity) {
    this.supabase = supabase
    this.identity = identity
  }

  /** 초기 위치 세팅. connect 전에 호출 권장. */
  setInitialPosition(x: number, y: number) {
    this.currentPresence.x = x
    this.currentPresence.y = y
  }

  async connect(): Promise<void> {
    if (this.channel) return

    this.channel = this.supabase.channel(METAVERSE.CHANNEL_SIDESCROLL, {
      config: { presence: { key: this.identity.userId } },
    })

    this.channel.on("presence", { event: "sync" }, () => this.emitRemoteChange())
    this.channel.on("presence", { event: "join" }, () => this.emitRemoteChange())
    this.channel.on("presence", { event: "leave" }, () => this.emitRemoteChange())

    this.channel.on("broadcast", { event: "chat" }, ({ payload }) => {
      const msg = payload as RoomChatMessage
      for (const cb of this.chatListeners) cb(msg)
    })

    this.channel.on("broadcast", { event: "ball:state" }, ({ payload }) => {
      const state = payload as SharedBallState
      for (const cb of this.ballListeners) cb(state)
    })

    await new Promise<void>((resolve, reject) => {
      this.channel!.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          void this.publishPresenceImmediate()
          resolve()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(err instanceof Error ? err : new Error(`sidescroll channel ${status}`))
        }
      })
    })
  }

  async disconnect(): Promise<void> {
    if (!this.channel) return
    if (this.pendingPresenceTimer) {
      clearTimeout(this.pendingPresenceTimer)
      this.pendingPresenceTimer = null
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
    this.ballListeners.clear()
  }

  publishPresence(
    x: number,
    y: number,
    facing: SideScrollerFacing,
    action: SideScrollerActionState
  ): void {
    this.currentPresence = { x, y, facing, action }
    const now = Date.now()
    const elapsed = now - this.lastPresenceAt
    if (elapsed >= METAVERSE.POSITION_THROTTLE_MS) {
      void this.publishPresenceImmediate()
    } else if (!this.pendingPresenceTimer) {
      this.pendingPresenceTimer = setTimeout(() => {
        this.pendingPresenceTimer = null
        void this.publishPresenceImmediate()
      }, METAVERSE.POSITION_THROTTLE_MS - elapsed)
    }
  }

  private async publishPresenceImmediate(): Promise<void> {
    if (!this.channel) return
    const payload: SideScrollerPresence = {
      userId: this.identity.userId,
      nickname: this.identity.nickname,
      ...this.currentPresence,
      updatedAt: Date.now(),
      avatarKey: this.identity.avatarKey,
    }
    try {
      await this.channel.track(payload)
      this.lastPresenceAt = Date.now()
    } catch (err) {
      console.warn("[sidescroll] presence track failed", err)
    }
  }

  publishChat(text: string): void {
    if (!this.channel) return
    const msg: RoomChatMessage = {
      userId: this.identity.userId,
      nickname: this.identity.nickname,
      text,
      timestamp: Date.now(),
    }
    void this.channel.send({ type: "broadcast", event: "chat", payload: msg })
    // self dispatch
    for (const cb of this.chatListeners) cb(msg)
  }

  /** 공 상태 broadcast — 로컬 200ms throttle. vx/vy 가 0 에 가까우면 "정지" 신호 1회만. */
  publishBallState(state: Omit<SharedBallState, "ts" | "ownerId">, force = false): void {
    if (!this.channel) return
    const now = Date.now()
    if (!force && now - this.lastBallPublishAt < BALL_SYNC_THROTTLE_MS) return
    this.lastBallPublishAt = now
    const payload: SharedBallState = {
      ...state,
      ownerId: this.identity.userId,
      ts: now,
    }
    void this.channel.send({ type: "broadcast", event: "ball:state", payload })
  }

  onRemoteChange(cb: RemoteChangeCb): () => void {
    this.remoteListeners.add(cb)
    return () => {
      this.remoteListeners.delete(cb)
    }
  }

  onChatMessage(cb: ChatCb): () => void {
    this.chatListeners.add(cb)
    return () => {
      this.chatListeners.delete(cb)
    }
  }

  onBallState(cb: BallStateCb): () => void {
    this.ballListeners.add(cb)
    return () => {
      this.ballListeners.delete(cb)
    }
  }

  getSelfUserId(): string {
    return this.identity.userId
  }

  private emitRemoteChange(): void {
    if (!this.channel) return
    const state = this.channel.presenceState<SideScrollerPresence>()
    const remote = new Map<string, SideScrollerPresence>()
    for (const [key, presences] of Object.entries(state)) {
      if (key === this.identity.userId) continue
      const p = presences[0]
      if (p) remote.set(p.userId, p)
    }
    for (const cb of this.remoteListeners) cb(remote)
  }
}
