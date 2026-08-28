import { DEFAULT_KIT_KEY, getKit, INITIAL_KIT_BALANCE, KIT_BY_KEY } from "./kits"

export type KitStoreState = {
  balanceGold: number
  ownedKitKeys: readonly string[]
  equippedKitKey: string
  previewKitKey: string
  pendingKitKey: string | null
  notice: string | null
}

export type KitStoreAction =
  | { type: "preview"; kitKey: string }
  | { type: "purchase-start"; kitKey: string }
  | { type: "purchase-success"; kitKey: string }
  | { type: "purchase-failure"; kitKey: string }
  | { type: "equip"; kitKey: string }
  | { type: "reset" }

export function createInitialKitStore(): KitStoreState {
  return {
    balanceGold: INITIAL_KIT_BALANCE,
    ownedKitKeys: [DEFAULT_KIT_KEY],
    equippedKitKey: DEFAULT_KIT_KEY,
    previewKitKey: DEFAULT_KIT_KEY,
    pendingKitKey: null,
    notice: null,
  }
}

export function ownsKit(state: KitStoreState, kitKey: string) {
  return state.ownedKitKeys.includes(kitKey)
}

export function kitStoreReducer(state: KitStoreState, action: KitStoreAction): KitStoreState {
  if (action.type === "reset") return createInitialKitStore()

  const kit = KIT_BY_KEY.get(action.kitKey)
  if (!kit) return { ...state, notice: "존재하지 않는 유니폼입니다." }

  if (action.type === "preview") {
    return { ...state, previewKitKey: kit.kitKey, notice: null }
  }

  if (action.type === "equip") {
    if (!ownsKit(state, kit.kitKey)) {
      return { ...state, notice: "먼저 유니폼을 구매해야 합니다." }
    }
    return {
      ...state,
      equippedKitKey: kit.kitKey,
      previewKitKey: kit.kitKey,
      notice: `${kit.name} 착용 완료`,
    }
  }

  if (action.type === "purchase-start") {
    if (state.pendingKitKey) return state
    if (ownsKit(state, kit.kitKey)) {
      return { ...state, notice: "이미 보유한 유니폼입니다." }
    }
    if (state.balanceGold < kit.priceGold) {
      return { ...state, notice: "골드가 부족합니다." }
    }
    return { ...state, pendingKitKey: kit.kitKey, notice: null }
  }

  if (action.type === "purchase-failure") {
    if (state.pendingKitKey !== kit.kitKey) return state
    return { ...state, pendingKitKey: null, notice: "구매에 실패했습니다. 다시 시도해 주세요." }
  }

  if (state.pendingKitKey !== kit.kitKey) return state
  if (ownsKit(state, kit.kitKey)) {
    return { ...state, pendingKitKey: null, notice: "이미 보유한 유니폼입니다." }
  }
  if (state.balanceGold < kit.priceGold) {
    return { ...state, pendingKitKey: null, notice: "골드가 부족합니다." }
  }

  return {
    ...state,
    balanceGold: state.balanceGold - getKit(kit.kitKey).priceGold,
    ownedKitKeys: [...state.ownedKitKeys, kit.kitKey],
    equippedKitKey: kit.kitKey,
    previewKitKey: kit.kitKey,
    pendingKitKey: null,
    notice: `${kit.name} 구매 및 착용 완료`,
  }
}
