# PRD: PvP 멀티플레이어 드래프트 (Draft Multiplayer)

## 문서 메타데이터

| 항목 | 내용 |
|------|------|
| 문서명 | PRD - PvP 멀티플레이어 드래프트 MVP |
| 버전 | v0.1 (Draft) |
| 상태 | Draft — 검토 필요 |
| 작성일 | 2026-05-26 |
| 서비스 | gongnori.fan |
| 대상 플랫폼 | Web (모바일 반응형 포함) |
| 선행 작업 | Phase 1 (게임 선택 화면) · Phase 2A (진행 화면 디자인) 완료 |

---

## 1. 제품 개요

### 1.1 제품명

**PvP 드래프트** — 솔로 vs AI 모드의 멀티플레이어 확장.

### 1.2 한 줄 설명

최대 4명이 같은 대기실에 모여, 실시간으로 스네이크 픽을 주고받으며 채팅하는 동기형 드래프트 게임.

### 1.3 제품 목표

- 솔로 vs AI 만으로는 "다음에 또 할 이유" 가 약함 → **사람 vs 사람** 으로 재미와 SNS 확산성 강화
- "지금 같이 할 사람" 을 손쉽게 찾는 공개 방 목록으로 마찰 최소화 — 친구가 없어도 게임 가능
- 드래프트가 끝나면 자연스럽게 채팅·공유 카드·커뮤니티 라운드 갤러리로 연결되어 체류시간 확장

### 1.4 기존 인프라 연동

| 기존 시스템 | 연동 방식 |
|------------|-----------|
| Clerk 인증 | 로그인된 사용자만 방 생성/참가. 미인증은 readonly 관전만 |
| profiles | 닉네임/avatar 표시 |
| Supabase Realtime | Presence (대기실 인원) + Broadcast (픽/채팅) |
| `lib/draft/engine.ts` | 스네이크 순서 / 픽 검증 로직 재사용 (서버에서 권위적 실행) |
| `lib/metaverse/realtime/` | 채널 클래스 패턴 참조 (RoomChannel 와 동일한 형식) |
| Rate-limit middleware | `/api/draft-rooms/*` 에 적용 (방 생성/메시지 spam 방지) |

---

## 2. 문제 정의

### 2.1 현재 한계

| 문제 | 설명 |
|------|------|
| 솔로 vs AI 의 재미 한계 | AI 픽이 예측 가능, 한두 번 하면 흥미 떨어짐 |
| 친구 모임 마찰 | 디스코드/카카오톡으로 시간 맞추기 어려움 |
| 결과 후 단절 | 드래프트 끝나면 공유 카드만 남고, 사람 간 연결 없음 |
| 라이브 인원 부족 | "지금 같이 할 사람" 을 발견할 길이 없음 |

### 2.2 해결 방향

- **공개 방 목록** + **친구 초대 링크** 두 트랙. 친구 모임은 초대로, 즉흥 매칭은 공개 목록으로.
- 한 방 안에서 **드래프트 + 채팅** 동시에 — 픽 사이 시간(AI 대기 30초)이 자연스러운 잡담 시간이 됨.
- 드래프트 종료 후 채팅이 결과 화면까지 이어짐 — "와 나 졌네" 같은 마무리 대화 가능.

---

## 3. 성공 지표

| 지표 | 목표 (런칭 4주) |
|------|----------------|
| 멀티 모드 신규 방 / 일 | 평균 30개 이상 |
| 4인 풀 매치 비율 | 신규 방의 60% 이상이 4명 모임 |
| 평균 방 체류 시간 | 12분 이상 (드래프트 8분 + 종료 후 4분) |
| 종료 후 채팅 메시지 / 방 | 평균 8개 이상 |
| 멀티 → 솔로 vs 솔로 → 멀티 전환율 | 솔로 1회 후 7일 내 멀티 진입 30% |

### 3.1 추적 이벤트

- `draft_room:create` — 호스트가 방 만듦
- `draft_room:join` — 누군가 방 참가
- `draft_room:leave` — 방 이탈 (체류 시간 포함)
- `draft_room:start` — 4인 모여 드래프트 시작
- `draft_room:pick` — 사람 픽 (vs 자동 픽 구분)
- `draft_room:chat` — 메시지 전송
- `draft_room:complete` — 정상 완주

---

## 4. 사용자 흐름

### 4.1 호스트 흐름 (방 생성)

1. `/games/draft/epl/setup` 에서 **모드: 멀티플레이어** 선택 (현재 disabled, 활성화)
2. 닉네임 + 포메이션 + (드래프트 순서는 자동/랜덤) 입력 후 "방 만들기" 클릭
3. 서버가 `draft_rooms` 행 생성 (`status='waiting'`, host_user_id, formation, ...) + 6자리 인비테이션 코드 발급
4. 호스트는 대기실(`/games/draft/epl/room/[id]`)로 리다이렉트
5. 대기실에서 다른 사람들이 들어오는 걸 presence 로 실시간 확인 + 채팅 가능
6. 4명 모이면 **모두에게 "준비" 버튼** 활성화 → 4명 모두 누르면 자동 시작 (또는 호스트가 "지금 시작" 으로 3명 이하에서도 시작 — AI fill 적용)

### 4.2 즉흥 참가자 흐름 (공개 방 목록)

1. `/games/draft/epl/setup` 에서 **"공개 방 둘러보기"** 클릭 — 또는 setup 화면 자체에 "지금 모집 중인 방" 섹션 노출
2. `/games/draft/epl/rooms` 진입 — `status='waiting' AND NOT private` 인 방 카드 그리드
3. 각 카드: 호스트 닉네임 / 포메이션 / 현재 인원 (1/4, 2/4, 3/4) / 분위기(`상위 메시지 1줄 미리보기 가능`) / 만든지 N분 / "참가" 버튼
4. 참가 클릭 → 대기실 진입 (호스트 흐름 5번과 동일)

### 4.3 초대 링크 참가자 흐름

1. 호스트가 대기실에서 "초대 링크 복사" 또는 "방 코드 ABCD12 공유"
2. 친구가 링크 클릭 (`/games/draft/epl/room/[id]`) 또는 setup 에서 코드 입력
3. 대기실 진입 (`private=true` 인 방도 코드/링크로는 접근 가능)

### 4.4 게임 진행 흐름

1. 4명 (또는 호스트가 시작 누른 인원 + AI fill 로 4명) 으로 시작
2. 스네이크 순서: 방 생성 시 랜덤 결정 또는 입장 순서 (PRD 결정 필요)
3. 현재 픽 차례인 사람만 "영입" 버튼 활성화. 다른 셋은 풀 둘러보고 핀(즐겨찾기)만 가능
4. 30초 안에 픽 안 하면 자동 픽 (현재 솔로 모드와 동일 로직, 서버에서 실행)
5. 픽 결과는 broadcast 로 모두에게 즉시 전파
6. 채팅은 픽 중에도 항상 가능
7. 11라운드 × 4명 = 44픽 완주 시 결과 화면

### 4.5 종료 후

1. 결과 화면 (Phase 2B+ 디자인) — 4명 라인업 비교, 점수, 시즌 시뮬레이션
2. 채팅창은 결과 화면에서도 유지 — "끝나고 한판 더?" 같은 마무리 대화
3. "한 판 더" 버튼 — 같은 4명으로 새 방 자동 생성 (희망자만 join)

---

## 5. 핵심 결정 사항

### 5.1 Lobby 방식 (FAQ)

| Q | A |
|---|---|
| 공개 방 어떻게 찾나? | `/games/draft/epl/rooms` 페이지 + setup 화면에 "지금 모집 중" 섹션 |
| 친구만 들어오게 할 수 있나? | 방 만들 때 `private=true` 토글. 공개 목록에 안 뜨고 코드/링크로만 접근 가능 |
| 방이 너무 오래 차있으면? | `status='waiting'` 인 채로 30분 경과 시 자동 archive (`status='abandoned'`) |
| 한 사람이 여러 방 동시? | 동시에 1개만. 새 방 만들기/참가 시 기존 방에서 자동 leave |

### 5.2 이탈 처리

| 상황 | 처리 |
|------|------|
| 대기실에서 누가 나감 | 인원만 빠지고 방은 유지 (`waiting` 상태) |
| 호스트가 대기실에서 나감 | 남아있는 다른 사람 중 가장 먼저 들어온 사람이 새 호스트, 모두 나갔으면 방 archive |
| 게임 진행 중 누가 끊김 (5초 이상 presence drop) | **30초 grace window** 안에 재접속하면 본인 자리 복귀. 30초 초과 시 **AI 자동 대체** — 해당 좌석을 isAI=true 로 전환, 본인 차례 오면 자동 픽. 게임 끝날 때까지 AI 유지 |
| 게임 진행 중 모두 끊김 | `status='abandoned'` 로 archive. 30분 grace 후 cleanup cron 으로 삭제 |

### 5.3 AI Fill 정책

**기본 정책: 수동 트리거** — 호스트가 명시적으로 "지금 시작" 눌러야 AI 채움. 자동 fill 없음.

| 시점 | 정책 |
|------|------|
| 대기 30초 이상 경과 | 호스트의 "지금 시작" 버튼 활성화 (그 전엔 비활성, "4명 채워서 시작" 만 가능) |
| 호스트 "지금 시작" 클릭 | 부족한 좌석만큼 AI 자동 추가 (이름: AI 알렉스/모건/테리 ...) |
| 진행 중 이탈 | 5.2 참조 — 30초 grace 후 해당 좌석만 AI 전환 |

호스트가 "조금만 더 기다리자" 할 수 있는 권한 유지. 자동 fill 은 Phase 2 옵션으로 추후 토글 추가 가능.

### 5.4 채팅 범위

| 항목 | 정책 |
|------|------|
| 메시지 종류 | 텍스트 only (Phase 1). 이모지 react / 픽 액션 단축어는 Phase 2 |
| 메시지 길이 | 200자 |
| Rate limit | 1초당 2회, 30초간 30회 (`/api/draft-rooms/[id]/chat` rate-limit middleware) |
| Spam/욕설 | 기존 `lib/sanitize-embed` 와 별도. profanity filter Phase 2. 신고 버튼 (호스트 only mute 권한) |
| 히스토리 | 방 status='completed' 후 30일까지 DB 보존. 그 후 archive |

### 5.5 픽 순서 결정

**기본 (확정)**: 방 시작 시점에 **랜덤 셔플**. 모두 동일 확률. 입장 순서/호스트 우선 같은 어드밴티지 없음.

설정 화면에서 "내 드래프트 순서" 토글은 멀티 모드에서 숨김. 솔로 모드에서만 노출.

### 5.6 닉네임/익명성

**기본 (확정)**: 모든 곳에서 **실제 닉네임 노출**. 익명 옵션 없음.

- 픽 결과 / 최근 픽 로그 / AI 패널 / 채팅 모두 `profiles.display_name` 그대로
- 멀티 게임은 "누구랑 하는지" 아는 게 재미의 핵심
- 채팅창 메시지 닉네임 클릭 → 사용자 프로필 페이지 이동 (이미 있는 `/users/[id]` 경로 재사용)
- 트롤/욕설은 호스트 mute (Phase 3D) + 신고 (Phase 2 옵션) 으로 대응

---

## 6. 데이터 모델 (DB Schema)

### 6.1 신규 테이블

```sql
-- 방 (대기실 + 진행 + 완료/포기 통합 행)
CREATE TABLE draft_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text UNIQUE NOT NULL,           -- 6자리 영문/숫자 (ABCD12)
  host_user_id text NOT NULL,                  -- Clerk user id
  game_slug text NOT NULL DEFAULT 'epl',       -- 'epl' | 'arsenal' | 'slamdunk' ...
  status text NOT NULL DEFAULT 'waiting',      -- waiting | drafting | completed | abandoned
  is_private boolean NOT NULL DEFAULT false,
  max_participants int NOT NULL DEFAULT 4,
  formation text,                              -- 호스트가 설정 ('4-3-3' 등). 참가자도 따름
  budget int NOT NULL DEFAULT 80,
  total_rounds int NOT NULL DEFAULT 11,
  snake_order int[],                           -- seatIndex 배열, 시작 시점에 확정
  current_pick int NOT NULL DEFAULT 0,
  drafting_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()  -- presence/chat/pick 시 갱신
);

CREATE INDEX idx_draft_rooms_open ON draft_rooms (status, is_private, created_at DESC)
  WHERE status = 'waiting' AND is_private = false;
CREATE INDEX idx_draft_rooms_host ON draft_rooms (host_user_id, status);

-- 좌석 (대기실에 들어온 참가자 N <= max_participants)
CREATE TABLE draft_room_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES draft_rooms(id) ON DELETE CASCADE,
  seat_index int NOT NULL,                     -- 0..3
  user_id text,                                -- null 이면 AI 좌석 (drafting 중 이탈 → AI 대체 시)
  display_name text NOT NULL,                  -- 닉네임 스냅샷
  is_ai boolean NOT NULL DEFAULT false,
  ai_name text,                                -- 'AI 알렉스' 등 (is_ai=true 일 때만)
  is_ready boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,                         -- null=현재 있음, 값=언제 나갔는지
  UNIQUE (room_id, seat_index)
);
CREATE INDEX idx_seats_room ON draft_room_seats (room_id);

-- 픽 기록 (진행 중 + 종료 후 보관)
CREATE TABLE draft_room_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES draft_rooms(id) ON DELETE CASCADE,
  pick_number int NOT NULL,                    -- 0..43 (4인 × 11라운드)
  seat_index int NOT NULL,
  player_id text NOT NULL,                     -- fpl-players.json 의 id
  is_auto_pick boolean NOT NULL DEFAULT false,
  picked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, pick_number)
);
CREATE INDEX idx_picks_room ON draft_room_picks (room_id, pick_number);

-- 채팅 (대기실 + 진행 + 종료 후 모두 같은 테이블)
CREATE TABLE draft_room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES draft_rooms(id) ON DELETE CASCADE,
  user_id text,                                -- null = 시스템 메시지 (입장/이탈/픽 알림)
  display_name text NOT NULL,
  kind text NOT NULL DEFAULT 'chat',           -- chat | system_join | system_leave | system_pick | system_start
  body text,                                   -- chat 일 때 본문 (max 200자), system 은 null
  payload jsonb,                               -- system 메시지 메타 (예: { player_id, seat_index })
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_room ON draft_room_messages (room_id, created_at);
```

### 6.2 기존 테이블과의 관계

- `host_user_id`, `seats.user_id`, `messages.user_id` → Clerk user id (text). FK 안 검 — `profiles.id` 같은 형식.
- 게임 종료 후 `draft_room_picks` 를 기반으로 공유 카드/라인업 분석 — 별도 `shared_lineups` 테이블에 snapshot 저장 (Phase 4 결과 화면에서 정의).

---

## 7. Realtime 채널 설계

### 7.1 채널 구조 (`lib/metaverse/realtime/room-channel.ts` 패턴 차용)

```
draft:room:{roomId}
  Presence:    { userId, displayName, seatIndex }
  Broadcast:
    - room:state          (서버→클라, 권위적 상태 — 픽 후/시작/종료)
    - room:chat           (클라→클라, 채팅 메시지)
    - room:typing         (옵션, Phase 2) 누가 타이핑 중
```

### 7.2 클라이언트 → 서버 (RPC 또는 API)

브로드캐스트로 액션 전송은 신뢰 못 함. 모든 mutation 은 서버 권위:

- `POST /api/draft-rooms` — 방 생성
- `POST /api/draft-rooms/[id]/join` — 좌석 점유
- `POST /api/draft-rooms/[id]/leave` — 좌석 해제
- `POST /api/draft-rooms/[id]/ready` — 준비 토글
- `POST /api/draft-rooms/[id]/start` — 호스트만 (AI fill 자동)
- `POST /api/draft-rooms/[id]/pick` — 현재 차례인 사람만, 서버 검증
- `POST /api/draft-rooms/[id]/chat` — 메시지 (rate-limit)
- `GET /api/draft-rooms` — 공개 방 목록 (페이지네이션, status='waiting' 만)

### 7.3 서버 → 클라 (Broadcast)

- `room:state` payload = `DraftRoomState` (방 전체 상태). 픽/시작/종료/이탈 시 서버가 모든 클라에 푸시
- `room:chat` payload = `{ id, displayName, body, kind, payload, createdAt }`. DB INSERT 후 broadcast
- 시스템 메시지(입장/이탈/픽 알림) 는 별도 채널 안 만들고 `room:chat` 의 `kind` 로 구분

### 7.4 타이머 동기화

- 서버가 픽 차례 시작 시 `pick_deadline_at = now() + 30s` 를 `draft_rooms` 에 저장
- broadcast 로 deadline timestamp 전송 → 각 클라이언트가 자기 시계로 카운트다운 렌더링 (clock skew 최대 1초 정도 허용)
- 30초 timeout 트리거: **본인 차례인 클라** 가 0초 도달 시 `/api/.../pick` 을 `isAutoPick=true` + recommended player id 로 호출
- 본인 끊긴 경우: 다른 클라 중 호스트 (또는 가장 먼저 들어온 사람) 가 5초 grace 후 fallback 으로 auto-pick API 호출
- 보안: 서버는 `pick_deadline_at` 와 비교 — 그 전 호출이면 isAutoPick=false 만 허용, 그 후 호출은 누구든 isAutoPick=true 만 허용

---

## 8. 권한 / RLS

### 8.1 Clerk JWT 기반 RLS

기존 패턴 따름 (`lib/supabase/server.ts` Clerk JWT 전달).

```sql
-- draft_rooms
ALTER TABLE draft_rooms ENABLE ROW LEVEL SECURITY;

-- 누구나 공개 방 목록 SELECT
CREATE POLICY "Open rooms readable" ON draft_rooms
  FOR SELECT USING (status = 'waiting' AND is_private = false);

-- 본인이 좌석 점유한 방 SELECT (private/진행중)
CREATE POLICY "Member rooms readable" ON draft_rooms
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM draft_room_seats s
    WHERE s.room_id = draft_rooms.id
      AND s.user_id = auth.jwt() ->> 'sub'
      AND s.left_at IS NULL
  ));

-- INSERT/UPDATE/DELETE 는 모두 API route 의 service role 로만 (RLS 우회)
-- 클라이언트 직접 DB 쓰기 금지
```

`draft_room_seats / picks / messages` 도 동일 패턴: SELECT 는 방 권한 derived, 쓰기는 service role.

### 8.2 API 권한

- 모든 mutation API 는 Clerk 미인증 → 401
- `pick` API 는 호출자 user_id 가 현재 차례 좌석의 user_id 인지 검증
- `start` API 는 호출자가 host_user_id 인지 검증
- `chat` API 는 호출자가 방의 좌석을 점유 중인지 검증 + rate-limit

---

## 9. 화면 (UI)

### 9.1 신규 화면

| 화면 | 경로 | 비고 |
|------|------|------|
| 공개 방 목록 (전용) | `/games/draft/epl/rooms` | 카드 그리드 풀페이지, 자동 갱신 (Realtime 또는 polling 10s). 페이지네이션 |
| 대기실 | `/games/draft/epl/room/[id]` | 좌석 4개 (빈/내/타) + 채팅 + 호스트 컨트롤 |
| 진행 (멀티) | 같은 `/games/draft/epl/room/[id]` 인데 status='drafting' | 기존 진행 화면 + 우측에 채팅 패널 추가 |
| 결과 (멀티) | 같은 path, status='completed' | 기존 결과 화면 + 채팅 유지 |

### 9.2 기존 화면 수정

- `/games/draft/epl/setup`: 멀티플레이어 옵션 활성화 + "공개 방 둘러보기" / "방 만들기" / "코드로 참가" 3-track CTA
- `/games/draft/epl/setup` 안에 **"지금 모집 중" 임베드 섹션** — 멀티 모드 선택 시 상위 3~6개 대기 방 카드 미니 노출 + "전체 보기 →" 링크가 `/rooms` 페이지로
- 진행 화면 (`draft-board.tsx`): solo 모드 vs multi 모드 분기 — multi 면 우측 패널에 채팅 추가, 타이머는 서버 deadline 기반

### 9.3 디자인 톤

- 모두 `.draft-scope` 토큰 안에서 (이미 Phase 1/2A 에서 준비)
- 대기실: dark editorial 헤더 ("WAITING ROOM" eyebrow) + 4 좌석 박스 + 채팅
- 채팅 패널: kraft 배경 + 메시지 행, 본인 burgundy, 시스템 메시지 italic mute

---

## 10. Phase 분할 (구현 순서)

| Phase | 범위 | 예상 작업량 |
|-------|------|-----------|
| **3A** | DB 스키마 + 마이그레이션 + RLS + 기본 API (방 생성/참가/이탈/목록) | 1~2 세션 |
| **3B** | 대기실 화면 + Realtime presence + 좌석 UI + 호스트 컨트롤 ("지금 시작" / AI fill) | 1~2 세션 |
| **3C** | 픽 sync (broadcast room:state) + 멀티 모드용 진행 화면 분기 + 서버 권위 timeout | 2 세션 |
| **3D** | 채팅 (broadcast + DB persist + rate-limit) + 시스템 메시지 (입장/이탈/픽) | 1 세션 |
| **3E** | 이탈 → AI 대체 처리 + 재접속 + abandoned cleanup cron | 1 세션 |
| **3F** | 공개 방 목록 화면 + setup 화면 멀티 트랙 CTA + 결과 화면 채팅 유지 | 1 세션 |

총 7~9 세션 예상. 각 Phase 끝마다 브라우저 검증 + 사용자 확인.

### 10.1 Phase 3A 사전 확정 사항 (사용자 확인 2026-05-26)

- ✅ AI fill: **수동 트리거** — 호스트가 "지금 시작" 눌러야 채움. 대기 30초 경과 시 버튼 활성화
- ✅ 픽 순서: **랜덤 셔플** (방 시작 시점). 입장 순서 어드밴티지 없음
- ✅ 재접속 윈도우: **30초 grace** — 초과 시 AI 자동 대체, 게임 끝까지 AI 유지
- ✅ 공개 방 목록: **별도 페이지 `/rooms` + setup 안에 미니 임베드** 둘 다
- ✅ 닉네임 노출: **모든 곳 실제 닉네임**, 익명 옵션 없음

Phase 3A 들어가기 전 추가 확인 필요 (작은 결정):
- ☐ `invite_code` 형식 — 6자리 영문대문자+숫자 (예: `ABCD12`) 로 가정. OK?
- ☐ AI 이름 풀 — 현재 솔로의 `AI_NAMES = ['공돌이', '에디터J', '늦슛']` 그대로 재사용. OK?
- ☐ 호스트 leave 시 — 남아있는 가장 먼저 입장한 사람이 자동 승계 (모두 나가면 방 archive)

---

## 11. 위험 / 미해결

| 항목 | 영향 | 대응 |
|------|------|------|
| Realtime 메시지 손실 | 픽 결과가 한쪽에만 안 보이면 게임 진행 불가 | `room:state` 는 매 변경마다 권위적 full state. 클라가 last_seen pick_number 체크해서 mismatch 면 `/api/draft-rooms/[id]` GET 으로 재동기화 |
| 동시 픽 (동일 선수를 두 명이 동시 클릭) | DB 충돌 | API 에서 transaction + `draftedPlayerIds` 체크. 패배자에게 "이미 누가 픽함" 토스트 |
| 30초 timeout 클락 스큐 | 본인 입장에선 5초 남았는데 서버는 끝 | `pick_deadline_at` 을 broadcast, 클라가 자기 시계로 계산하되 1초 grace |
| 4명이 빠르게 못 모임 | UX 죽음 | AI fill + 솔로 모드 항상 fallback 제공. 공개 방 목록에 활기 강조 ("지금 3명 모집 중!") |
| 채팅 spam / 욕설 | 신규 유저 이탈 | rate-limit + 호스트 mute + 신고 큐 (Phase 2) |
| 멀티 → 보안 사고 | RLS 우회/RPC 권한 | 모든 mutation service role + Clerk JWT 검증. 클라 직접 DB 쓰기 금지 |

---

## 12. 디펜던시

| 항목 | 상태 |
|------|------|
| Phase 1 (게임 선택) | ✅ 완료 |
| Phase 2A (진행 화면 디자인) | ✅ 완료 |
| Phase 2B+ (결과/공유/커뮤니티) | ⏸ 멀티 결과 화면 일부 의존 — Phase 3F 와 병행 가능 |
| Supabase Realtime 인프라 | ✅ metaverse 에서 검증된 패턴 재사용 |
| Clerk JWT → Supabase RLS | ✅ 기존 패턴 |
| Rate-limit middleware | ✅ `lib/middleware/rate-limit` 재사용 |

---

## 13. 변경 이력

- 2026-05-26 v0.1 작성 + 사용자 검토 1라운드 (5개 결정 항목 확정 — section 10.1 참조)
