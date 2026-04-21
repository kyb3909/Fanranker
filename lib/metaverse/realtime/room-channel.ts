/**
 * RoomChannel — 채팅방(Plot) 단위 Supabase Realtime 래퍼.
 *
 * 월드 채널과 달리 위치 동기화는 하지 않음. 채팅 broadcast 전용.
 * Presence는 방 내 접속자 수 표시 용도.
 *
 * 채널명: `metaverse:chat:{roomId}`
 * Broadcast event: "chat:room" (payload: RoomChatMessage)
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import { METAVERSE } from "@/lib/metaverse/constants"
import type { MetaversePlayerIdentity, RoomChatMessage } from "@/lib/metaverse/types"

interface RoomPresencePayload {
  userId: string
  nickname: string
}

type PresenceChangeCallback = (count: number) => void
type ChatCallback = (msg: RoomChatMessage) => void

export class RoomChannel {
  private channel: RealtimeChannel | null = null
  private readonly supabase: SupabaseClient
  private readonly identity: MetaversePlayerIdentity
  readonly roomId: string
  private readonly presenceListeners = new Set<PresenceChangeCallback>()
  private readonly chatListeners = new Set<ChatCallback>()

  constructor(supabase: SupabaseClient, identity: MetaversePlayerIdentity, roomId: string) {
    this.supabase = supabase
    this.identity = identity
    this.roomId = roomId
  }

  async connect(): Promise<void> {
    if (this.channel) return

    const name = `${METAVERSE.CHANNEL_CHAT_ROOM_PREFIX}${this.roomId}`
    this.channel = this.supabase.channel(name, {
      config: { presence: { key: this.identity.userId } },
    })

    this.channel.on("presence", { event: "sync" }, () => this.emitPresenceCount())
    this.channel.on("presence", { event: "join" }, () => this.emitPresenceCount())
    this.channel.on("presence", { event: "leave" }, () => this.emitPresenceCount())

    this.channel.on("broadcast", { event: "chat:room" }, ({ payload }) => {
      const msg = payload as RoomChatMessage
      for (const cb of this.chatListeners) cb(msg)
    })

    await new Promise<void>((resolve, reject) => {
      this.channel!.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          const payload: RoomPresencePayload = {
            userId: this.identity.userId,
            nickname: this.identity.nickname,
          }
          void this.channel!.track(payload)
          resolve()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(err instanceof Error ? err : new Error(`room channel ${status}`))
        }
      })
    })
  }

  async disconnect(): Promise<void> {
    if (!this.channel) return
    try {
      await this.channel.untrack()
    } catch {
      /* noop */
    }
    await this.supabase.removeChannel(this.channel)
    this.channel = null
    this.presenceListeners.clear()
    this.chatListeners.clear()
  }

  publishChat(text: string): void {
    if (!this.channel) return
    const msg: RoomChatMessage = {
      userId: this.identity.userId,
      nickname: this.identity.nickname,
      text,
      timestamp: Date.now(),
    }
    void this.channel.send({ type: "broadcast", event: "chat:room", payload: msg })
    for (const cb of this.chatListeners) cb(msg) // self dispatch
  }

  onChatMessage(cb: ChatCallback): () => void {
    this.chatListeners.add(cb)
    return () => {
      this.chatListeners.delete(cb)
    }
  }

  onPresenceChange(cb: PresenceChangeCallback): () => void {
    this.presenceListeners.add(cb)
    return () => {
      this.presenceListeners.delete(cb)
    }
  }

  private emitPresenceCount() {
    if (!this.channel) return
    const state = this.channel.presenceState<RoomPresencePayload>()
    const count = Object.keys(state).length
    for (const cb of this.presenceListeners) cb(count)
  }
}
