# PRD: 경기장 메타버스 (Stadium Metaverse)

## 문서 메타데이터

| 항목 | 내용 |
|------|------|
| 문서명 | PRD - 경기장 메타버스 MVP |
| 버전 | v0.1 (초안) |
| 상태 | Draft — 리뷰 대기 |
| 작성일 | 2026-04-22 |
| 서비스 | gongnori.fan (FanRanker) |
| 대상 플랫폼 | Web (모바일 반응형 Phase 2+) |
| 대체 문서 | `docs/PRD-live-room.md` — 본 문서에 흡수됨 (경기 중계는 Phase 5에서 재편입) |

---

## 1. 제품 개요

### 1.1 한 줄 설명

픽셀아트 영국 지도 위에서 아바타로 돌아다니며 proximity 채팅을 하고, 팬덤별 경기장을 팀 활동으로 직접 건설해 소속감을 느끼는 **메타버스형 팬 커뮤니티**.

### 1.2 제품 목표

- 경기 예측 + 게시판 중심의 텍스트 커뮤니티를 **공간형 소셜 경험**으로 확장
- 팀별 플레어 활동과 경기장 건설을 **하나의 카르마 흐름**으로 연결 → 글·댓글이 곧 우리 팀 경기장 건설
- 팬카페 대체재 (디시/더쿠/에펨) 대비 **시각적 + 상호작용 차별화**
- 체류시간 · 재방문율 · 팬덤 소속감 동시 확보

### 1.3 레퍼런스

- **바람의 나라** (Nexus: 2D 탑다운, proximity 채팅, 그리드 이동)
- **Reddit 카르마** (팀별 적립, 총합 프로필 노출)
- **디스코드 음성 채널 생성** (유저가 광장에 방 세우기)
- **Clash of Clans 건설** (팬 기여도가 쌓여 팀 경기장 레벨업)

---

## 2. 문제 정의

| 문제 | 설명 |
|------|------|
| 공간감 부재 | 현재는 게시판+예측만 있음. "이 팀 팬들이 모여있는 곳"이 존재하지 않음 |
| 팬덤 소속감 약함 | 팀에 대한 충성도를 증명하거나 가시화할 장치 없음 |
| 활동 보상 구조 평면적 | 글 써도 보이는 보상이 없음. 내 활동이 누적되는 **시각적 자산**이 없음 |
| 비경기 시간대 체류 부족 | 경기 없는 시간엔 들어올 이유가 약함 |

### 해결 방향

영국 지도 위 메타버스 공간 + 팀 활동으로 짓는 경기장 + proximity 채팅 + 유저가 여는 광장 채팅방. 글·댓글이 팀 카르마로 쌓이고, 그 카르마가 **내 프로필의 자랑거리**이자 **팀 경기장 건설의 기여도**가 됨.

---

## 3. 핵심 컨셉

### 3.1 구조 전체 그림

```
🗺️ 영국 월드맵 (오픈, 누구나)
├─ 픽셀아트 영국 지형 (런던/맨체스터/리버풀/뉴캐슬 등)
├─ 아바타들이 돌아다님 (Phaser 씬, Realtime sync)
├─ Proximity 말풍선 채팅 (반경 내 아바타만 보임)
│
├─ 광장 구역 (Plaza) — 각 도시별 정해진 Plot 구역
│    └─ 유저가 100 활동 포인트 소진해서 채팅방 개설
│         ├─ 간판에 방 이름 표시 (예: "K리그 4월 예상")
│         ├─ 완전 공개 — 누구나 Plot 경계 들어가면 채팅 참여
│         └─ 빈 방 자동 소멸 (참여자 0명 + N분 경과)
│
└─ 경기장 건물 (도시별, 팀별)
     ├─ 🏟️ Wembley (기본) — 공용 채팅방 개념, 누구나 입장
     └─ 팀별 경기장 (Emirates, Old Trafford 등)
          ├─ 건설 조건: 해당 팀 기여도 누적 (기존 stadium_level_thresholds 활용)
          ├─ 입장 조건: 해당 팀 팬덤 가입 (1,000점 ~)
          └─ 레벨 10단계: 빈 땅 → 월드클래스 스타디움
```

### 3.2 카르마 & 팬덤 플로우

```
유저가 게시글 작성 (아스날 플레어 선택)
     ↓
stadium_contributions 테이블에 (user_id, arsenal, +10) 기록
     ↓ (동시)
team_stadiums (arsenal).total_points += 10  ← 에미레이츠 건설 진행
user_activity_balance (user_id).spendable_points += 10  ← 채팅방 개설용
     ↓
총 카르마 = SUM(stadium_contributions.points_contributed WHERE user_id=?)
팀별 카르마 = stadium_contributions.points_contributed per team
```

### 3.3 팬덤 가입 임계치

| 가입 순번 | 필요 팀별 누적 점수 |
|---------|------------------|
| 1번째 팀 | 1,000점 |
| 2번째 팀 | 5,000점 |
| 3번째 팀 | 15,000점 |
| 4번째 팀 | 50,000점 |

> 근거: 기존 `stadium_level_thresholds` (1K/5K/15K/40K/100K/...) 패턴 재활용. 3팀 이상은 아주 어렵게 만들어 "한 팀 진성팬" 정체성을 장려.

---

## 4. 성공 지표

### 4.1 핵심 KPI (MVP 런칭 후 6주)

| 지표 | 목표 |
|------|------|
| 월드맵 DAU / 전체 DAU | 30% 이상 |
| 월드맵 평균 세션 길이 | 10분 이상 |
| 채팅방 평균 일일 개설 수 | 10개 이상 |
| 1팀 팬덤 가입자 / 전체 유저 | 40% 이상 |
| D7 재방문율 (월드맵 경험자) | 50% 이상 |
| 글 작성 시 팀 플레어 선택률 | 60% 이상 |

### 4.2 추적 이벤트

- `metaverse:enter` - 월드맵 입장
- `metaverse:move` - 이동 (거리 누적)
- `metaverse:message` - proximity 말풍선 전송
- `chat_room:create` - 채팅방 개설
- `chat_room:enter` - 채팅방 입장
- `fandom:join` - 팬덤 가입
- `stadium:enter` - 팀 경기장 진입
- `flair_points:earned` - 플레어 포인트 적립

---

## 5. 타겟 사용자

### 5.1 핵심 타겟

- 특정 팀 팬덤 성향이 강한 기존 유저
- 글·댓글 활동량이 많지만 "내가 얼마나 글 썼는지" 가시화가 없어 아쉬움을 느끼는 유저
- 경기 전후 체류 의지 있으나 갈 곳 없는 유저

### 5.2 페르소나

**A. "나는 아스날 10년차야"**
- 게시판 주력 활동, 팀 언급 글 많이 씀
- 내 팬덤을 수치·자산으로 증명하고 싶음
- 같은 팬들이 모여있는 공간 원함

**B. "경기 없을 때도 시간 때울 곳"**
- 심심할 때 들러서 누가 있나 보고 싶음
- 가벼운 수다용 채팅방 직접 만들고 싶음

**C. "축구 외 타 스포츠도 조금씩"**
- 여러 팀 팬이지만 주팀은 하나
- 주팀 경기장 1개 + 서브팀 가입 여부 저울질

---

## 6. 제품 범위

### 6.1 MVP (Phase 1~3) — 포함

| 기능 | Phase |
|------|-------|
| 영국 월드맵 + 도시 마커 + 아바타 이동 | P1 |
| 멀티플레이 Realtime Presence (내 주변 아바타 표시) | P1 |
| Proximity 말풍선 채팅 | P1 |
| 게시글 팀 플레어 선택 UI | P2 |
| 플레어 기반 카르마 적립 (`stadium_contributions` 훅) | P2 |
| 프로필 카르마 breakdown (팀별) | P2 |
| 광장 Plot 정의 + 채팅방 개설 UI | P3 |
| 간판 오브젝트 + 텍스트 렌더링 | P3 |
| 채팅방 입장/퇴장 + 단톡 채팅 | P3 |
| 빈 방 자동 소멸 | P3 |
| 팬덤 가입 시스템 (1팀 1,000 / 2팀 5,000 / ...) | P3 |
| Wembley 공용 공간 (누구나 입장) | P1 |

### 6.2 Phase 2+ (제외)

| 기능 | Phase |
|------|-------|
| 팀별 경기장 내부 Phaser 씬 + 레벨별 외관 | P4 |
| 경기 중계 전광판 + 스코어 HUD | P5 |
| 유니폼 구매 + 아바타 외관 변경 | P4 |
| 이모트/리액션 | P4 |
| 모바일 터치 이동 | P4 |
| 신고/뮤트/강퇴 | P4 |
| 시즌 이벤트 / 한정판 간판 | P5+ |
| 비공개 채팅방 / 초대제 | 유보 |
| 경기장 내 Plot (채팅방) | 유보 |

---

## 7. 사용자 시나리오

### 7.1 메인 플로우: 월드맵 산책 + 채팅방 대화

```
1. 유저 로그인 상태에서 GNB "운동장" 또는 헤더의 지도 아이콘 클릭
2. 영국 월드맵 로드 — 기본 캐릭터로 런던 중앙 광장(Wembley 앞) 스폰
3. 주변에 다른 유저 아바타 3~5명 보임, 말풍선 떠있음
4. 화살표 키/WASD로 맨체스터 방향 이동
5. 이동 중 주변 아바타의 말풍선이 시야에 들어옴
6. 맨체스터 광장 도착 → 간판 "멘시티 vs 첼시 예상" 채팅방 보임
7. 간판 앞으로 들어가면 자동으로 그 방 채팅 채널 구독
8. 하단 입력창에 메시지 전송 → 내 아바타 위 말풍선 + 방 채팅 로그에 표시
9. Plot 밖으로 나가면 자동 퇴장
10. Esc → 월드맵 이동 모드 복귀
```

### 7.2 카르마 쌓기 플로우

```
1. 축구 게시판에서 "글쓰기" 클릭
2. 타입 플레어 선택 (정보/잡담/분석/...) — 기존 기능
3. 신규: 팀 플레어 드롭다운에서 "아스날" 선택
4. 글 등록 → 서버에서 stadium_contributions (user, arsenal, +10) 기록
5. 내 프로필의 아스날 카르마 +10, 총 카르마 +10
6. 이 글에 누군가 댓글 달면 그 댓글 작성자에게 (user, arsenal, +1) 기록
7. 마이페이지 → 카르마 탭에서 팀별 breakdown 확인
```

### 7.3 팬덤 가입 + 경기장 진입 플로우

```
1. 내 아스날 카르마가 1,000점 돌파
2. 배지 알림: "🎉 아스날 팬덤 가입 가능!"
3. 월드맵 런던 광장 → 에미레이츠 건물 클릭
4. 입장 모달: "아스날 팬덤에 가입하시겠어요? (활동 포인트 소모 없음, 첫 팀 무료)"
5. [가입] 클릭 → 팬덤 가입 기록 + 에미레이츠 내부 씬 로드
6. 에미레이츠 안: 현재 레벨에 맞는 외관 (레벨 5 예: 중형 경기장) + 입장한 팬들
7. Phase 4에선 내부에서도 proximity 채팅 가능
```

### 7.4 채팅방 개설 플로우

```
1. 런던 광장 빈 Plot 옆에 서서 [방 만들기] 버튼 (UI 오버레이)
2. 모달 오픈: 방 이름 입력 (최대 20자) + 비용 "활동 포인트 100점 소모" 표시
3. 유저의 현재 spendable 포인트 잔액 표시
4. 100점 미만이면 버튼 비활성화 + "글/댓글 더 활동해서 포인트를 모아보세요"
5. [개설] → 서버 검증 후 spendable_points -= 100 & chat_rooms INSERT
6. Plot에 간판 렌더링, 유저가 방장으로 자동 입장
7. 빈 방 2시간 후 자동 소멸 (last_activity_at 기준)
```

---

## 8. 핵심 기능 명세

### 8.1 아바타 & 이동

| 항목 | 값 |
|------|-----|
| 스프라이트 | 32x48 px, 8방향 walk (기존 `docs/AVATAR_SPRITE_8WAY_SPEC.md`) |
| 이동 방식 | 자유 이동 (WASD/화살표). MVP는 픽셀 단위 (그리드 아님) |
| 속도 | 160 px/s (기존 `stadium-chat-scene.ts` 값 유지) |
| 충돌 | 월드 경계 + 경기장 건물 외벽만. 아바타 간 충돌 없음 |
| 애니메이션 | idle + walk 2프레임 (MVP) |
| 카메라 | 내 아바타 follow |

### 8.2 Proximity 채팅

| 항목 | 값 |
|------|-----|
| 가시 반경 | 월드 좌표 기준 400px 이내 아바타 말풍선 보임 |
| 수신 반경 | 동일 — 메시지 수신 시 거리 필터 (클라이언트) |
| 말풍선 표시 시간 | 5초 fade out |
| 최대 글자 | 40자 (월드맵 타이핑) |
| 동시 표시 | 유저당 최신 1개 |
| 전송 쿨다운 | 2초 |
| 채팅 로그 패널 | 없음 (월드맵은 "흘러가는 대화"). 채팅방 안에서만 로그 |

### 8.3 채팅방 (Plot + 간판)

| 항목 | 값 |
|------|-----|
| Plot 크기 | 6x6 타일 (타일=16px → 96x96 월드 px) |
| 최대 인원 | 30명 (정원 초과 시 입장 거부) |
| 개설 비용 | spendable 활동 포인트 **100점** |
| 수명 | 참여자 0명 + **2시간** 경과 → 자동 소멸 |
| 간판 텍스트 | 최대 20자, XSS sanitize, 금칙어 체크 |
| 공개성 | 완전 공개 (비번/초대 없음) |
| 입장 방식 | Plot 경계 진입 시 자동 구독 (물리적 진입) |
| 퇴장 방식 | Plot 밖으로 나가면 자동 구독 해제 |
| 채팅 UI | 하단 입력창 + 우측(또는 하단) 로그 패널 (Plot 내부 전용) |
| 메시지 규칙 | 최대 100자, 3초 쿨다운, XSS sanitize |

### 8.4 광장 Plot 배치

MVP에선 다음 광장에만 Plot 정의:

| 광장 | 위치 | Plot 개수 |
|------|------|-----------|
| 런던 중앙 광장 (Wembley 앞) | 월드맵 남동부 | 10 |
| 맨체스터 광장 | 월드맵 중북부 | 6 |
| 리버풀 광장 | 월드맵 북서부 | 5 |
| 뉴캐슬 광장 | 월드맵 북동부 | 4 |

> 총 25개 Plot. Phase 3에서 튜닝.

### 8.5 팀 플레어 (게시글 신규 필드)

- 기존 `post_flairs` (정보/잡담/분석 ...) **와 별개**
- `posts.flair_team_id` 컬럼 신규 추가 (NULL 허용 = 팀 플레어 미선택)
- UI: 글쓰기 모달에 **타입 플레어 + 팀 플레어 두 개 드롭다운**
- 팀 플레어 선택지 = 커뮤니티별 해당 팀 목록 (football → EPL 11팀)
- 팀 플레어 미선택 시 카르마 적립 안 됨

### 8.6 카르마 시스템

| 액션 | 해당 팀 카르마 증가량 |
|------|---------------------|
| 팀 플레어 게시글 | **+10** |
| 팀 플레어 게시글에 댓글 | **+1** |
| 팀 플레어 베댓 (이번 글의 최고 추천 댓글) | +5 보너스 (Phase 3 후 튜닝) |
| 팀 예측 적중 | **+20** (Phase 3 후 연결, settle.ts 이미 연동됨) |

**Daily cap**: 팀별 **일일 100점 상한** (기존 `daily_point_caps` 패턴 차용).

### 8.7 팬덤 가입

| 항목 | 값 |
|------|-----|
| 가입 조건 | 해당 팀 누적 카르마 ≥ 임계치 |
| 임계치 | 1팀 1K / 2팀 5K / 3팀 15K / 4팀 50K |
| 비용 | 무료 (카르마 소모 없음) |
| 상한 | 평생 최대 4팀 가입 (상한 별도 정책 논의) |
| 탈퇴 | MVP에선 불가 (운영 복잡도 ↓) |

### 8.8 경기장 진입 게이팅

| 경기장 | 진입 조건 |
|------|----------|
| Wembley | 누구나 (공용 공간) |
| Emirates/Old Trafford/... | 해당 팀 팬덤 가입자 |

---

## 9. 기술 아키텍처

### 9.1 스택

| 레이어 | 기술 | 근거 |
|--------|------|------|
| 월드맵 렌더 | **Phaser 4** | 기존 씬 자산 재활용 |
| UI 오버레이 | React 19 + Tailwind | 기존 UI 스택 |
| 실시간 통신 | Supabase Realtime (Presence + Broadcast) | 이미 라이선스 보유, 별도 서버 불필요 |
| 인증 | Clerk → Supabase JWT | 기존 |
| DB | Supabase PostgreSQL | 기존 |
| 에셋 저장 | `public/map/` + Supabase Storage | 기존 |

### 9.2 Phaser 씬 구조

```
WorldMapScene (메인)
  ├─ 영국 지형 타일맵 (tilemap 또는 정적 bg)
  ├─ 아바타 레이어 (나 + 원격 유저 그룹)
  ├─ 광장 Plot 영역 (인비저블 rect + 간판 스프라이트)
  ├─ 경기장 건물 스프라이트 (클릭 → 모달)
  ├─ 카메라 follow + 월드 경계
  └─ 입력 처리 (WASD/화살표)

StadiumInteriorScene (Phase 4)
  ├─ 팀별 경기장 내부 (레벨에 따라 전환)
  ├─ 동일한 아바타 레이어 + 멀티플레이
  └─ Phase 5: 경기 HUD 오버레이
```

> 기존 `stadium-chat-scene.ts`를 `WorldMapScene`의 베이스로 확장. 현재 placeholder 아바타를 실제 스프라이트로 교체, 멀티플레이 sync 로직 추가.

### 9.3 Supabase Realtime 채널 설계

```
channel: metaverse:world
  Presence (나 + 모든 접속자):
    - track: { userId, nickname, avatarId, x, y, direction, chatRoomId? }
    - 위치는 200ms 디바운스로 업데이트 (과부하 방지)
  Broadcast:
    - event: "chat:world" → { userId, nickname, x, y, text, timestamp }
    - 수신 측에서 거리 계산해 말풍선 표시 여부 결정

channel: metaverse:chat:{roomId}
  Presence (해당 방 구독자):
    - track: { userId, nickname }
  Broadcast:
    - event: "chat:room" → { userId, nickname, text, timestamp }
    - 로그 패널에 표시 (거리 필터 없음)
```

**동시 접속 설계**:
- 월드 채널은 **지역별로 분할** 고려 (예: metaverse:world:london). MVP는 단일 채널로 시작, 50명 넘어가면 분할.
- Supabase 무료 티어 기준 동시 200 연결 — 초기 OK.

### 9.4 위치 동기화 전략

- 내 위치를 200ms 간격으로 Presence track 업데이트
- 원격 아바타는 linear interpolation으로 부드럽게 이동 (lag 숨김)
- 이동 종료 시 최종 위치 전송 + direction stop

---

## 10. 데이터 모델

### 10.1 재사용 (기존)

| 테이블 | 역할 |
|--------|------|
| `team_map_pins` | 팀 마스터 데이터 (100+ 팀 seeded) |
| `team_stadiums` | 팀별 경기장 레벨/포인트 |
| `stadium_contributions` | **유저×팀 카르마 원천 테이블** |
| `stadium_level_thresholds` | 레벨 임계치 (팬덤 가입에도 재활용) |
| `stadium_investments` | 카르마 증가 감사 로그 |
| `post_flairs` | 타입 플레어 (정보/잡담/분석) — 유지 |
| `profiles` | 닉네임/아바타 연동 |

### 10.2 신규 테이블

#### `posts.flair_team_id` (컬럼 추가)
```sql
ALTER TABLE posts ADD COLUMN flair_team_id TEXT NULL REFERENCES team_map_pins(team_id);
CREATE INDEX idx_posts_flair_team ON posts(flair_team_id) WHERE flair_team_id IS NOT NULL;
```

#### `user_activity_balance`
Spendable 활동 포인트 (카르마와 별개).

```sql
CREATE TABLE user_activity_balance (
  user_id TEXT PRIMARY KEY REFERENCES profiles(user_id),
  spendable_points INT NOT NULL DEFAULT 0 CHECK (spendable_points >= 0),
  lifetime_earned INT NOT NULL DEFAULT 0,  -- 참조용
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

> 카르마 적립 시 `stadium_contributions.points_contributed` + `user_activity_balance.spendable_points` 동시 증가.

#### `user_fandom_memberships`
팬덤 가입 목록.

```sql
CREATE TABLE user_fandom_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES profiles(user_id),
  team_id TEXT NOT NULL REFERENCES team_map_pins(team_id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  joined_with_points_at INT NOT NULL,  -- 가입 당시 팀별 카르마 (감사용)
  UNIQUE(user_id, team_id)
);
CREATE INDEX idx_fandom_user ON user_fandom_memberships(user_id);
CREATE INDEX idx_fandom_team ON user_fandom_memberships(team_id);
```

#### `world_plots`
월드맵 광장 Plot 정의 (정적 seed).

```sql
CREATE TABLE world_plots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaza_name TEXT NOT NULL,  -- '런던 광장', '맨체스터 광장'
  x INT NOT NULL,  -- 월드 좌표
  y INT NOT NULL,
  width INT NOT NULL DEFAULT 96,
  height INT NOT NULL DEFAULT 96,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `chat_rooms`
유저 생성 채팅방.

```sql
CREATE TABLE chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id UUID UNIQUE REFERENCES world_plots(id),  -- 1 Plot = 1 Room
  owner_user_id TEXT NOT NULL REFERENCES profiles(user_id),
  sign_text VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ NULL
);
CREATE INDEX idx_chat_rooms_plot ON chat_rooms(plot_id) WHERE closed_at IS NULL;
CREATE INDEX idx_chat_rooms_cleanup ON chat_rooms(last_activity_at) WHERE closed_at IS NULL;
```

### 10.3 신규 RPC 함수

#### `award_flair_karma(user_id, team_id, points, source)`
카르마 적립 + spendable 증가. 기존 `sync_stadium_contribution()` 확장 or 병합.

```sql
-- 의사 코드
BEGIN
  -- daily cap 체크 (팀별)
  IF daily_team_cap_reached(user_id, team_id) THEN RETURN; END IF;

  -- stadium_contributions 업데이트
  INSERT INTO stadium_contributions ... ON CONFLICT DO UPDATE SET points_contributed = points_contributed + points;

  -- team_stadiums.total_points 증가 (기존 sync 로직)
  UPDATE team_stadiums SET total_points = total_points + points WHERE team_id = ...;

  -- spendable balance 증가
  INSERT INTO user_activity_balance (user_id, spendable_points, lifetime_earned)
    VALUES (user_id, points, points)
    ON CONFLICT (user_id) DO UPDATE SET
      spendable_points = spendable_points + points,
      lifetime_earned = lifetime_earned + points;

  -- 레벨 재계산 (기존 로직)
  PERFORM recalc_stadium_level(team_id);
END;
```

#### `spend_activity_points(user_id, amount, purpose)`
방 개설 등 소비 시.

```sql
BEGIN
  UPDATE user_activity_balance
    SET spendable_points = spendable_points - amount
    WHERE user_id = user_id AND spendable_points >= amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient balance'; END IF;
END;
```

#### `cleanup_empty_chat_rooms()`
크론 (30분 간격): 2시간 이상 비어있는 방 close.

---

## 11. API 설계

### 11.1 신규 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/metaverse/presence` | 월드맵 접속자 스냅샷 (SSR 초기 로드용) |
| GET | `/api/metaverse/plots` | 광장 Plot + 현재 개설된 채팅방 목록 |
| POST | `/api/metaverse/chat-rooms` | 채팅방 개설 (`plot_id`, `sign_text`) |
| DELETE | `/api/metaverse/chat-rooms/:id` | 방장 수동 삭제 (spendable 반환 없음) |
| GET | `/api/fandoms/my` | 내 팬덤 가입 현황 |
| POST | `/api/fandoms/join` | 팬덤 가입 (`team_id`) |
| GET | `/api/karma/:userId` | 유저 카르마 breakdown (팀별 + 합계) |
| GET | `/api/activity-balance/me` | 내 spendable 포인트 |

### 11.2 기존 훅 확장

| 위치 | 변경 |
|------|------|
| `POST /api/posts` (글쓰기) | `flair_team_id` 저장 + `award_flair_karma` 호출 (+10) |
| `POST /api/comments` | 부모 글의 `flair_team_id` 확인 후 `award_flair_karma` 호출 (+1) |
| `lib/betman/settle.ts` | 기존 로직 유지 (예측 적중 → +20) |

---

## 12. Phase 로드맵

### Phase 1 — 월드맵 기반 (3주)

**목표**: 혼자 아닌 공간 느낌. "내가 여기 있고, 저기 누가 지나감"

- [ ] UK 픽셀맵 에셋 확정 (외주 or PixelLab) — 1280x960 이상
- [ ] 아바타 스프라이트 8방향 × 3프레임 × 3~5종 (PixelLab)
- [ ] `WorldMapScene` 구현 (기존 scene 확장)
- [ ] `profiles` → 기본 아바타 random 할당
- [ ] Supabase Realtime Presence 연결 (위치 sync)
- [ ] Proximity 말풍선 채팅 (Broadcast + 거리 필터)
- [ ] 월드맵 진입 라우트 `/world` (또는 기존 `/stadium` 재활용)
- [ ] Wembley 건물 배치 (건설 레벨 10 = 이미 완공)
- [ ] 간단 온보딩 튜토리얼 ("WASD로 이동, Enter로 채팅")

### Phase 2 — 팀 플레어 + 카르마 (2주)

**목표**: 글 하나 쓰면 내 팀 경기장이 실제로 올라감

- [ ] `posts.flair_team_id` 마이그레이션
- [ ] 글쓰기 UI에 팀 플레어 드롭다운 추가
- [ ] 댓글 작성 시 부모 글 flair 체크 후 적립 훅
- [ ] `user_activity_balance` 테이블 + RPC 신규
- [ ] `award_flair_karma()` RPC
- [ ] 프로필 페이지 카르마 탭 (팀별 breakdown + 총합)
- [ ] daily cap 로직 (팀별 100점/일)

### Phase 3 — 채팅방 + 팬덤 가입 (2주)

**목표**: 광장에 사람 모이고, 팀 소속 증명 가능

- [ ] `world_plots` seed (25개 Plot, 광장별 좌표)
- [ ] 간판 스프라이트 에셋
- [ ] `chat_rooms` 테이블 + API
- [ ] Plot 진입 시 자동 채널 구독 (Phaser + React 연동)
- [ ] 채팅방 개설 UI (비용 검증 + 모달)
- [ ] 채팅방 내부 UI (로그 패널 + 입력)
- [ ] 빈 방 자동 소멸 크론
- [ ] `user_fandom_memberships` + API
- [ ] 경기장 진입 게이팅 (Wembley 제외한 팀 경기장은 가입 체크)

### Phase 4 — 경기장 내부 + 유니폼 (3주, 분리 가능)

- [ ] `StadiumInteriorScene`
- [ ] 경기장 레벨별 외관 에셋 (빈 땅 → 월드클래스)
- [ ] 경기장 내부 proximity 채팅
- [ ] 유니폼 착용 (`pixel_art_items` 재활용)

### Phase 5 — 경기 중계 연동 (2주, 미래)

- [ ] 경기 시간대 팀 경기장 자동 "활성화"
- [ ] 전광판 + 스코어 HUD
- [ ] `PRD-live-room.md`의 핵심 기능 흡수 완료

---

## 13. 에셋 요구사항

### 13.1 필수 (Phase 1)

| 에셋 | 수량 | 사양 | 소스 |
|------|------|------|------|
| UK 월드맵 배경 | 1 | 1280x960 px 픽셀아트, 지형 + 도시 스팟 | 외주 or PixelLab |
| 기본 아바타 스프라이트 | 3~5종 | 32x48 px, 8방향 x 3프레임 = 24프레임/종 | PixelLab |
| Wembley 건물 | 1 | 96x128 px | PixelLab |
| 경기장 건물 스프라이트 (레벨 1~10) | 10 단계 | 레벨별 프리뷰용 | Phase 4에서 |
| 간판 스프라이트 | 1 | 32x48 px, 텍스트 오버레이용 | PixelLab |
| 말풍선 프레임 | 1 | 9-patch CSS | 자체 구현 |
| 광장 바닥 타일 | 2~3종 | 16x16 px | PixelLab |

### 13.2 제작 전략

- **PixelLab MCP 적극 활용** (이 환경에 이미 연결됨)
- 초기 프로토타입은 플레이스홀더 (색상 도형)로 완성 → 기능 검증 후 에셋 투입
- 간판 텍스트는 동적 렌더 (Phaser BitmapText)

---

## 14. 엣지 케이스

### 14.1 연결

| 케이스 | 처리 |
|--------|------|
| 새로고침 | Presence 재등록, 마지막 위치 복원 (5초 grace) |
| 탭 백그라운드 | 30초 후 "자리비움" 표시 (말풍선 회색) |
| 네트워크 단절 | Supabase 자동 재연결. 10초 timeout 후 untrack |
| 동시 탭 | 같은 유저 중복 접속 거부 (1유저 1아바타) |

### 14.2 채팅

| 케이스 | 처리 |
|--------|------|
| 빈 메시지 | 클라이언트 차단 |
| 한도 초과 | 클라이언트에서 잘라냄 |
| 도배 | 2초 쿨다운 (월드) / 3초 (방) |
| XSS | DOMPurify (서버 + 클라이언트) |
| 금칙어 | Phase 3에서 filter 테이블 기반 |

### 14.3 카르마

| 케이스 | 처리 |
|--------|------|
| 본인 글에 본인 댓글 | 적립 제외 |
| 삭제된 글 | 해당 글 카르마 **소급 회수하지 않음** (MVP 정책 — 단순화) |
| 여러 팀 플레어 변경 | 플레어 바꾸면 과거 카르마는 그대로 (첫 플레어 기준 고정) |
| 일일 cap 초과 | award_flair_karma가 no-op 처리 |

### 14.4 채팅방

| 케이스 | 처리 |
|--------|------|
| Plot 점유 시도 시 다른 유저가 선점 | "이미 사용 중" 에러, 포인트 차감 없음 |
| 방장이 나갔을 때 | 방은 유지 (last_activity 기반 소멸만) |
| 30명 정원 초과 | 입장 거부 토스트 |
| 간판 텍스트 악의적 | Phase 3에서 신고/모더레이션 |

---

## 15. 비기능 요구사항

### 성능
- 월드맵 초기 로드 3초 이내
- 아바타 이동 60fps (Phaser 기본)
- 50명 동시 월드 접속 시 평균 메시지 전송 지연 < 500ms
- 위치 업데이트 200ms 간격 → 초당 0.25 msg/user → 50명 = 12.5 msg/s (여유)

### 안정성
- Realtime 자동 재연결
- Presence heartbeat로 좀비 정리
- 빈 방 청소 크론 (30분 간격)

### 보안
- Clerk 인증 필수
- 채팅방 생성 API에 rate limit (1분에 1방)
- 플레어 카르마 적립은 서버 측 검증 (클라이언트 변조 방지)
- 포인트 차감은 트랜잭션 + CHECK 제약

### 확장성
- 월드 채널 분할 지점: 50명 초과 시 지역별 (런던/맨체스터/...)
- Plot 개수 늘어나면 채널 수도 비례 증가 — 모니터링 필요

---

## 16. 오픈 이슈

| 이슈 | 선택지 | 제안 |
|------|--------|------|
| 3번째 팀 이상 임계치 | 15K/50K/... vs 상한 제거 | 15K/50K (4팀까지), 5팀부터는 가입 불가 |
| 팀 플레어 변경 가능? | 변경 가능 / 최초 고정 | MVP는 변경 가능, 과거 카르마는 그대로 |
| 글 삭제 시 카르마 회수 | 회수 / 미회수 | **미회수** (단순화, 악용 악화 여지 낮음) |
| 베댓 보너스 | 구현 / 유보 | Phase 2 후 데이터 보고 결정 |
| 예측 적중 카르마 연동 | 자동 연동 / 옵션 | **자동 연동** (기존 settle.ts 훅 활용) |
| Wembley 의미 | 잉글랜드 국대 팬용 vs 공용 광장 | **공용 광장** (신규 유저 랜딩 지점) |
| 모바일 대응 | MVP 포함 / Phase 4 | Phase 4 (월드맵이 공간감 중심이라 모바일 UX 설계 별도) |
| 방 이름 금칙어 | 키워드 필터 / 신고 기반 | MVP는 간단 키워드 + Phase 3에서 신고 |
| 아바타 커스터마이즈 | MVP 포함 / Phase 4 | Phase 4 (유니폼과 묶어서) |

---

## 17. 수용 기준 (Acceptance Criteria)

**AC-01** 유저가 월드맵 진입 시 아바타로 런던 광장에 스폰된다.

**AC-02** WASD/화살표로 이동할 수 있고, 내 아바타가 카메라 중앙에 유지된다.

**AC-03** 다른 유저의 아바타가 실시간으로 보이고, 이동이 부드럽게 렌더링된다.

**AC-04** Enter 후 메시지 전송 시 내 아바타 위 말풍선이 5초 표시되고, 반경 400px 이내 유저에게만 보인다.

**AC-05** 축구 게시글 작성 시 팀 플레어 선택이 가능하며, 선택 시 해당 팀 카르마 +10이 적립된다.

**AC-06** 팀 플레어 게시글에 댓글 달면 댓글 작성자의 해당 팀 카르마가 +1 적립된다.

**AC-07** 프로필 페이지에서 팀별 카르마 breakdown + 총 카르마를 확인할 수 있다.

**AC-08** 해당 팀 카르마가 1,000점 이상이면 팬덤 가입 버튼이 활성화되고, 가입 후 해당 팀 경기장 진입이 가능하다.

**AC-09** 2번째 팀 가입은 해당 팀 카르마가 5,000점 이상이어야 가능하다.

**AC-10** 광장 Plot 근처에서 [방 만들기] 버튼을 눌러 100 활동 포인트 소진 후 간판과 방이 생성된다.

**AC-11** Plot 경계 안에 들어가면 자동으로 그 방 채팅 채널에 구독된다.

**AC-12** 참여자 0명 상태가 2시간 지나면 방이 자동 소멸된다.

**AC-13** Wembley는 팬덤 가입 없이도 입장 가능하다.

---

## 18. 리스크 & 대응

| 리스크 | 완화 방안 |
|--------|----------|
| Supabase Realtime 비용 폭증 | 동접 모니터링, 50명 초과 시 지역 채널 분할, 위치 업데이트 쓰로틀링 |
| 아바타 에셋 지연 | Phase 1은 플레이스홀더 도형으로 진행, 에셋은 별도 트랙 |
| "사람 없는 유령도시" | Wembley 기본 랜딩 + 광장 Plot 초기 시드로 허수아비(NPC) 간판 1~2개 배치 |
| 카르마 어뷰징 (자가 글/댓글) | 본인 글 본인 댓글 제외 + daily cap + 서버 검증 |
| 과도한 채팅방 생성 | 개설 비용 100점 + 빈 방 자동 소멸 + 유저당 rate limit |
| 바람의 나라 기대치 > 실제 | 레퍼런스 문구로 기대 세팅, MVP는 "공간형 채팅"이 핵심이라 소통 |

---

## 19. 관련 문서

- `docs/PRD-live-room.md` — 경기 중계 관련 요구사항. Phase 5에서 흡수.
- `docs/AVATAR_SPRITE_8WAY_SPEC.md` — 스프라이트 제작 가이드.
- `docs/pixel-hero-avatar-uniform-guide.md` — 유니폼 시스템 (Phase 4).
- `docs/COMMUNITY_STRATEGY.md` — F15 "경기장 시즌 이벤트" 연계.
- `supabase/migrations/052_create_points_and_titles.sql` — 기존 포인트 시스템.
- `supabase/migrations/060_post_flairs.sql` — 기존 타입 플레어.
- `supabase/migrations/20260401_team_stadium_system.sql` — 기존 경기장 DB.
- `lib/stadium/game/scenes/stadium-chat-scene.ts` — 기존 Phaser 씬.

---

## 20. 다음 액션

1. **이 문서 리뷰 + 오픈 이슈 결정** (16번 섹션)
2. **에셋 발주** (UK 맵 + 아바타 3종) — Phase 1 시작 전 필수
3. **Phase 1 스프린트 플랜** (3주, 세부 작업 쪼개기)
4. **DB 마이그레이션 드래프트** (10.2 신규 테이블)
5. **PixelLab 테스트 생성** (아바타 프로토타입 3종)

> **작성자 노트 (Claude)**: 기존 DB 자산(stadium_contributions, team_map_pins, stadium_level_thresholds, post_flairs, daily_point_caps)이 예상보다 훨씬 풍부해서 신규 스키마는 최소화할 수 있습니다. 대부분의 코드 복잡도는 **Phaser 씬 확장 + Realtime sync + UI 오버레이**에 집중됩니다. 에셋이 병목이 될 가능성이 가장 높으니, Phase 1 시작과 동시에 에셋 트랙 병행 필수.
