/**
 * 서버에서 Supabase Realtime 월드 채널로 broadcast 이벤트를 보내는 헬퍼.
 *
 * 사용처:
 *  - POST /api/metaverse/chat-rooms → room:created
 *  - DELETE /api/metaverse/chat-rooms/[id] → room:closed
 *  - 크론 청소 후 각 닫힌 방마다 room:closed
 *
 * Supabase Realtime은 송신하려면 먼저 subscribe 해야 하므로 매 호출마다
 * 가벼운 ad-hoc 채널을 만든다. send 완료 후 removeChannel로 정리.
 * 실패해도 throw 하지 않음 — 주 작업(DB write)은 이미 끝났으므로 best-effort.
 */

import { createServiceRoleClient } from "@/lib/supabase/server"
import { METAVERSE } from "@/lib/metaverse/constants"
import type { ChatRoomMeta } from "@/lib/metaverse/types"

type BroadcastPayload =
  | { event: "room:created"; payload: ChatRoomMeta }
  | { event: "room:closed"; payload: { plotId: string } }

const SUBSCRIBE_TIMEOUT_MS = 4000

async function broadcastToWorld(msg: BroadcastPayload): Promise<void> {
  const supabase = createServiceRoleClient()
  const channel = supabase.channel(METAVERSE.CHANNEL_WORLD, {
    config: { private: true, broadcast: { ack: false, self: false } },
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("broadcast subscribe timeout")),
        SUBSCRIBE_TIMEOUT_MS
      )
      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer)
          resolve()
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer)
          reject(err instanceof Error ? err : new Error(`broadcast ${status}`))
        }
      })
    })

    await channel.send({ type: "broadcast", event: msg.event, payload: msg.payload })
  } catch (err) {
    // Best-effort — 클라이언트는 새로고침으로 eventual consistency 회복
    console.warn("[metaverse] world broadcast failed", { event: msg.event, err })
  } finally {
    await supabase.removeChannel(channel).catch(() => {})
  }
}

export function broadcastRoomCreated(room: ChatRoomMeta): Promise<void> {
  return broadcastToWorld({ event: "room:created", payload: room })
}

export function broadcastRoomClosed(plotId: string): Promise<void> {
  return broadcastToWorld({ event: "room:closed", payload: { plotId } })
}
