export type Position = "GK" | "DF" | "MF" | "FW"

export interface Player {
  id: string
  name: string
  nameKo: string
  team: string
  teamKo: string
  position: Position
  price: number
  /**
   * FPL 성적 지표 (2026-08-25). 결과 화면 스탯 표가 쓴다.
   * ⚠️ 아스널 레전드 등 다른 데이터 파일에는 없다 — 전부 옵셔널이고, 없으면 표에서
   *    그 열을 접는다. 시즌 초에는 points·form 이 0에 가깝다(GW1 실측 610명 중 295명).
   */
  owned?: number // 전 세계 FPL 유저 보유율 %
  points?: number // 시즌 누적 점수
  form?: number // 최근 폼
  epNext?: number // 다음 라운드 예상 점수
  xg?: number // 기대 득점
  xa?: number // 기대 도움
  ownedRank?: number // 포지션 안에서의 소유율 순위 (1 = 그 포지션 최고 인기)
  posTotal?: number // 그 포지션 총원 — 순위의 분모
}

let _players: Player[] | null = null
let _loadingPromise: Promise<Player[]> | null = null
let _loadedFile: string | null = null

const DEFAULT_DATA_FILE = "arsenal-players.json"

/**
 * 선수 풀 로드. 게임마다 데이터 파일이 다르다 (`games-catalog.ts` 의 `dataFile`).
 *
 * ⚠️ 종전엔 `arsenal-players.json` 이 **하드코딩**돼 있었다. 그래서 EPL 슬러그가
 *    "24-25 시즌 현역" 이라고 써 놓고 실제로는 아스널 레전드를 띄웠다
 *    (2026-08-25 실측: 보드에 티에리 앙리·베르캄프). 파일이 바뀌면 캐시도 버린다.
 */
export async function loadPlayers(dataFile: string = DEFAULT_DATA_FILE): Promise<Player[]> {
  if (_players && _loadedFile === dataFile) return _players
  if (_loadingPromise && _loadedFile === dataFile) return _loadingPromise
  _loadedFile = dataFile
  _players = null
  /**
   * ⚠️ JSON 을 직접 안 읽는다 — API 를 거친다 (2026-08-25).
   *
   * 종전엔 `/data/<파일>.json` 을 그대로 가져와서 선수 이름이 JSON 에 박힌 값으로
   * 고정됐다. 어드민에서 사전을 고쳐도 판타지는 안 바뀌었다. 이 라우트가 이름만
   * 사전으로 보정해 준다 — 몸값·포인트 등 FPL 고유 데이터는 그대로다.
   * 사전을 못 읽으면 원본을 그대로 돌려주므로(fail-open) 게임이 멈추지 않는다.
   */
  _loadingPromise = fetch(`/api/draft/players?file=${encodeURIComponent(dataFile)}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${dataFile} load failed: ${r.status}`)
      return r.json() as Promise<Player[]>
    })
    .then((data) => {
      _players = data
      return data
    })
    .finally(() => {
      _loadingPromise = null
    })
  return _loadingPromise
}

/** Sync access — only works after loadPlayers() has been called */
export function getAllPlayers(): Player[] {
  return _players ?? []
}

export function getPlayersByPosition(pos: Position): Player[] {
  return getAllPlayers().filter((p) => p.position === pos)
}

export function getPlayerById(id: string): Player | undefined {
  return getAllPlayers().find((p) => p.id === id)
}

export const POSITION_COLORS: Record<Position, string> = {
  GK: "bg-amber-500 text-white",
  DF: "bg-blue-500 text-white",
  MF: "bg-green-500 text-white",
  FW: "bg-red-500 text-white",
}

export const POSITION_LABELS: Record<Position, string> = {
  GK: "골키퍼",
  DF: "수비수",
  MF: "미드필더",
  FW: "공격수",
}

/** 기본 포지션 제한 (4-4-2) */
export const POSITION_LIMITS: Record<Position, number> = {
  GK: 1,
  DF: 4,
  MF: 4,
  FW: 2,
}
