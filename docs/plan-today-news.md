# 오늘의 단신 — 프론트엔드 디자인 (Mock Data)

## Context

사용자가 Reddit 서브레딧의 인기 스포츠 뉴스를 크롤링 → LLM 3줄 요약 → 채팅형 토론방 기능을 기획 중. **프론트엔드 UI를 먼저 Mock 데이터로 만들어** 디자인을 확인한 뒤, 이후 백엔드(VPS 크롤링 + LLM + DB)를 붙이는 전략.

---

## 페이지 구조

### 1. 뉴스 목록 (`/news`)
- 3-column 그리드 (기존 피드와 동일 레이아웃)
- 상단: "오늘의 단신 - X월 X일" 헤더
- 종목 탭 필터: 전체 / ⚽축구 / ⚾야구 / 🏀농구 / 🏐배구 / 🎮e스포츠
- 뉴스 카드 리스트 (컴팩트 포맷)

### 2. 뉴스 토론방 (`/news/[id]`)
- **채팅형 UI** (카카오톡/디스코드 느낌)
- 상단: 뉴스 요약 카드 (접기 가능)
- 중간: 채팅 메시지 영역 (스크롤, 아래가 최신)
- 하단: 메시지 입력창 (고정)
- 사이드바 없음, 좁은 레이아웃 (`max-w-[780px]`)

---

## 신규 파일 목록

| 파일 | 설명 |
|------|------|
| `lib/types/news.ts` | NewsBrief, NewsMessage 타입 정의 |
| `lib/mock/news-data.ts` | Mock 뉴스 + 채팅 데이터 |
| `components/news/news-card.tsx` | 뉴스 카드 (제목+요약+메타) |
| `components/news/news-list-client.tsx` | 뉴스 목록 클라이언트 (탭필터+카드리스트) |
| `components/news/chat-message.tsx` | 채팅 메시지 버블 (내/상대 구분) |
| `components/news/news-discussion-client.tsx` | 토론방 클라이언트 (채팅 UI) |
| `app/news/page.tsx` | 뉴스 목록 페이지 (서버 컴포넌트 셸) |
| `app/news/[id]/page.tsx` | 뉴스 토론방 페이지 |
| `app/news/layout.tsx` | 뉴스 레이아웃 (패스스루) |

## 수정 파일

| 파일 | 변경 |
|------|------|
| `components/header.tsx` | nav에 📰단신 메뉴 추가 (탐색과 승부예측 사이) |
| `components/mobile-tab-bar.tsx` | 모바일 탭에 단신 추가 (5탭) |

---

## 핵심 디자인 결정

### 뉴스 카드 (목록)
```
┌─────────────────────────────────────────┐
│ ⚽  손흥민, 토트넘 시즌 최고의 골 선정    │
│축구  팬 투표 1위...                      │
│      토트넘 핫스퍼의 손흥민이 이번 시즌... │
│      지난 달 아스널전에서 넣은...          │
│      r/soccer  💬47  ❤128   2시간 전     │
└─────────────────────────────────────────┘
```

### 채팅 메시지 (토론방)
```
  [아바타] SpursFan82
           ┌─────────────────────────┐
           │ 역시 손흥민 ㅋㅋ         │  bg-secondary
           │ 왼발은 진짜 세계 최고    │  rounded-2xl
           └─────────────────────────┘
           오후 3:42  🔥12 👍8

                    ┌─────────────────┐
                    │ 인정 ㅋㅋㅋ      │  bg-primary (내 메시지)
                    └─────────────────┘
                              오후 3:43
```

### 기존 댓글 vs 뉴스 토론방

| | 기존 댓글 | 뉴스 토론방 |
|--|----------|------------|
| 레이아웃 | 쓰레드형 | 채팅 버블 |
| 입력 위치 | 댓글 섹션 상단 | 화면 하단 고정 |
| 중첩 | 대댓글 지원 | 플랫 (중첩 없음) |
| 스크롤 | 페이지 전체 | 채팅 영역만 |
| 전송 | "댓글 작성" 버튼 | 둥근 전송 아이콘 + Enter |

---

## 구현 순서

1. `lib/types/news.ts` — 타입 정의
2. `lib/mock/news-data.ts` — Mock 데이터 (뉴스 8-10개 + 채팅 15-20개)
3. `components/news/chat-message.tsx` — 채팅 버블 컴포넌트
4. `components/news/news-card.tsx` — 뉴스 카드 컴포넌트
5. `components/news/news-list-client.tsx` — 뉴스 목록 클라이언트
6. `components/news/news-discussion-client.tsx` — 토론방 클라이언트
7. `app/news/layout.tsx`, `app/news/page.tsx`, `app/news/[id]/page.tsx` — 페이지 라우트
8. `components/header.tsx` — 네비게이션에 단신 추가
9. `components/mobile-tab-bar.tsx` — 모바일 탭 추가

## 미래 백엔드 (이번에는 미구현)

- DB: `news_briefs`, `news_messages` 테이블
- VPS: Reddit API 크롤링 → LLM 요약 → Supabase 저장
- API: `/api/news`, `/api/news/[id]/messages`
- 실시간: Supabase Realtime (채팅용)

## DB 스키마 (참고)

```sql
CREATE TABLE news_briefs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    summary text NOT NULL,
    sport text NOT NULL CHECK (sport IN ('football','baseball','basketball','volleyball','esports')),
    source_subreddit text NOT NULL,
    source_url text,
    source_reddit_id text,
    message_count integer DEFAULT 0,
    reaction_count integer DEFAULT 0,
    published_at date DEFAULT CURRENT_DATE,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE news_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    news_id uuid NOT NULL REFERENCES news_briefs(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
    reactions jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    deleted_at timestamptz
);
```
