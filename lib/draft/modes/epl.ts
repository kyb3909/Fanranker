import type { GameModeConfig } from '../types'
import { EPL_PLAYERS } from '../epl-players'

export const EPL_MODE: GameModeConfig = {
  id: 'epl',
  name: 'EPL 드래프트',
  description: '프리미어리그 820명 선수 풀에서 11명의 드림팀을 구성하세요',
  category: '스포츠',
  icon: '⚽',
  teamCount: 4,
  picksPerTeam: 11,
  salaryCap: 80,
  salaryUnit: '£',
  timerSeconds: 30,
  positions: [
    { position: 'GK', label: '골키퍼', min: 1, max: 1 },
    { position: 'DF', label: '수비수', min: 4, max: 4 },
    { position: 'MF', label: '미드필더', min: 3, max: 3 },
    { position: 'FW', label: '공격수', min: 3, max: 3 },
  ],
  getPlayers: () => EPL_PLAYERS,
}
