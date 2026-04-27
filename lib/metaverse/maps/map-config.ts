/**
 * Indoor map 데이터 — `IndoorMapScene` 가 mapId 받아서 이 데이터로 background·floor·도어 세팅.
 *
 * 새 맵 추가 시: 여기에 entry 만 추가하면 IndoorMapScene 가 그대로 받아서 렌더링.
 */

export type MapId = "highbury" | "clockend"

export interface DoorConfig {
  /** 도어 hitbox 좌상단 + 크기 (월드 좌표, 배경 이미지 픽셀 기준) */
  x: number
  y: number
  width: number
  height: number
  /** 위 방향 입력 시 이동할 맵 */
  targetMapId: MapId
  /** 타겟 맵에서 스폰될 X — 도어 재진입 막기 위해 도어와 충분히 떨어진 위치 권장 */
  targetSpawnX: number
  /** 플레이어가 hitbox 안에 들어오면 도어 위에 표시될 라벨 */
  label: string
}

export interface MapConfig {
  id: MapId
  bgUrl: string
  bgWidth: number
  bgHeight: number
  /** 캐릭터 발이 닿는 floor y 좌표 (배경 이미지 픽셀 기준) */
  floorTopY: number
  /** 도어 통하지 않은 첫 진입 시 스폰될 X */
  defaultSpawnX: number
  doors: DoorConfig[]
  /** 축구공 + 킥 메커니즘 활성 여부. false 면 R 키 무시 + 공 스폰 안 함. */
  hasBall: boolean
}

export const MAPS: Record<MapId, MapConfig> = {
  highbury: {
    id: "highbury",
    bgUrl: "/metaverse/maps/highbury.webp",
    bgWidth: 1916,
    bgHeight: 821,
    // 돌담 약간 더 아래 — 산책로 보도 라인
    floorTopY: 620,
    defaultSpawnX: 200,
    doors: [
      {
        // 정중앙 빨간 정문 — 보도 위 캐릭터 몸통 (y 522-620) 과 겹치는 hitbox
        x: 918,
        y: 520,
        width: 84,
        height: 100,
        targetMapId: "clockend",
        targetSpawnX: 400,
        label: "↑ 클럭 엔드 입장",
      },
    ],
    // 경기장 밖 — 공·킥 비활성
    hasBall: false,
  },
  clockend: {
    id: "clockend",
    bgUrl: "/metaverse/maps/clockend.webp",
    bgWidth: 1915,
    bgHeight: 821,
    floorTopY: 780,
    defaultSpawnX: 400,
    doors: [
      {
        x: 0,
        y: 700,
        width: 180,
        height: 100,
        targetMapId: "highbury",
        targetSpawnX: 860,
        label: "↑ 하이버리로 나가기",
      },
    ],
    // 경기장 안 — 공·킥 활성
    hasBall: true,
  },
}
