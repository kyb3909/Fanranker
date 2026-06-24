/**
 * IndoorPresenceChannel — Indoor map(=하이버리 등) 위치 동기화 전용 Supabase Realtime 래퍼.
 *
 * SideScrollerChannel 단순화 사본 — chat·ball·headbutt 제외, presence(x/y/facing/action) 만.
 * 채팅은 별도 RoomChannel (HighburyStage) 가 처리하므로 여기선 위치만.
 *
 * 채널 이름은 constructor 인자로 받음 (constants.CHANNEL_HIGHBURY 등). 룸 ID 별 분리 가능.
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import { METAVERSE } from "@/lib/metaverse/constants"
import type { MetaversePlayerIdentity } from "@/lib/metaverse/types"

export type IndoorActionState = "idle" | "walk" | "run" | "jump" | "fall" | "attack"
export type IndoorFacing = "east" | "west"

export interface IndoorPresence {
  userId: string
  nickname: string
  x: number
  y: number
  facing: IndoorFacing
  action: IndoorActionState
  updatedAt: number
}

type RemoteChangeCb = (remote: Map<string, IndoorPresence>) => void

export class IndoorPresenceChannel {
  private channel: RealtimeChannel | null = null
  private readonly supabase: SupabaseClient
  private readonly identity: MetaversePlayerIdentity
  private readonly channelName: string
  private lastPresenceAt = 0
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private currentPresence = {
    x: 0,
    y: 0,
    facing: "east" as IndoorFacing,
    action: "idle" as IndoorActionState,
  }
  private readonly listeners = new Set<RemoteChangeCb>()

  constructor(supabase: SupabaseClient, identity: MetaversePlayerIdentity, channelName: string) {
    this.supabase = supabase
    this.identity = identity
    this.channelName = channelName
  }

  /** 초기 위치 세팅. connect 전에 호출 권장. */
  setInitialPosition(x: number, y: number) {
    this.currentPresence.x = x
    this.currentPresence.y = y
  }

  async connect(): Promise<void> {
    if (this.channel) return
    this.channel = this.supabase.channel(this.channelName, {
      config: { private: true, presence: { key: this.identity.userId } },
    })
    this.channel.on("presence", { event: "sync" }, () => this.emitRemote())
    this.channel.on("presence", { event: "join" }, () => this.emitRemote())
    this.channel.on("presence", { event: "leave" }, () => this.emitRemote())
    await new Promise<void>((resolve, reject) => {
      this.channel!.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          void this.publishImmediate()
          resolve()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(err instanceof Error ? err : new Error(`indoor presence ${status}`))
        }
      })
    })
  }

  async disconnect(): Promise<void> {
    if (!this.channel) return
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
    try {
      await this.channel.untrack()
    } catch {
      /* noop */
    }
    await this.supabase.removeChannel(this.channel)
    this.channel = null
    this.listeners.clear()
  }

  publishPresence(x: number, y: number, facing: IndoorFacing, action: IndoorActionState): void {
    this.currentPresence = { x, y, facing, action }
    const now = Date.now()
    const elapsed = now - this.lastPresenceAt
    if (elapsed >= METAVERSE.POSITION_THROTTLE_MS) {
      void this.publishImmediate()
    } else if (!this.pendingTimer) {
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null
        void this.publishImmediate()
      }, METAVERSE.POSITION_THROTTLE_MS - elapsed)
    }
  }

  private async publishImmediate(): Promise<void> {
    if (!this.channel) return
    const payload: IndoorPresence = {
      userId: this.identity.userId,
      nickname: this.identity.nickname,
      ...this.currentPresence,
      updatedAt: Date.now(),
    }
    try {
      await this.channel.track(payload)
      this.lastPresenceAt = Date.now()
    } catch (err) {
      console.warn("[indoor-presence] track failed", err)
    }
  }

  onRemoteChange(cb: RemoteChangeCb): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  getSelfUserId(): string {
    return this.identity.userId
  }

  private emitRemote(): void {
    if (!this.channel) return
    const state = this.channel.presenceState<IndoorPresence>()
    const remote = new Map<string, IndoorPresence>()
    for (const [userId, payloads] of Object.entries(state)) {
      if (userId === this.identity.userId) continue
      const latest = (payloads as IndoorPresence[])[0]
      if (latest) remote.set(userId, latest)
    }
    for (const cb of this.listeners) cb(remote)
  }
}
