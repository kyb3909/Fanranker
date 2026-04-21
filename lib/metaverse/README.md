# 경기장 메타버스 (Stadium Metaverse)

> **완성 전까지 사이트에 연결하지 않음**. 독립 개발 → 완성 후 GNB에 메뉴 추가로 통합.

## 격리 원칙

**단방향 의존성**: 메타버스는 기존 코드를 import 해도 되지만, **기존 코드는 절대 `metaverse/` 내부를 import 하지 않음**.

```
/app/                                     ← 기존 사이트
/components/                              ← 기존 사이트
/lib/                                     ← 기존 사이트

/app/metaverse/                           ← 숨겨진 라우트 (nav 없음)
/components/metaverse/                    ← 메타버스 전용 컴포넌트
/lib/metaverse/                           ← 메타버스 전용 로직 (Phaser, Realtime, 카르마)
/public/metaverse/                        ← 픽셀 에셋 (UK 맵, 아바타)
/supabase/migrations/YYYYMMDD_metaverse_*.sql  ← metaverse_ 접두사 테이블만
```

## DB 격리 정책

- **신규 테이블**: 모두 `metaverse_` 접두사 사용 (예: `metaverse_chat_rooms`)
- **기존 테이블 변경**: `posts.flair_team_id` 컬럼 추가 (NULL 허용 — 기존 글 영향 0)
- **기존 RPC/훅**: 수정하지 않음. 새 RPC(`metaverse_*`)만 추가
- **재사용**: `stadium_contributions`, `team_stadiums`, `team_map_pins`, `stadium_level_thresholds`는 **읽기 전용**으로 사용 (쓰기는 신규 RPC가 담당)

## Realtime 채널 격리

모든 채널 이름에 `metaverse:` 접두사:

- `metaverse:world` — 월드맵 전체 Presence + Broadcast
- `metaverse:chat:{roomId}` — 유저 생성 채팅방
- `metaverse:stadium:{teamId}` — 팀 경기장 내부 (Phase 4)

## 라우트 숨김

- `/metaverse` — 이 URL은 존재하지만 **GNB/헤더에서 링크 없음**
- 직접 URL 접근해야 진입 (내부 테스터용)
- 프로덕션 노출 시점 = Phase 1~3 완료 후 GNB에 메뉴 1줄 추가

## 폴더 맵

```
lib/metaverse/
├─ README.md                 ← 이 파일
├─ scenes/                   ← Phaser 씬 (WorldMapScene, StadiumInteriorScene...)
├─ realtime/                 ← Supabase Realtime 래퍼 (Presence, Broadcast)
├─ karma.ts                  ← 카르마 적립/조회 로직
├─ fandom.ts                 ← 팬덤 가입 로직
├─ plot.ts                   ← 광장 Plot + 채팅방 로직
└─ types.ts                  ← 공유 타입

components/metaverse/
├─ metaverse-stage.tsx       ← 최상위 React 래퍼 (Phaser mount point)
├─ chat-overlay.tsx          ← 말풍선 + 입력창 UI
├─ hud.tsx                   ← 미니맵, 좌표, 활동 포인트 잔액 등
└─ dev-panel.tsx             ← 개발용 디버그 패널 (프로덕션 노출 X)

app/metaverse/
├─ page.tsx                  ← /metaverse 진입점
└─ stadium/[teamId]/page.tsx ← 팀 경기장 상세 (Phase 4)
```

## 관련 문서

- `docs/PRD-stadium-metaverse.md` — 전체 제품 설계 문서
- `docs/AVATAR_SPRITE_8WAY_SPEC.md` — 아바타 스프라이트 규격
- `docs/pixel-hero-avatar-uniform-guide.md` — 유니폼 시스템 (Phase 4)

## Phase 로드맵

자세한 내용은 `docs/PRD-stadium-metaverse.md` 섹션 12.

- **Phase 1** (진행 중): 월드맵 + 아바타 멀티플레이 + proximity 채팅
- **Phase 2**: 팀 플레어 + 카르마 시스템
- **Phase 3**: 광장 Plot + 채팅방 + 팬덤 가입
- **Phase 4**: 경기장 내부 + 유니폼
- **Phase 5**: 경기 중계 연동 (기존 PRD-live-room 흡수)
