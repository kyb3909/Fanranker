# 커뮤 애그리게이터 v2 — 지속 크롤링 + 어드민 검수 발행 + Reddit 소스

> 2026-07-24 설계. 목표: 뉴스 검수(`/admin/news-review`)처럼 **크롤링은 알아서 돌고, 운영자는 페이지에서 검수·발행만** 하는 구조로 전환. 여기에 Reddit 유머/밈/신기 소스를 추가.

## 현재 상태 (v1)

- 파이프라인: `agg:scout`(더쿠 핫게 크롤) → `agg:fetch`(이미지 rehost) → `agg:write`(페르소나 초안) → **사람이 Supabase Table Editor에서 drafted→approved** → `agg:publish`(posts 발행)
- 전부 로컬 수동 실행. 발행은 품질 문제로 일시 중단 중 (F15 학습 진행).
- 품질 학습(F15): `/admin/agg-training` 페이지 + `agg-corrections.json` few-shot 루프 가동.

## v2 설계

```
[Vultr cron, 1시간]                       [운영자, 아무 때나]           [학습, 자동]
scout(더쿠+Reddit) → fetch → write   →   /admin/agg-review        →   검수 편집·반려가
        (drafted 로 적재만)               발행 / 수정 발행 / 반려        agg_training_entries 에
                                          (뉴스 검수와 동일 UX)          자동 적재 → learn 회수
```

### 1) 검수·발행 페이지 `/admin/agg-review` (Phase 1)

news-review 패턴 복제. `agg_reservoir` status=`drafted` 목록:

- **표시**: 페르소나 닉네임 · 소스 뱃지(더쿠/Reddit) · 원본 제목(내부용) · AI 제목/본문(편집 가능) · rehost 이미지 미리보기 · 수집 시각
- **버튼**: `발행`(그대로) / `수정 발행`(편집본으로) / `반려`(사유)
- **발행 API** (`/api/admin/agg-review`): `agg-publish-run.js`의 로직 이식 —
  - TipTap doc 조립 (첫 문단 → 미디어 → 나머지 문단)
  - 페르소나 계정으로 posts insert (free-board), 출처 비표기(내부 source_url만)
  - 일일 cap(8) + 페르소나별 cap(2) 서버에서 검증 — cap 초과 시 409 안내
  - reservoir status=published + post_id + audit
- **학습 자동 연동 (핵심)**:
  - `수정 발행` 시 → (AI 초안, 운영자 수정본) 쌍을 `agg_training_entries` 에 status=`corrected` 로 자동 insert
  - `반려` 시 → status=`rejected` + 사유 자동 insert
  - → 로컬 `agg-train.js learn` 이 그대로 회수 → 다음 write 부터 few-shot 반영.
    **운영 검수 자체가 학습 데이터가 된다** — 별도 학습 라운드는 초기 부트스트랩용으로만.
- cron `agg:publish` 는 사용 안 함 (배치 발행 필요 시 수동 실행용으로 유지).

### 2) Reddit 유머/밈 소스 (Phase 2)

`agg-scout-run.js` 에 reddit 파서 추가. `https://www.reddit.com/r/<sub>/hot.json?limit=25` (기존 뉴스 크롤러와 같은 방식, Vultr IP에서 동작 확인됨).

- **서브레딧 (제안 — config 로 조정)**: 영문 텍스트 의존이 낮은 **비주얼 위주**로 시작
  - `interestingasfuck`, `Damnthatsinteresting`, `BeAmazed`, `nextfuckinglevel` (신기/대단)
  - `aww`, `AnimalsBeingDerps` (동물)
  - `oddlysatisfying` (힐링/만족)
  - ⚠️ `memes`/`funny` 는 이미지 안 영문 캡션이 핵심이라 번역이 안 먹힘 — 제외 시작, 추후 vision 판별로 검토
- **필터**: `over_18`(NSFW) 스킵, `stickied` 스킵, 기존 정치/민감 키워드 필터 재사용(제목 영문이므로 영문 차단어 소량 추가: politics, trump, israel, gaza, shooting 등), score 하한(예: upvote 1000+), 24h 이내
- **미디어**: `i.redd.it`/preview 이미지 → 기존 rehost 경로(`/storage/posts/agg/`). 갤러리(`gallery_data`)는 첫 3장. **v.redd.it 영상은 Phase 2에서 스킵** (영상 rehost 인프라 없음)
- **write 프롬프트**: 입력 excerpt가 영문 — "한국어로만 쓴다" 규칙이 이미 있어 그대로 동작. 이미지는 vision 입력으로 들어가므로 영문 제목이어도 이미지 내용 기반 재구성 가능. 페르소나 매칭: 동물/유머 → 떡밥줍는사람 중심 (topics 에 영문 키워드 추가: cat, dog, animal 등)
- **컴플라이언스**: 더쿠와 동일 — 출처 비표기, source_url 내부 보존, `agg:takedown` 으로 삭제 대응. (리스크 기존 고지·운영자 감수 방침 유지)

### 3) 지속 크롤링 — Vultr cron (Phase 3)

기존 crawlers 와 같은 VPS. `data/agents` 를 git pull + `npm install` 후:

```cron
# /etc/cron.d/agg  (예시)
0 * * * *  root  cd /opt/community/data/agents && npm run agg:cycle >> /var/log/agg-cycle.log 2>&1
```

- `agg:cycle` = scout → fetch → write (발행 없음 — drafted 까지만)
- **백프레셔**: write 시작 시 `drafted` 대기 수가 30건 이상이면 스킵 (검수 안 하는데 LLM 비용만 쌓이는 것 방지) — write-run에 가드 추가
- **비용 상한**: write 는 run 당 최대 10건 (gpt-4.1-mini, 시간당 최대 10콜 → 일 ~240콜 상한이지만 freshness+백프레셔로 실제는 일 30~50콜 수준 예상)
- 시의성: 더쿠 freshnessMinutes=90 은 1시간 주기 전제 그대로. Reddit 은 24h 윈도우 + score 하한이라 주기 민감도 낮음 (2시간 주기로 별도 스텝도 가능)
- **corrections 반영 경로**: 로컬에서 learn → `agg-corrections.json` 커밋/푸시 → VPS git pull (betman 스크립트와 동일한 운영 패턴)
- 모니터링: 기존 `DISCORD_OPS_WEBHOOK_URL` 재사용 — cycle 실패 시 웹훅 알림 (선택)

## 페이즈 요약

| Phase | 내용 | 규모 | 선행 조건 |
|---|---|---|---|
| **1** | `/admin/agg-review` 검수·발행 페이지 + 학습 자동 연동 | ~1일 | 없음 (지금 바로) |
| **2** | Reddit 스카우트 + 영문 필터 + 갤러리 rehost | ~1일 | Phase 1 (검수 큐가 있어야 의미) |
| **3** | Vultr cron 지속화 + 백프레셔 + 알림 | 반나절 + VPS 작업 | Phase 1·2 + **발행 재개 판단** (F15 품질 OK 시) |

## 결정 필요 (기본값 제안)

1. **발행 재개 시점** — Phase 1 페이지가 생겨도 발행 버튼을 누르는 건 운영자. F15 품질이 만족스러울 때까지 반려/교정 위주로 운영하면 됨 (기본: 페이지부터 만들고 발행은 운영자 재량).
2. **Reddit 서브레딧 목록** — 위 7개 제안. 여돌/K-pop 쪽 (`kpop` 등)은 민감 이슈 비중이 높아 제외 시작.
3. **일일 cap 상향 여부** — 소스가 늘면 8건/일이 금방 참. 당분간 유지 제안 (품질 우선).
