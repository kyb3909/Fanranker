# 검열 에이전트 (모더레이션) — 플래닝 & 관리 문서

> **상태**: 🟡 플래닝 단계. 코드는 격리 브랜치 `moderation-agent` 에 있고 **프로덕션/main 무영향**
> (커밋만, push X · 마이그레이션 미적용 · env 미설정 · cron 미배포 · 서비스 미연결).
> 이 문서는 main 의 `docs/` 에 있는 **논의/관리 surface**. 코드를 보려면 `git checkout moderation-agent`.

마지막 갱신: 2026-06-23

---

## 1. 목적 & 원칙

- 새로 올라오는 글/댓글 중 **음란·정치·비하·광고**를 자동 감지 → 1차 대응.
- **사람(사장님) 중심 루프**: 처음엔 알림만 → 신뢰 쌓이면 명백한 것만 자동삭제.
- 핵심 난제 = **분별력**: 농담/자조/친근 밈 vs 표적·악의. "단어 있다고 무조건 차단" 금지.
- 정책은 **우리(공놀이) 기준**. 외부(펨코 등) 기준을 그대로 수입하지 않음.

## 2. 현재 상태

- 위치: 브랜치 `moderation-agent` (커밋 `feat(moderation): 검열 워커 WIP`).
- main 에는 이 문서(`docs/moderation-agent-plan.md`)만 존재. 코드 흔적 0.
- 동작 안 함 (전부 비활성). 살리는 법은 §7.

## 3. 아키텍처 개요 (현재 구현된 초안)

**3단 캐스케이드** (`lib/moderation/`):

| 단계 | 무엇 | 모델/비용 | 대상(논의중) |
|---|---|---|---|
| 0 | 규칙필터 + **우회탐지** | 공짜 | 전수 |
| 1 | 전수 분류 | gpt-4.1-mini(초안) | 신고건만(논의중) |
| 2 | 비하 회색지대 정밀판정 + few-shot | gpt-4.1(초안) | 신고건만(논의중) |

- **0단계 우회탐지**(`normalize.ts`): "평문엔 없는데 자모결합/구분자제거 하면 나온다 = 우회 = 차단".
  평문 모호어(`바카라`,`스포츠토토 1등`)는 통과(맥락→LLM). 동반신호(가입/입금/코드)면 차단. (테스트 13개)
- **content_reports 재사용**: flag 시 시스템 리포트(`reporter_id='system_moderation'`)로 INSERT
  → 기존 어드민 리뷰/레드·옐로카드/자동정지 플로우로 흐름.
- **피드백 루프**: Discord ✅(정확)/❌(오탐) → 봇이 DB 기록 → 2단계 few-shot 으로 in-context 학습.
- **펨코 학습 파이프라인**: 펨코 글을 "어려운 문제 은행"으로 샘플링 → 사전라벨 → flag 후보만
  Discord 라벨링 큐 → 사장님 ✅/❌ → few-shot 콜드스타트 + `moderation-eval` 정밀도 측정.
  (펨코 글=차단예시 아님. 사람 확정 라벨만 사용. 본문 영구저장 X, 발췌만.)

## 4. 논의로 기울어진 방향 (⚠️ 미확정)

1. **신고 기반으로 전환** — 전수 LLM 대신:
   - 0단계(공짜)는 **전수** 유지 → 스팸봇/도배는 보기 전에 즉사.
   - 1·2단계 LLM 은 **신고 들어온 것만** → 사람이 손든 곳에만 비싼 판단 집중.
   - 트리거: 신고 POST(`/api/reports`) 순간 그 글만 캐스케이드(실시간). cron 폴링 불필요.
2. **mini 버림** — 신고기반이면 처리량이 적어 건당 강한 모델 써도 푼돈.
   분별력 = 모델급↑ + **few-shot** + **추론(reasoning)** 3개 레버 같이.
3. **모델은 찍지 말고 측정** — `moderation-eval` + 라벨 뱅크로 A/B 후 결정.

## 5. 열린 질문 (결정 대기)

- [ ] **모델 선택**: gpt-4.1 full / o-계열(추론) / Claude / Solar(한국어). 키 추가 여부 포함.
      → 라벨 뱅크로 측정해서 결정.
- [ ] **롤아웃 기준**: 알림만 → 자동삭제 전환을 무슨 지표로? (정밀도 %, 관찰 기간)
      자동삭제 허용 카테고리(음란/광고만?) + 최소 confidence.
- [ ] **정책 강도 / 골든셋**: 꼭 맞춰야 할 케이스 목록 (예: "흑형"=통과, "OO충"=차단).
- [ ] **비용**: 신고량 기준 예상 비용 (현재는 무의미하게 적음).
- [ ] **컴플라이언스 연결**: 사업자등록/약관/사행성 방향과 어떻게 엮나.
- [ ] **펨코 크롤 현실성**: 안티봇(Cloudflare) — `--headed`/로컬IP/셀렉터 첫 run 후 조정.

## 6. 결정 로그

- **2026-06-23**
  - 트리거: Vercel cron 폴러로 시작(초안) → **신고기반으로 재논의 중**.
  - LLM: OpenAI만 보유 → mini/4.1 초안 → **mini 분별력 약함 확인, 강모델+few-shot+추론으로 선회**.
  - 피드백 채널: **Discord 봇 상주**(Vultr) 확정. 웹훅 단방향이라 봇 필요.
  - 라벨링: **하이브리드**(분류기 사전라벨 → 의심건만 사람 ✅/❌) 확정.
  - 격리: **`moderation-agent` 브랜치**로 분리, main 무영향. 문서는 repo `docs/`.

## 7. 파일 맵 & "살리는 법" (나중에, 합의 후)

브랜치 `moderation-agent` 내용:
- `lib/moderation/` — config·types·openai·rules·normalize·classify·discord
- `app/api/cron/moderation-scan/route.ts` — 전수 스캔 cron (신고기반 가면 교체/축소)
- `scripts/fmkorea-sample.ts` · `moderation-eval.ts` · `moderation-discord-bot.mjs`
- `supabase/migrations/20260623_moderation_worker.sql` · `20260623b_moderation_examples.sql`
- `__tests__/lib/moderation/rules.test.ts`
- 공유파일 edit: `lib/env.ts`(키 추가) · `vercel.json`(cron) · `package.json`(스크립트)

활성화 순서(합의 후): ① 마이그레이션 적용 → ② Vercel env(OPENAI_API_KEY, DISCORD_*) →
③ Discord 봇 Vultr 배포 → ④ 알림만으로 관찰 → ⑤ 측정 후 자동삭제.

## 8. 다음 액션

§5 열린 질문부터. 우선순위 제안: **모델 선택 방식 → 골든셋 만들기 → 롤아웃 기준**.
