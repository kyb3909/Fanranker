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

/** 무변화 시 presence 재발행 간격 — 연결 생존 신호용 */
const PRESENCE_KEEPALIVE_MS = 5000

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
  private sawFirstSync = false
  private lastSent = { x: NaN, y: NaN, facing: "" as string, action: "" as string }

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

  /**
   * 채널 구독. opts.track=false 면 구독만 하고 내 presence 는 track 하지 않는다 —
   * 방 정원 검사(입장 전 인원 확인) 용도. 자리 확인 후 `trackSelf()` 로 정식 입장.
   */
  async connect(opts: { track?: boolean } = {}): Promise<void> {
    if (this.channel) return
    const track = opts.track !== false
    this.channel = this.supabase.channel(this.channelName, {
      config: { private: true, presence: { key: this.identity.userId } },
    })
    this.channel.on("presence", { event: "sync" }, () => {
      this.sawFirstSync = true
      this.emitRemote()
    })
    this.channel.on("presence", { event: "join" }, () => this.emitRemote())
    this.channel.on("presence", { event: "leave" }, () => this.emitRemote())
    await new Promise<void>((resolve, reject) => {
      // 타임아웃 안전망 — subscribe 콜백이 SUBSCRIBED/CHANNEL_ERROR 어느 것도 안 오고
      // 멈추면(예: realtime 인증 실패 시 무응답) 부팅이 영원히 hang 된다. 일정 시간 뒤
      // reject 해서 호출부(HighburyStage)가 싱글플레이로 폴백하도록 한다.
      const timer = setTimeout(() => {
        reject(new Error("indoor presence subscribe timeout"))
      }, METAVERSE.PRESENCE_SUBSCRIBE_TIMEOUT_MS)
      this.channel!.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer)
          if (track) void this.publishImmediate()
          resolve()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          clearTimeout(timer)
          reject(err instanceof Error ? err : new Error(`indoor presence ${status}`))
        }
      })
    })
  }

  /** connect({track:false}) 후 정식 입장 — 내 presence track 시작. */
  async trackSelf(): Promise<void> {
    await this.publishImmediate()
  }

  /** 첫 presence sync 대기 (이미 왔으면 즉시). 정원 검사 전 상태 수신 보장용. */
  async waitFirstSync(timeoutMs = 2000): Promise<void> {
    const start = Date.now()
    while (!this.sawFirstSync && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  /** 현재 채널에 track 된 인원 수 (나를 track 하기 전이면 = 기존 입장자 수). */
  getOccupancy(): number {
    if (!this.channel) return 0
    return Object.keys(this.channel.presenceState()).length
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
    // 변화 없으면 발행 생략 (5초 keepalive 만) — 씬이 매 프레임 호출하므로 고정 200ms
    // 발행은 유저가 가만히 있어도 초당 5 presence 이벤트를 만들고, 방 인원이 늘면
    // Supabase ClientPresenceRateLimitReached 로 presence 수신이 통째로 죽는다 (2026-07-02 실측).
    const now = Date.now()
    const changed =
      Math.abs(x - this.lastSent.x) > 0.5 ||
      Math.abs(y - this.lastSent.y) > 0.5 ||
      facing !== this.lastSent.facing ||
      action !== this.lastSent.action
    if (!changed && now - this.lastPresenceAt < PRESENCE_KEEPALIVE_MS) return
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
      this.lastSent = {
        x: payload.x,
        y: payload.y,
        facing: payload.facing,
        action: payload.action,
      }
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
