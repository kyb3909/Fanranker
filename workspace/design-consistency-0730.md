# 디자인 일관성 감사 — 2026-07-30

범위: 홈 탭 밴드 전환(최우선), 밴드 라벨 정합성, PageBand 사용 일관성, 다크 3존 원칙·좌측 액센트 보더 잔존.
심각도: **high** = 사용자 체감 붕괴/규칙 위반, **medium** = 일관성 훼손, **polish** = 마감 품질.

---

## 1. 최우선 — 홈 탭 전환 시 밴드 붕괴 (high)

**지점**: `components/home/home-client.tsx:146-150`

```tsx
{feedTab === "cardnews" ? (
  <MatchdayBand cards={initialCardNews?.cards ?? []} />
) : (
  <PageBand kicker="Wall" title="담벼락" description="팔로우한 게시판 글이 여기로 모인다." />
)}
```

### 현상 진단

두 밴드는 같은 `.gn-band` 셸(`app/a-tokens.css:45-84` — 나이트 배경 + 버건디 래디얼 + 그레인)을 쓰지만, **별개의 `<section>`으로 조건 마운트**되므로 전환 시:

| | MatchdayBand (`components/home/matchday-band.tsx`) | PageBand (`components/page-band.tsx`) |
|---|---|---|
| 높이 | 헤더 행(pt-6, ~50px) + 캐러셀 `min-h-[300px] sm:min-h-[420px]` + pb-7 → **데스크톱 ≈ 500~530px** | `pt-8 pb-8` + 42px 제목 + 설명 → **≈ 130~140px** |
| 내용 | 캐러셀 + TOP STORY 스큐 플레이트 + 카운트다운 + 경기 4행 + CTA | 키커 + 제목 + 설명 1줄 |
| 제목 태그 | `h2` "오늘의 메인 이벤트" (matchday-band.tsx:84) | 기본 `h1` "담벼락" (page-band.tsx:41) |

즉 탭 클릭 한 번에 ① 높이가 **~390px 순간 붕괴**(본문이 점프), ② 그레인·그라디언트가 리마운트되며 미세 깜빡임, ③ 제목이 "오늘의 메인 이벤트"→"담벼락"으로 페이지 정체성 자체가 갈아엎어진다. 반면 밴드 배경 DNA는 동일해서 "같은 페이지인데 왜 무너졌지"라는 위화감이 더 커진다.

home-client.tsx:141-144 주석의 설계 의도("목록 탭에서 히어로까지 끌고 가면 스크롤 낭비 → 공용 PageBand로 낮춘다")는 타당하다. 문제는 **낮추는 것**이 아니라 **낮추는 방식(순간 교체 + 정체성 스왑)**이다. 아래 3안 모두 그 의도를 유지한다.

### 실행안 A — 공유 셸 + 높이 트랜지션 크로스페이드 (규모: S~M)

두 밴드 내용을 **항상 마운트된 단일 `<section className="gn-band">`** 안에 넣고, 내부 콘텐츠만 높이/불투명도 전환한다.

```tsx
// home-client.tsx — 조건 마운트 대신 단일 셸
<section className="gn-band">
  <div
    className="grid transition-[grid-template-rows] duration-300 ease-out"
    style={{ gridTemplateRows: feedTab === "cardnews" ? "1fr" : "0fr" }}
  >
    <div className="overflow-hidden"><MatchdayBandContent cards={…} /></div>
  </div>
  {feedTab !== "cardnews" && <PageBandContent kicker="…" title="…" />}
</section>
```

(`grid-template-rows: 1fr↔0fr` 트랜지션은 max-height 핵 없이 auto 높이를 애니메이션하는 표준 패턴. MatchdayBand/PageBand에서 `.gn-band` 래퍼를 벗긴 "Content" 변형을 내보내는 소규모 리팩터 필요.)

- **장점**: 배경·그레인이 절대 리마운트 안 됨(깜빡임 제거). 530→140px이 300ms 이징으로 접혀 "밴드가 접혔다"로 읽힌다. 최종 높이는 설계 의도 그대로.
- **단점**: 전환 순간 본문이 애니메이션과 함께 위로 끌려 올라감(의도된 모션이지만 duration이 길면 답답). MatchdayBand 내부 SWR/타이머가 접힌 상태에도 살아있음(카운트다운 interval 유지 — 미미하지만 낭비). 제목이 "오늘의 메인 이벤트"↔"담벼락"으로 여전히 스왑되는 문제는 남는다(크로스페이드로 완화만 가능).
- **규모**: home-client.tsx + 두 밴드 컴포넌트에서 셸 분리. ~60-80줄 변경.

### 실행안 B — 홈 전용 "축소 매치데이 밴드" (같은 DNA) (규모: M) ← **권장**

목록 탭(board/games)에서 PageBand 대신 **MatchdayBand의 컴팩트 변형**을 쓴다. 같은 키커("Matchday")·같은 제목·같은 날짜 스탬프를 유지하고, 캐러셀·경기목록을 버리고 카운트다운 한 줄만 남긴다.

```tsx
// matchday-band.tsx 에 compact prop 추가 (별도 컴포넌트보다 로직 공유가 쉬움)
export function MatchdayBand({ cards, compact = false }: MatchdayBandProps) {
  …
  if (compact) return (
    <section className="gn-band" aria-label="오늘의 메인 이벤트">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-8 pb-8">
          {/* 기존 헤더 행 그대로 (Matchday 키커 + 제목 + 날짜) */}
          {countdown && (
            <Link href="/prediction" className="gn-num ml-auto …">
              다음 킥오프 {countdown} · {matches.length}경기 →
            </Link>
          )}
        </div>
      </div>
    </section>
  )
  return ( /* 기존 풀 밴드 */ )
}

// home-client.tsx:146-150
{feedTab === "cardnews"
  ? <MatchdayBand cards={initialCardNews?.cards ?? []} />
  : <MatchdayBand cards={[]} compact />}
```

- **장점**: 전환 후에도 **같은 페이지 정체성**(키커·제목·날짜 유지) — 높이만 530→~140으로 줄어 "밴드가 요약됐다"로 읽힌다. games 탭(베팅 화면)에서 카운트다운 한 줄이 오히려 문맥에 정확히 맞음 → **§2 라벨 문제도 함께 해소**. `useCountdown`·SWR 키(`/api/sports/games`)를 그대로 공유(dedupe로 추가 비용 0). PageBand 의존 제거로 h1 중복(§4)도 자연 해결(h2 유지).
- **단점**: 순간 높이 점프 자체는 남음(같은 헤더가 앵커 역할을 해 체감은 크게 줄지만, 완전 무마찰은 아님 — A와 조합 가능). board 탭에 매치데이 정보가 논리적으로 필수는 아님(한 줄이라 부담은 낮음). 컴팩트 분기 유지 비용 소폭.
- **규모**: matchday-band.tsx +40~60줄, home-client.tsx 3줄. PageBand import 제거.

### 실행안 C — 밴드 상시 유지 + 내부 콘텐츠만 교체 (규모: M~L)

`.gn-band` 셸과 **헤더 행(키커+제목+날짜)을 탭과 무관하게 상시 렌더**하고, 그 아래 그리드(캐러셀+경기)만 cardnews 탭에서 조건 렌더 + A의 grid-rows 트랜지션으로 접는다. 사실상 A+B의 합집합 구조.

- **장점**: 연속성 최강 — 배경·그레인·헤더 모두 안 움직이고 아래 블록만 접힘. 브라우저 네이티브 트랜지션이라 JS 측정 불필요.
- **단점**: 셋 중 리팩터 폭이 가장 큼 — MatchdayBand를 셸/헤더/콘텐츠 3분할하고 home-client가 조립하는 구조로 재편(기존 단일 컴포넌트 캡슐화가 깨짐). 접힌 상태에서도 캐러셀 이미지·타이머가 DOM에 남으므로 언마운트 관리 추가 필요. board 탭에서 "오늘의 메인 이벤트" 제목이 목록 문맥과 어긋난다는 지적이 나올 수 있음(제목 크로스페이드를 넣으면 다시 복잡도 증가).
- **규모**: 컴포넌트 재편 포함 ~150줄+.

**권장 조합**: **B를 본체로**, 여력이 있으면 A의 grid-rows 접힘 트랜지션만 B에 얹는다(B의 compact 분기를 같은 섹션 안에서 전환). B 단독으로도 정체성 스왑·라벨 오류·h1 중복이 한 번에 풀리고, 스크롤 경제라는 원 설계 의도를 그대로 지킨다.

---

## 2. 홈 밴드 라벨 정합성 — games 탭 오표기 (high)

**지점**: `components/home/home-client.tsx:149`

`feedTab === "games"`(= "오늘의 경기", 실제 베팅 화면 `BettingPage bettingOnly`, home-client.tsx:273)일 때도 board 탭과 동일한 `PageBand kicker="Wall" title="담벼락" description="팔로우한 게시판 글이 여기로 모인다."`가 뜬다. **베팅 화면 위에 "팔로우한 게시판 글이 여기로 모인다"**는 명백한 오표기 — 상단 선언(담벼락/게시판)과 본문(경기 픽)이 서로 다른 제품처럼 읽힌다.

부수: 비로그인 사용자의 board 탭은 유니버설 피드(home-client.tsx:38-40 주석)라 "팔로우한 게시판 글" 설명이 로그인 여부에 따라 부정확해지는 문제도 있음 (polish).

**최소 수정** (§1-B를 안 하는 경우):

```tsx
{feedTab === "cardnews" ? (
  <MatchdayBand … />
) : feedTab === "games" ? (
  <PageBand as="h2" kicker="Matchday" title="오늘의 경기" description="오늘 걸어둔 픽이 밤에 답을 준다." />
) : (
  <PageBand as="h2" kicker="Wall" title="담벼락" description="팔로우한 게시판 글이 여기로 모인다." />
)}
```

§1-B 채택 시 이 분기는 compact 밴드로 대체되어 자동 해소.

---

## 3. PageBand 사용 일관성 감사 (표면별)

사용처 전수: 홈(home-client.tsx:149), /community/[slug] (page.tsx:271, 370), /explore (explore-content.tsx:157), /prediction (prediction-client.tsx:38), /my-predictions (page.tsx:14), /search (page.tsx:212).

**잘 지켜진 것**: 전부 그리드 바깥 최상단 풀블리드(컴포넌트 독트린 준수), kicker 존재, `worldcup-scope` 래핑 동일. /prediction·/my-predictions·/search 는 모범 사례.

### 3a. /explore 키커가 규약 위반 (medium)
`app/explore/explore-content.tsx:158` — `kicker="Explore · 게시판 디렉토리"`. PageBand 규약(page-band.tsx:4 "라틴 대문자 키커")과 나머지 전 표면(Wall/Board/Prediction/My Record/Search — 모두 라틴 단어)에 어긋나게 유일하게 한글이 섞임. 키커는 "크기로 겨루지 않고 자간으로만 존재"하는 장치라 한글이 들어가면 자간 0.2em이 어색해진다. → `kicker="Explore"`로 축약하고 "게시판 디렉토리"는 description으로 이동.

### 3b. description 어조 불일치 (medium)
- /prediction: "…밤에 답을 준다. …그대로 남는다." (평서 한다체)
- /my-predictions: "…전부 여기 남는다." (한다체)
- 홈 board: "…여기로 모인다." (한다체)
- /search: "…닉네임으로 찾는다." (한다체)
- **/explore: "…팔로우해보세요. …올라옵니다."** (`explore-content.tsx:160`, 해요체)

밴드 보이스가 사이트 전체에서 건조한 한다체로 통일돼 있는데 /explore만 안내문 어투. → "관심 게시판을 팔로우하면 그 글이 담벼락으로 올라온다." 류로 통일.

### 3c. 크리에이터 게시판 밴드 description 부재 (polish)
`app/community/[slug]/page.tsx:271` — `<PageBand kicker="Board" title={…} />`만. description 은 옵션 prop 이라 규약 위반은 아니나, 일반 게시판(370행)은 description 을 주므로 같은 Board 표면 안에서 밀도가 갈린다. 한 줄("○○님이 운영하는 게시판") 추가 검토.

### 3d. 밴드 하단 여백 리듬 (polish)
/explore 만 카드 걸침(`gn-band-open`) 때문에 `main pt-[72px]`(explore-content.tsx:252), 나머지는 `py-5~6`. 걸침 설계의 의도적 예외로 문서화돼 있어(주석) 수용 — 단 새 표면이 이 값을 복붙하지 않도록 주의.

---

## 4. 시맨틱 — 홈 board/games 탭에서 h1 중복 (medium)

- `components/page-band.tsx:41` — `as` 기본값 `"h1"`.
- `components/home/home-client.tsx:149` — `as` 미지정 → PageBand 가 **h1 "담벼락"** 렌더.
- `components/home/home-client.tsx:156` — `<h1 className="sr-only">gongnori.fan — …</h1>` 상시 렌더.

→ board/games 탭에서 페이지에 h1이 2개. cardnews 탭은 MatchdayBand가 h2(matchday-band.tsx:84)라 정상. 탭에 따라 문서 아웃라인이 흔들리는 것 자체도 §1 위화감의 시맨틱 버전이다. → 149행에 `as="h2"` 명시 (§1-B 채택 시 자동 해결).

---

## 5. 다크 밴드 3존 원칙 점검 (`gn-band` 전수)

사용처: page-band.tsx:46 ✅(밴드), site-footer.tsx:24 ✅(푸터), matchday-band.tsx:75 ✅(밴드), **section-header.tsx:48 ⚠️**.

### 5a. SectionHeader — 본문 칼럼 안 라운드 다크 카드 (medium)
`components/section-header.tsx:48` — `gn-band`를 `rounded-xl` 카드로 본문 칼럼 **안에** 렌더. PageBand 자체 독트린(page-band.tsx:25-26 "본문 칼럼 안에 든 라운드 카드로 만들면 폭과 모서리가 달라져 일관성이 깨진다 → 반드시 그리드 바깥")과 정면 충돌하는 헤더 이중 체계. 사용처 4곳이 전부 `/worldcup` 하위(register:53, my-predictions:28, leaderboard:234, games:100)이고 해당 세그먼트는 현재 전체 redirect(아카이브)라 실노출 0 — 즉시 사고는 아니나, 시즌 이벤트에서 이 페이지들을 재사용할 계획이 있으므로 **부활 전에 PageBand 로 승격/통합**할 것. 방치하면 "밴드가 두 규격"인 채로 복귀한다.

### 5b. 성적표 카드 — 콘텐츠 칼럼 내 다크 계열 대형 카드 (medium)
`components/my-predictions/prediction-stats-summary.tsx:53-55` — 성적 저조(`low`) 시 카드 배경이 `linear-gradient(165deg,#3b3035,#5b4a50)` 다크 그라디언트, 평시도 버건디 딥 풀컬러 카드가 콘텐츠 칼럼 안에 위치. "다크는 밴드·푸터 등 선언 영역에만, 카드·목록·액션엔 금지" 원칙 기준 경계 사례 — 성적표라는 '선언'적 성격은 있으나 픽/베팅 이력 화면의 카드라는 점에서 재검토 대상. 최소한 `low` 변형(#3b3035)은 다크 존으로 읽히므로 라이트 뉴트럴(웜 그레이 틴트)로 낮추는 것을 권장.

---

## 6. 좌측 액센트 보더 잔존 grep 결과

패턴: `border-l*` / `borderLeft` — app/, components/ 전수.

### 6a. 위반 — flair 색 3px 좌측 액센트 보더 (high)
`components/profile/settings/fan-identity-section.tsx:180`

```tsx
style={ s.flair_color ? { borderLeftWidth: 3, borderLeftColor: s.flair_color } : undefined }
```

"한쪽 색깔 액센트 보더 영구 금지" 규칙(위계는 배경 틴트·칩·웨이트로만)의 정확한 금지 형태(3px 컬러 border-left)가 마이페이지 팬 정체성 카드에 잔존. → flair 색은 좌측 보더 대신 **컬러 도트 칩** 또는 배경 틴트(`color-mix(in srgb, ${flair_color} 8%, transparent)`)로 치환.

### 6b. 비위반 (구조적 사용 — 조치 불필요)
- `components/post-detail/comment-item.tsx:226` — 2px `var(--wc-line)` 대댓글 스레드 인덴트 가이드(중립색·구조선).
- `app/worldcup/page.tsx:152`, `components/my-predictions/prediction-stats-summary.tsx:211`, `components/betting/betting-slip.tsx:386` — `i > 0` 조건의 1px 칼럼 구분선.
- `components/draft/draft-board.tsx:602`, `multi-draft-board.tsx:637`, `chat-panel.tsx:138` — 1px 패널 경계선.
- `components/ui/sidebar.tsx:231,617`, `components/ui/sheet.tsx:57` — shadcn 구조 보더.

---

## 요약 (심각도순)

| # | 발견 | 위치 | 심각도 |
|---|---|---|---|
| 1 | 홈 탭 전환 시 밴드 530→140px 순간 붕괴 + 정체성 스왑 (실행안 A/B/C, B 권장) | home-client.tsx:146-150 | high |
| 2 | games 탭(베팅 화면)에 "담벼락/팔로우한 게시판 글" 밴드 오표기 | home-client.tsx:149 | high |
| 3 | flair 색 3px 좌측 액센트 보더 — 금지 패턴 잔존 | fan-identity-section.tsx:180 | high |
| 4 | board/games 탭 h1 중복 (PageBand 기본 h1 + sr-only h1) | home-client.tsx:149,156 / page-band.tsx:41 | medium |
| 5 | /explore 키커에 한글 혼입 — 라틴 대문자 키커 규약 위반 | explore-content.tsx:158 | medium |
| 6 | /explore description 해요체 — 전 표면 한다체 보이스와 불일치 | explore-content.tsx:160 | medium |
| 7 | SectionHeader = 본문 내 라운드 다크 카드, PageBand 독트린과 충돌 (아카이브 /worldcup 4곳, 부활 전 통합 필요) | section-header.tsx:48 | medium |
| 8 | 성적표 카드 low 변형 다크 그라디언트 — 다크 3존 경계 사례 | prediction-stats-summary.tsx:53-55 | medium |
| 9 | 크리에이터 게시판 밴드 description 부재로 Board 표면 내 밀도 편차 | app/community/[slug]/page.tsx:271 | polish |
| 10 | 비로그인 board 탭 밴드 설명("팔로우한 게시판 글")이 유니버설 피드와 불일치 | home-client.tsx:149 vs 38-40 | polish |
