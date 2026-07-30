/**
 * 크리에이터(유튜버) 보드 레지스트리.
 *
 * 테스트 파일럿 = 캣스날 단일 채널. 메인 토픽 보드(ALL_COMMUNITIES)와 분리해
 * creator_id 기반으로 추후 다른 유튜버를 그대로 추가 확장할 수 있게 한다.
 * channelId 는 resolveChannelId(handle) 결과를 캐시한 값 (lib/youtube/resolve-channel.ts).
 */
export interface CreatorInfo {
  /** creator_videos.creator_id (테스트 단계에선 slug 허용) */
  creatorId: string
  /** /community/{slug} 라우트로 노출 */
  slug: string
  name: string
  /** @catsenal */
  handle: string
  /** UC... 유튜브 채널 ID */
  channelId: string
  description?: string
  /** 게시판 프로필 사진 (원형 아바타). public 경로 또는 외부 URL. */
  avatar?: string
}

export const CREATORS: Record<string, CreatorInfo> = {
  catsenal: {
    creatorId: "catsenal",
    slug: "catsenal",
    name: "캣스날",
    handle: "@catsenal",
    channelId: "UCVPFecM-P0NBUOtbm_f0YQQ",
    description: "아스날 팬 유튜버 캣스날 채널",
    avatar: "/creators/catsenal.jpg",
  },
  // ── 시즌 오픈 이벤트 공략 채널 (2026-07-31 추가) — 첼루키(첼시)·리빅(리버풀)·코그(공동) ──
  chelookey: {
    creatorId: "chelookey",
    slug: "chelookey",
    name: "첼루키",
    handle: "@chelookey",
    channelId: "UCovqkt9CC5WoSdDUxql0MTg",
    description: "첼시 팬 유튜버 첼루키 채널",
    avatar: "/creators/chelookey.jpg",
  },
  cog: {
    creatorId: "cog",
    slug: "cog",
    name: "코그 COG",
    handle: "@코그COG",
    channelId: "UCCl0K-E1YdBE-B9o5OR5DrA",
    description: "첼루키 × 리빅 공동 채널 코그",
    avatar: "/creators/cog.jpg",
  },
  libig: {
    creatorId: "libig",
    slug: "libig",
    name: "리버풀빅클럽이야",
    handle: "@Life4_Kop",
    channelId: "UC0CZYapctCIZxmC-FRUbrVA",
    description: "리버풀 팬 유튜버 리빅(리버풀빅클럽이야) 채널",
    avatar: "/creators/libig.jpg",
  },
}

/** 보드 slug → 크리에이터 정보 (크리에이터 보드가 아니면 null). */
export function getCreator(slug: string): CreatorInfo | null {
  return CREATORS[slug] ?? null
}

/** 싱크 cron 에서 순회할 전체 크리에이터. */
export const ALL_CREATORS: CreatorInfo[] = Object.values(CREATORS)

/** creator_id 로 크리에이터 조회 (API 라우트에서 핸들 매핑용). */
export function getCreatorById(creatorId: string): CreatorInfo | null {
  return ALL_CREATORS.find((c) => c.creatorId === creatorId) ?? null
}
