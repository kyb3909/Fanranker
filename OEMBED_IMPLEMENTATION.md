# oEmbed 자동 임베딩 구현 가이드

이 문서는 TipTap 에디터에 YouTube, Instagram, X(Twitter) URL을 자동으로 임베드하는 기능의 구현 내용을 설명합니다.

## 개요

사용자가 TipTap 에디터에 지원되는 URL을 붙여넣으면:
1. URL이 자동으로 감지됩니다
2. 서버에서 oEmbed 데이터를 가져옵니다
3. URL 텍스트가 임베드 프리뷰로 자동 변환됩니다
4. 실패 시 일반 링크로 폴백됩니다

## 지원되는 제공자

- **YouTube**: `youtube.com/watch?v=...`, `youtu.be/...`
- **Instagram**: `instagram.com/p/...`, `instagram.com/reel/...`
- **X (Twitter)**: `twitter.com/.../status/...`, `x.com/.../status/...`

## 파일 구조

```
community/
├── lib/tiptap/extensions/
│   ├── embed.ts              # Embed 노드 정의
│   ├── embed-paste.ts        # URL 감지 및 자동 변환 로직
│   └── embed-renderer.tsx    # React 렌더러 컴포넌트
├── components/
│   ├── embed-card.tsx        # 임베드 카드 UI 컴포넌트
│   ├── tiptap-editor.tsx     # 편집 가능한 TipTap 에디터
│   └── tiptap-content.tsx    # 읽기 전용 TipTap 콘텐츠 렌더러
├── app/
│   ├── api/oembed/
│   │   └── route.ts          # oEmbed API 라우트 핸들러
│   └── write/
│       └── page.tsx           # 글쓰기 페이지 (TipTap 통합)
└── supabase/migrations/
    └── create_posts_with_embeds.sql  # Supabase 스키마
```

## 설정 방법

### 1. 환경 변수 설정

Instagram oEmbed를 사용하려면 Facebook Access Token이 필요합니다:

```env
FACEBOOK_ACCESS_TOKEN=your_facebook_access_token_here
```

Facebook Access Token 얻는 방법:
1. [Facebook Graph API Explorer](https://developers.facebook.com/tools/explorer/) 방문
2. 앱 선택 및 권한 요청
3. Access Token 생성

### 2. Supabase 마이그레이션 실행

```sql
-- supabase/migrations/create_posts_with_embeds.sql 실행
```

또는 Supabase 대시보드에서 SQL 에디터로 실행합니다.

### 3. TipTap 에디터 사용

#### 글쓰기 페이지 (편집 가능)

```tsx
import { TipTapEditor } from '@/components/tiptap-editor'

<TipTapEditor
  content={content}
  onChange={(json) => setContent(json)}
  placeholder="내용을 입력하세요..."
/>
```

#### 게시물 표시 (읽기 전용)

```tsx
import { TipTapContent } from '@/components/tiptap-content'

<TipTapContent content={post.content} />
```

## 작동 방식

### 1. URL 감지

`embed-paste.ts`의 `handlePaste` 함수가:
- 붙여넣은 텍스트가 단일 URL인지 확인
- 지원되는 제공자와 매칭되는지 확인
- 매칭되면 oEmbed API 호출

### 2. oEmbed 데이터 가져오기

`/api/oembed` 라우트가:
- 제공자별 oEmbed 엔드포인트 호출
- 응답을 정규화된 형식으로 변환
- 에러 처리 및 폴백

### 3. 임베드 노드 생성

성공 시:
- TipTap `embed` 노드 생성
- 정규화된 메타데이터 저장 (provider, url, html, title, etc.)
- 에디터에 자동 삽입

### 4. 렌더링

`EmbedCard` 컴포넌트가:
- `dangerouslySetInnerHTML`로 oEmbed HTML 렌더링
- 반응형 컨테이너로 래핑
- 모바일 최적화

## 데이터 구조

### TipTap JSON 구조

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [...]
    },
    {
      "type": "embed",
      "attrs": {
        "provider": "youtube",
        "url": "https://www.youtube.com/watch?v=...",
        "html": "<iframe>...</iframe>",
        "title": "Video Title",
        "thumbnail_url": "https://...",
        "author_name": "Channel Name"
      }
    }
  ]
}
```

### Supabase 저장

- `posts.content` (JSONB): 전체 TipTap JSON 저장
- `embeds` 테이블 (선택): 임베드 메타데이터 별도 저장 (트리거로 자동 추출)

## 제공자별 제한사항

### YouTube
- ✅ 공개 비디오 지원
- ✅ 자동 임베드 변환
- ❌ 제한된 비디오는 임베드 불가

### Instagram
- ⚠️ Facebook Access Token 필요
- ⚠️ 공개 게시물만 지원
- ⚠️ Graph API v17.0 사용 (향후 버전 업데이트 필요 가능)

### X (Twitter)
- ✅ 공개 트윗 지원
- ✅ 자동 임베드 변환
- ⚠️ 일부 트윗은 임베드 제한 가능

## 확장 방법

### 새로운 제공자 추가

1. `embed-paste.ts`에 URL 패턴 추가:
```typescript
const URL_PATTERNS = {
  // ... 기존 패턴
  tiktok: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w]+\/video\/(\d+)/g,
}
```

2. `route.ts`에 제공자 감지 및 fetch 함수 추가:
```typescript
function detectProvider(url: string): 'youtube' | 'instagram' | 'x' | 'tiktok' | null {
  // ... 기존 로직
  if (URL_PATTERNS.tiktok.test(url)) {
    return 'tiktok'
  }
}

async function fetchTikTokOEmbed(url: string): Promise<OEmbedResponse> {
  // TikTok oEmbed 구현
}
```

3. `EmbedCard`에 스타일 추가 (필요시)

## 문제 해결

### Instagram 임베드가 작동하지 않음
- Facebook Access Token이 올바르게 설정되었는지 확인
- 토큰에 `instagram_basic` 권한이 있는지 확인

### YouTube 임베드가 표시되지 않음
- 비디오가 공개 상태인지 확인
- URL 형식이 올바른지 확인

### X 임베드가 작동하지 않음
- 트윗이 공개 상태인지 확인
- X oEmbed API 상태 확인

## 보안 고려사항

- `dangerouslySetInnerHTML` 사용: oEmbed HTML은 신뢰할 수 있는 제공자에서만 가져옵니다
- 서버 사이드 검증: URL 검증 및 제공자 확인은 서버에서 수행됩니다
- Rate Limiting: 프로덕션에서는 oEmbed API 호출에 rate limiting을 추가하는 것을 권장합니다

## 성능 최적화

- 임베드는 클라이언트에서 지연 로딩 가능
- oEmbed 응답 캐싱 고려 (Redis 등)
- 이미지 최적화 (thumbnail_url)

