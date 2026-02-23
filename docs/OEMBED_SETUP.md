# oEmbed 연동 가이드 (X/Twitter + Instagram)

## 비용 요약

| 플랫폼 | 비용 | 비고 |
|---------|------|------|
| YouTube | **무료** | 인증 불필요, 현재 정상 작동 중 |
| X/Twitter | **무료** | 인증 불필요, 단 API 불안정 이슈 있음 |
| Instagram | **무료** | Facebook 개발자 앱 필요 (무료), 앱 심사 필요 |

**결론: 3개 다 무료.** Instagram만 세팅이 좀 걸림.

---

## 1. X/Twitter oEmbed

### 현재 상황
- `publish.twitter.com/oembed` 엔드포인트는 **인증 없이 무료**
- 단, 2024~2025년부터 **불안정**: 일부 트윗에서 404/에러 반환
- `x.com` → `twitter.com` 도메인 변환 이슈도 있음
- 민감한 콘텐츠로 내부 분류된 트윗은 oEmbed가 실패하는 경우 있음

### 설정 방법

별도 설정 불필요. 현재 코드(`app/api/oembed/route.ts`)에서 이미 구현되어 있음.

```
GET https://publish.twitter.com/oembed?url=https://twitter.com/user/status/123&omit_script=true
```

### 안 될 때 대안: blockquote 직접 생성

Twitter oEmbed가 실패하면, URL에서 정보를 추출해서 blockquote를 직접 만드는 fallback:

```typescript
// fallback: oEmbed 실패 시 트윗 URL로 직접 blockquote 생성
function buildTwitterFallbackHtml(url: string): string {
  return `<blockquote class="twitter-tweet"><a href="${url}">${url}</a></blockquote>`
}
```

이 blockquote는 클라이언트에서 Twitter 위젯 JS(`platform.twitter.com/widgets.js`)를 로드하면 자동으로 렌더링됨.

### 위젯 JS 로드 (클라이언트 컴포넌트)

```typescript
// embed-card.tsx 등에서 Twitter 임베드 렌더링 후 위젯 로드
useEffect(() => {
  if (provider === 'x' && html) {
    const script = document.createElement('script')
    script.src = 'https://platform.twitter.com/widgets.js'
    script.async = true
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }
}, [provider, html])
```

### 트러블슈팅
- **404 에러**: 해당 트윗이 삭제/비공개/민감 콘텐츠일 수 있음
- **x.com 도메인 문제**: 코드에서 `x.com` → `twitter.com`으로 변환 중 (정상)
- **Rate limit**: 분당 300회 제한. 일반적 사용에는 충분

---

## 2. Instagram oEmbed

### 현재 상황
- 2024년 4월부터 기존 oEmbed 엔드포인트 **폐지**
- 새로운 **Meta oEmbed Read** API로 전환 필요
- Facebook 개발자 앱 + 앱 액세스 토큰 필요
- **비용: 무료** (하루 500만 요청까지)

### 설정 단계

#### Step 1: Facebook 개발자 계정 생성
1. https://developers.facebook.com 접속
2. 로그인 → "시작하기" 클릭
3. 개발자 약관 동의

#### Step 2: Facebook 앱 생성
1. "앱 만들기" 클릭
2. 앱 유형: **"비즈니스"** 선택
3. 앱 이름 입력 (예: "Community oEmbed")
4. 앱 생성 완료

#### Step 3: oEmbed Read 제품 추가
1. 앱 대시보드 → 좌측 메뉴 "제품 추가"
2. **"oEmbed Read"** 찾아서 "설정" 클릭
3. 이것만 추가하면 됨 (Instagram Graph API 전체가 아님)

#### Step 4: 앱 액세스 토큰 생성
앱 액세스 토큰은 서버 간 통신용이며, 별도의 사용자 인증이 필요 없음.

```
앱 액세스 토큰 = {App ID}|{App Secret}
```

1. 앱 대시보드 → "설정" → "기본 설정"
2. **앱 ID**와 **앱 시크릿** 확인
3. 토큰 형식: `앱ID|앱시크릿` (파이프로 연결)

예: `123456789|abcdef1234567890`

#### Step 5: 환경변수 설정
```bash
# .env.local
FACEBOOK_ACCESS_TOKEN=123456789|abcdef1234567890
```

#### Step 6: 앱 심사 (프로덕션용)
- **개발 모드**: 본인 소유 콘텐츠만 임베드 가능
- **라이브 모드**: 모든 공개 콘텐츠 임베드 가능
- 라이브 모드 전환 시 **앱 심사** 필요:
  1. 앱 대시보드 → "앱 검토" → "권한 및 기능"
  2. "oEmbed Read" 권한 요청
  3. 사용 사례 설명 작성 (예: "커뮤니티 사이트에서 Instagram 콘텐츠를 임베드합니다")
  4. 심사 소요 시간: **보통 1~5 영업일**

#### Step 7: API 호출 테스트
```bash
curl "https://graph.facebook.com/v21.0/instagram_oembed?url=https://www.instagram.com/p/DFm0LV0sHJK/&access_token=APP_ID|APP_SECRET"
```

### 현재 코드 수정사항
현재 `app/api/oembed/route.ts`의 Instagram 부분은 이미 `FACEBOOK_ACCESS_TOKEN`을 사용하도록 구현되어 있음. 환경변수만 추가하면 작동.

### Instagram oEmbed 응답 예시
```json
{
  "html": "<blockquote class=\"instagram-media\" ...",
  "author_name": "username",
  "provider_name": "Instagram",
  "thumbnail_url": "https://..."
}
```

### 트러블슈팅
- **400 에러**: 토큰이 잘못됨 → `앱ID|앱시크릿` 형식 확인
- **비공개 계정**: oEmbed는 공개 게시물만 지원
- **Graph API 버전**: `v17.0` → `v21.0`으로 업데이트 권장 (현재 코드는 v17.0)
- **개발 모드 제한**: 심사 전에는 본인 게시물만 테스트 가능

---

## 3. 대안: oEmbed 없이 링크 카드

oEmbed가 실패하는 경우를 위한 fallback 전략:

### Open Graph 메타데이터 스크래핑
```typescript
// URL의 og:title, og:image, og:description을 가져와서 링크 카드로 표시
async function fetchLinkPreview(url: string) {
  const res = await fetch(url)
  const html = await res.text()
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)
  const image = html.match(/<meta property="og:image" content="([^"]*)"/)
  return { title: title?.[1], image: image?.[1], url }
}
```

단, Instagram/Twitter는 서버에서 og 태그 접근이 제한될 수 있음.

### 심플 링크 카드
oEmbed 실패 시 URL만 표시하되 아이콘 + 도메인으로 카드 형태로 렌더링:
- YouTube: 빨간 재생 아이콘
- X/Twitter: X 로고
- Instagram: 카메라 아이콘

---

## 우선순위 제안

1. **즉시 가능**: X/Twitter fallback blockquote 방식 적용 (코드 수정만)
2. **1일 소요**: Facebook 앱 생성 + oEmbed Read 설정 (개발 모드)
3. **1~5일 소요**: Facebook 앱 심사 통과 (라이브 모드)

---

## 참고 링크

- [X oEmbed API 공식 문서](https://docs.x.com/x-for-websites/oembed-api)
- [Meta oEmbed Read 설명](https://www.bluehost.com/blog/meta-oembed-read-explained/)
- [Instagram Graph API 가이드 2026](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
- [X Embed 문제 해결 가이드](https://smashballoon.com/how-to-fix-twitter-embeds-not-working/)
- [Instagram API Access Token 발급 가이드](https://theplusaddons.com/blog/get-instagram-access-token/)
- [X Developer Community - Embed 이슈](https://devcommunity.x.com/t/twitter-embedding-posts-twitter-publish-not-working/227179)
