/**
 * React ↔ Phaser 간 단방향 이벤트 브리지.
 *
 * Phaser 씬은 global EventTarget을 통해 React UI 상태 변화를 구독.
 * (React → Phaser: chat 입력창 open/close 등)
 *
 * 역방향은 이 브리지를 쓰지 않음 — Phaser가 이벤트 발생시킬 필요 있으면
 * WorldChannel 콜백 또는 props/ref로 충분.
 */

type BridgeEventMap = {
  "chat:input:open": undefined
  "chat:input:close": undefined
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
