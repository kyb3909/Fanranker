/**
 * React ↔ Phaser 간 단방향 이벤트 브리지.
 *
 * Phaser 씬은 global EventTarget을 통해 React UI 상태 변화를 구독.
 * (React → Phaser: chat 입력창 open/close 등)
 *
 * 역방향은 Phaser → React: Plot 진입/이탈 같은 반응성 이벤트.
 * 클래스 인스턴스(RoomChannel)도 detail에 담아 전달 가능.
 */

import type { RoomChannel } from "@/lib/metaverse/realtime/room-channel"

type BridgeEventMap = {
  "chat:input:open": undefined
  "chat:input:close": undefined
  /** 내 아바타가 Plot 경계 안으로 진입. roomId/ownerUserId 는 방이 있을 때만 세팅 */
  "plot:enter": {
    plotId: string
    plotCode: string
    plazaName: string
    roomId?: string
    ownerUserId?: string
  }
  /** 내 아바타가 Plot 경계 밖으로 이탈 */
  "plot:leave": undefined
  /** 방 개설 성공 → Phaser 씬이 수신해서 Signboard 추가 */
  "room:created": {
    id: string
    plotId: string
    ownerUserId: string
    signText: string
    createdAt: string
    lastActivityAt: string
  }
  /** 방 닫힘 → Signboard 제거 (Phase 3.4+) */
  "room:closed": { plotId: string }
  /** Plot 진입으로 방 채널이 활성화됨 → 씬은 publish 타겟을 전환 + 방 메시지 구독 */
  "room:channel:attach": { channel: RoomChannel }
  /** Plot 이탈 → 방 채널 해제 */
  "room:channel:detach": undefined
  /** UI가 채팅 전송 요청. 씬이 라우팅 (room 있으면 room, 없으면 world) */
  "chat:send": { text: string }
  /** 현재 방 접속자 수 갱신 (RoomChannel presence). room 없을 때는 0 또는 이벤트 없음. */
  "room:presence": { count: number }
  /** 씬 → React: 채팅 로그 패널에 메시지 추가. 뮤트 필터는 패널 쪽에서 처리. */
  "chat:log:append": {
    userId: string
    nickname: string
    text: string
    timestamp: number
    scope: "world" | "room" | "local"
  }
  /** 유저가 다른 아바타를 클릭 — 뮤트 등 컨텍스트 메뉴 띄우기.
   * 좌표는 화면(viewport) 기준 — popover 띄울 위치. */
  "user:clicked": {
    userId: string
    nickname: string
    screenX: number
    screenY: number
  }
}

class MetaverseSceneBridge extends EventTarget {
  emit<K extends keyof BridgeEventMap>(type: K, detail?: BridgeEventMap[K]) {
    this.dispatchEvent(new CustomEvent(type, { detail }))
  }

  on<K extends keyof BridgeEventMap>(
    type: K,
    listener: (detail: BridgeEventMap[K]) => void
  ): () => void {
    const handler = (e: Event) => listener((e as CustomEvent<BridgeEventMap[K]>).detail)
    this.addEventListener(type, handler)
    return () => this.removeEventListener(type, handler)
  }
}

/** 모듈 싱글톤 — 탭 하나에 게임 인스턴스 하나라는 전제. */
export const sceneBridge = new MetaverseSceneBridge()
