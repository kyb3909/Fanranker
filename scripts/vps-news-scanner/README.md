# VPS 뉴스 스캐너 (`/opt/news-scanner/`)

**`/admin/news-review` 데스킹 큐를 실제로 채우는 코드다.** Vultr VPS 에서 15분마다 돈다.

```
r/soccer 외 15개 서브레딧 RSS(hot)
  → 잡담·중복·오래된 글 컷
  → 외부 기사면 원문 본문 추출 (~2,800자)
  → OpenAI 판별 + 한국어 작성 (원문 있으면 장문 500~1,000자 / 없으면 2~3문장)
  → /api/oembed(트윗) · /api/og(기사 이미지) 보강
  → /api/news/agent-draft 로 초안 적재 (발행 안 함)
  → 사람이 /admin/news-review 에서 검수·발행
```

## ⚠️ 이 디렉토리는 VPS 파일의 사본이다

원본 실행 위치는 `/opt/news-scanner/` 이고 git 밖에 있었다(백업·이력 없음).
2026-07-29 에 저장소로 편입했지만 **자동 배포는 없다** — 고쳤으면 직접 올려야 한다.

```bash
# 배포
python scripts/vultr-exec.py --upload scripts/vps-news-scanner/news-scanner.mjs /opt/news-scanner/news-scanner.mjs

# 확인 (드라이런 — 초안 적재 없이 판별·작성 로그만)
python scripts/vultr-exec.py "cd /opt/news-scanner && SCANNER_DRY_RUN=1 SCANNER_MAX_LLM=3 bash run.sh"

# 로그
python scripts/vultr-exec.py "tail -40 /opt/news-scanner/cron.log"
```

## 로컬 테스트

```bash
set -a && source data/crawlers/.env && set +a
SCANNER_DRY_RUN=1 SCANNER_MAX_LLM=3 SCANNER_THROTTLE_MS=800 \
  SEEN_FILE=/tmp/seen.json node scripts/vps-news-scanner/news-scanner.mjs
```
드라이런은 생성된 기사 본문을 그대로 출력한다 (분량·품질 확인용).

## 헷갈리기 쉬운 것 — `data/agents/` 와 다른 시스템이다

| | 이 스캐너 | `data/agents/` 뉴스룸 |
|---|---|---|
| 실행 | VPS cron 15분 | **수동 실행만** (비용 절감 방침) |
| 산출 | `news_reservoir` drafted → 사람 검수 | 자체 파이프라인 → 자동 발행 |
| 데스킹 큐 | ✅ 이쪽이 채운다 | ❌ |

둘 다 같은 테이블(`news_reservoir`)을 쓰기 때문에 혼동하기 쉽다.
**"기사가 짧다/이상하다"는 대부분 이 스캐너 문제다.**

## 관련 학습 장치 (둘 다 검수 결과를 먹고 자란다)

- **문체 few-shot**: `/api/news/correction-examples` 로 최근 검수 교정 사례를 받아 프롬프트에 주입 (이 파일 `fetchCorrectionExamples`)
- **표기 사전**: 검수 발행 시 `lib/news/learn-corrections.ts` 가 표기 교정을 `news_alias_dictionary` 에 등록
