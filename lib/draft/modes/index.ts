import type { GameModeConfig } from '../types'
import { EPL_MODE } from './epl'

// ============================
// 게임 모드 레지스트리
// 새 모드 추가: modes/xxx.ts 생성 후 여기에 1줄 추가
// ============================
export const DRAFT_MODES: Record<string, GameModeConfig> = {
  epl: EPL_MODE,
  // nba: NBA_MODE,        // 향후 추가
  // slamdunk: SLAMDUNK_MODE,
}

export const DRAFT_MODE_LIST = Object.values(DRAFT_MODES)

export function getDraftMode(modeId: string): GameModeConfig | undefined {
  return DRAFT_MODES[modeId]
}
