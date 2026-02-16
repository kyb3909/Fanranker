# Snake Draft Game - Product Requirements Document (PRD)

**Version:** 1.0
**Last Updated:** 2026-02-07
**Status:** In Development

---

## 1. Product Overview

### 1.1 Product Name
**Snake Draft** - 실시간 멀티플레이어 스네이크 드래프트 게임

### 1.2 Product Summary
Snake Draft는 4명의 플레이어가 실시간으로 접속하여 다양한 카테고리의 캐릭터/선수를 스네이크 드래프트 방식으로 선발하고, 최종 팀 구성에 대해 참여자 및 관람자가 투표할 수 있는 웹 기반 게임 플랫폼입니다.

### 1.3 Target Users
- 스포츠 팬 (축구, 농구 등)
- 애니메이션/만화 팬 (슬램덩크 등)
- K-POP 팬
- 역사/전략 게임 팬 (삼국지 등)
- 친구들과 함께 캐주얼하게 즐기는 유저

### 1.4 Core Value Proposition
- 다양한 카테고리의 드래프트를 한 플랫폼에서 즐길 수 있음
- 실시간 멀티플레이어 경쟁
- 드래프트 후 투표를 통한 커뮤니티 참여
- 통계 기반 몸값 변동 시스템

---

## 2. Game Modes

### 2.1 게임 모드 확장 원칙
- 게임 모드는 **지속적으로 확장** 가능한 구조로 설계
- 각 게임 모드는 **독립적인 규칙 설정**을 가짐 (픽 수, 예산, 포지션 등)
- 새로운 게임 모드 추가 시 규칙 설정만으로 바로 적용 가능

### 2.2 게임별 규칙 설정 (Game Config)
각 게임 모드를 개설할 때 아래 항목을 개별적으로 설정합니다.

| 설정 항목 | 설명 | 예시 |
|----------|------|------|
| `totalPicks` | 총 픽 수 (팀당 선발 인원 x 4) | 12, 20, 28 |
| `picksPerTeam` | 팀당 선발 인원 | 3, 5, 7 |
| `budget` | 팀당 예산 | 15, 30, 50 |
| `positions` | 해당 게임에서 사용하는 포지션 목록 | ["FW","MF","DF","GK"], ["PG","SG","SF","PF","C"] |
| `timerSeconds` | 턴당 제한 시간 (초) | 30, 45, 60 |
| `salaryRange` | 선수 몸값 범위 | { min: 1, max: 10 } |

```typescript
type GameConfig = {
  id: string
  name: string
  description: string
  category: string
  icon: string
  totalPicks: number
  picksPerTeam: number
  budget: number
  positions: string[]
  timerSeconds: number
  salaryRange: { min: number; max: number }
  players: Player[]
}
```

### 2.3 현재 게임 모드 목록

총 8개의 게임 모드를 기본 제공하며, 지속적으로 추가됩니다.

| 모드 ID | 모드 이름 | 설명 | 카테고리 |
|---------|----------|------|---------|
| `epl` | EPL 드래프트 | 프리미어리그 최고의 선수들 | 스포츠 |
| `soccer` | 축구 선수 드래프트 | 세계 최고의 축구 선수들 | 스포츠 |
| `slam-dunk` | 슬램덩크 드래프트 | 북산고 vs 산왕공고 | 애니메이션 |
| `idol` | 아이돌 드래프트 | K-POP 스타 선발전 | 엔터테인먼트 |
| `nba` | NBA 드래프트 | 현역 NBA 올스타 | 스포츠 |
| `nba-legend` | NBA 레전드 드래프트 | 역대 최고의 전설들 | 스포츠 |
| `korea` | 한국 국가대표팀 드래프트 | 태극전사 선발전 | 스포츠 |
| `three-kingdoms` | 삼국지 드래프트 | 역사 속 영웅 장수들 | 역사/전략 |

---

## 3. Core Mechanics

### 3.1 Snake Draft System
- 4개 팀이 참여하는 스네이크 드래프트 방식
- 드래프트 순서: `1 → 2 → 3 → 4 → 4 → 3 → 2 → 1 → 1 → 2 → 3 → 4`
- 매 라운드마다 순서가 반전되어 공정성 보장
- 총 12픽 (팀당 3명)

### 3.2 Timer System
- 각 턴마다 **30초** 타이머 적용
- 타이머 바가 실시간으로 감소하며 애니메이션 표시
- **10초 이하**: 주황색 경고
- **5초 이하**: 빨간색 긴급 경고 + 깜빡임 애니메이션
- 시간 초과 시: 예산 범위 내에서 **랜덤 선수 자동 선발** 후 다음 턴으로 이동

### 3.3 Budget System
- 각 팀은 **$50** 예산으로 시작
- 선수 몸값 범위: **1 ~ 10**
- 예산 초과 시 해당 선수 선발 불가
- 예산이 부족할 경우 화면 내 토스트 알림으로 안내

### 3.4 Drag & Drop
- `@dnd-kit/core` 라이브러리 사용
- 오른쪽 선수 목록에서 왼쪽 팀 보드로 드래그하여 선발
- 드래그 오버레이: 약간의 회전(3도) + 투명도 80%
- 현재 턴이 아닌 팀에 드롭 시 토스트 알림 표시 (브라우저 alert 아님)

---

## 4. Player Card Specification

### 4.1 Card Layout
```
+---------------------------+
| [포지션]         [몸값]    |  <- 상단 행: 같은 높이 고정, flex justify-between
|                           |
|                           |
|                           |
|        [배경 사진]         |  <- 카드 전체가 배경 이미지 (세로 직사각형)
|                           |
|                           |
|                           |
|   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   |  <- 하단 그라데이션 오버레이
|        [이름]             |  <- 중앙 정렬
+---------------------------+
```

### 4.2 Card Properties
- **비율**: 3:4 세로 직사각형 (aspect-[3/4]), 베이스볼 카드 스타일
- **배경**: 선수 이미지가 카드 전체 배경
- **테두리**: 2px 검은색 (border-2 border-black)
- **포지션 배지**: 왼쪽 상단, 투명 배경, 흰색 글자, 검은색 굵은 테두리 (2px), 10px 폰트, drop-shadow 적용
- **몸값 표시**: 오른쪽 상단, 투명 배경, 흰색 글자, 검은색 굵은 테두리 (2px), 10px 폰트, 숫자만 (1~10, M 없음), drop-shadow 적용
- **이름**: 하단 중앙, 흰색 텍스트, 그라데이션 오버레이 위
- **그리드 배치**: 한 열에 3개 (grid-cols-3)

### 4.3 Player Data Fields
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | 고유 식별자 |
| `name` | string | 선수 이름 |
| `position` | string | 포지션 (FW, MF, DF, GK, PG, SG, SF, PF, C) |
| `rating` | number | 능력치 (내부용, UI 미표시) |
| `salary` | number | 몸값 (1~10) |
| `image` | string? | 프로필 이미지 URL (optional) |

---

## 5. Page Structure

### 5.1 메인 페이지 (`/`)
- **헤더**: 좌측 로고 + 우측 Live Draft 뱃지, 높이 h-16 (일반 웹사이트 수준)
- **게임 모드 그리드**: 반응형 그리드 (2열, sm:3열, lg:4열, xl:5열)
- 각 카드: 베이스볼 카드 스타일 세로 직사각형 (aspect-[3/4])
  - 상단 영역: 그라데이션 배경 + 모드 아이콘
  - 하단 오버레이: 진행 중 게임 수 (녹색 점) + 대기 인원 수
  - 하단 영역: 모드 이름 + 설명 + "시작하기" 버튼
  - 통계 바로가기 아이콘 (우측 상단)

### 5.2 드래프트 게임 페이지 (`/draft/[mode]`)
- **헤더**: 로고(홈으로 링크) + Live Draft 뱃지
- **드래프트 순서 바**: 12개 픽 순서 표시 + 타이머
- **메인 레이아웃**: 2열 (팀 보드 영역 | 선수 목록)
  - **왼쪽**: 4개 팀 보드 (2x2 그리드), 내 팀은 좌측 상단 고정 (미래 멀티플레이어)
  - **오른쪽**: 선수 목록 패널 (sticky, 스크롤 가능)

### 5.3 선수 목록 패널
- **검색창**: 선수 이름 검색
- **포지션 필터**: 드롭다운 (모든 포지션 / 각 포지션)
- **가격 필터**: 드롭다운 (모든 가격 / 저가 1-5 / 중가 6-7 / 고가 8-10)
- **필터 초기화 버튼**: 필터가 적용된 경우에만 표시
- **선수 카드 그리드**: 3열, 정사각형 카드

### 5.4 드래프트 결과 페이지 (드래프트 완료 시 자동 전환)
- 드래프트 완료 후 자동으로 결과 페이지 표시
- **투표 방식**: 각 팀 카드를 클릭하여 투표 (별도 버튼 없음)
- 투표 후 자동 스크롤 없음 (현재 위치 유지)
- 표시 정보: 팀 이름, 선발된 선수 목록 (이름, 포지션, 몸값), 득표 결과
- 통계 정보 없음 (평균 능력, 지출 등 제거)
- "새로운 드래프트 시작" 버튼

### 5.5 통계 페이지 (`/stats/[mode]`)
- 게임 모드별 선수 드래프트 통계
- **정렬 옵션**: 평균 픽 순위 / 드래프트 비율 / 현재 몸값
- **테이블 컬럼**:
  - 순위
  - 선수 (이름 + 드래프트 횟수)
  - 포지션
  - 평균 드래프트 순위
  - 드래프트율 (%)  + 프로그레스 바
  - 현재 몸값
  - 몸값 변동 (상승/하락/유지 아이콘)
- **통계 설명 섹션**: 각 지표에 대한 설명

---

## 6. Statistics & Economy System

### 6.1 Average Draft Position (ADP)
- 각 드래프트에서 선수가 선발된 픽 순위의 평균
- 드래프트되지 않은 경우: `마지막 픽 순위 + 1` (예: 12픽 드래프트에서 13)
- 계산식: `총 선발 픽 합계 / 선발 횟수`

### 6.2 Draft Rate
- 전체 드래프트 중 해당 선수가 선발된 비율
- 계산식: `(선발 횟수 / 총 드래프트 수) * 100`

### 6.3 Salary Adjustment (몸값 변동)
- **조건**: 3경기 이상 진행된 이후 적용
- **인상 조건**:
  - ADP 1~2위: +2 (최대 15)
  - ADP 3~4위: +1 (최대 15)
- **하락 조건**:
  - ADP 10위 이하: -1 (최소 3)
- 변동 표시: TrendingUp (녹색) / TrendingDown (빨간) / Minus (회색) 아이콘
- 매달 조정 (서버 사이드 구현 시)

### 6.4 Data Storage
- 현재: `localStorage` 기반 (`snake-draft-history` 키)
- 향후: 데이터베이스 (Supabase) 마이그레이션 예정
- 저장 데이터 구조:
  ```typescript
  type DraftRecord = {
    playerId: string
    pickPosition: number
    timestamp: number
  }
  type GameHistory = {
    mode: string
    totalDrafts: number
    records: DraftRecord[]
  }
  ```

---

## 7. UI/UX Design System

### 7.1 Color Palette
- **배경**: oklch(0.98 0 0) - 밝은 회색
- **카드**: oklch(1 0 0) - 흰색
- **Primary/Accent**: oklch(0.45 0.15 250) - 블루
- **텍스트**: oklch(0.15 0 0) - 다크
- **Muted**: oklch(0.5 0 0) - 회색
- **Border**: oklch(0.9 0 0) - 연한 회색
- 팀 컬러: 그레이 톤 그라데이션 (slate, gray, zinc, stone)

### 7.2 Typography
- **Primary Font**: Geist (sans-serif)
- **Mono Font**: Geist Mono
- **Heading**: font-black, tracking-tight
- **Body**: font-semibold

### 7.3 Component Patterns
- **카드**: rounded-2xl, border border-border, shadow-lg on hover
- **배지**: rounded-lg/rounded-full, bg-secondary
- **버튼**: rounded-lg, border, hover:border-primary
- **Toast 알림**: 화면 상단 중앙, fade-in + slide-in 애니메이션, 3초 후 자동 사라짐

### 7.4 Responsive Breakpoints
- `sm`: 640px (2열 그리드)
- `md`: 768px (2열 팀 보드)
- `lg`: 1024px (3열 게임 모드, 팀보드+선수목록 분리)
- `xl`: 1280px (4열 게임 모드)

---

## 8. Future Features (Planned)

### 8.1 실시간 멀티플레이어 (Supabase 필요)
- **로비 시스템**: 4명이 모일 때까지 대기
- **내 팀 고정**: 로그인한 유저의 팀이 항상 좌측 상단
- **대기열 시스템**: 게임 진행 중 접속한 유저는 대기열에 추가, 순차적으로 자리 배정
- **실시간 동기화**: 드래프트 진행 상태가 모든 참가자에게 실시간 반영

### 8.2 채팅 시스템
- 게임 진행 중 + 대기 중 채팅
- 참가자 및 관람자 모두 사용 가능
- 실시간 메시지 전송/수신

### 8.3 관전 모드
- 드래프트 진행을 실시간으로 관전
- 관전자도 드래프트 완료 후 투표 참여 가능

### 8.4 추가 예정 게임 모드
- 커스텀 드래프트 모드 (유저가 직접 선수 목록 생성)
- 시즌별 업데이트 (선수 추가/제거, 능력치 변동)

---

## 9. Technical Architecture

### 9.1 Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Drag & Drop**: @dnd-kit/core
- **Icons**: Lucide React
- **State Management**: React useState/useEffect
- **Data Storage**: localStorage (현재) → Supabase (향후)

### 9.2 File Structure
```
app/
  page.tsx                    # 메인 페이지 (게임 모드 선택)
  layout.tsx                  # 루트 레이아웃
  globals.css                 # 전역 스타일 + 디자인 토큰
  draft/[mode]/page.tsx       # 드래프트 게임 페이지
  stats/[mode]/page.tsx       # 통계 페이지
components/
  team-board.tsx              # 팀 보드 컴포넌트
  player-card.tsx             # 선수 카드 컴포넌트
  player-pool.tsx             # 선수 목록 패널 (검색/필터)
  draft-order.tsx             # 드래프트 순서 + 타이머
  draft-results.tsx           # 드래프트 결과 + 투표
lib/
  draft-history.ts            # 드래프트 기록 저장/조회/통계 계산
```

### 9.3 Route Map
| Route | Description | Type |
|-------|-------------|------|
| `/` | 게임 모드 선택 메인 페이지 | Client Component |
| `/draft/[mode]` | 드래프트 게임 진행 | Client Component |
| `/stats/[mode]` | 게임 모드별 통계 | Client Component |

---

## 10. Constraints & Limitations

### 10.1 Current Limitations
- 현재 단일 기기 전용 (멀티플레이어 미지원)
- 데이터가 localStorage에 저장되어 기기 간 공유 불가
- 선수 이미지는 placeholder 사용
- AI 자동 선발은 단순 랜덤 (전략적 AI 미적용)

### 10.2 Dependencies
- 멀티플레이어 기능: Supabase Realtime 통합 필요
- 실제 선수 이미지: 이미지 에셋 또는 API 연동 필요
- 인증 시스템: Supabase Auth 또는 커스텀 인증 필요
