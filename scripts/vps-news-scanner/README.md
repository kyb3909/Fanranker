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
# 배포 — SFTP 차단 시 --upload 대신 base64 경유 (2026-08-02 실사용 경로)
#   ⚠️ node --check 는 확장자를 보므로 임시 파일도 .mjs 로 둘 것
B64=$(base64 -w0 scripts/vps-news-scanner/news-scanner.mjs)
echo "echo '$B64' | base64 -d > /tmp/ns-new.mjs && node --check /tmp/ns-new.mjs && md5sum /tmp/ns-new.mjs" \
  | python scripts/vultr-exec.py     # 로컬 md5 와 대조 후 /opt/news-scanner/ 로 cp
#   ⚠️ cron 은 :00/:15/:30/:45 에 뜬다 — 그 직후에 올리면 한 회차를 놓친다

python scripts/vultr-exec.py --upload scripts/vps-news-scanner/news-scanner.mjs /opt/news-scanner/news-scanner.mjs

# 확인 (드라이런 — 초안 적재 없이 판별·작성 로그만)
python scripts/vultr-exec.py "cd /opt/news-scanner && SCANNER_DRY_RUN=1 SCANNER_MAX_LLM=3 bash run.sh"

# 로그
python scripts/vultr-exec.py "tail -40 /opt/news-scanner/cron.log"
```

## ⚠️ 레딧 예산: IP 당 60초에 요청 1건

2026-08-02 실측. 무인증 레딧 RSS 는 `x-ratelimit-used: 1 / remaining: 0 / reset: 48` —
**1분에 1건**만 준다. 그래서 매 run 전 소스 순회가 불가능하고, 회차 로테이션으로 나눠 돈다.

- 배분: run 당 12건 (스캔 6 = r/soccer 고정 + 5 순환 / 화력 6) → 45분에 한 바퀴
- 상태: `/opt/news-scanner/rotation.json` (커서. 지워도 0부터 다시 돌 뿐)
- 429 면 `x-ratelimit-reset` 만큼 자고 1회 재시도, 단계별 벽시계 상한으로 cron(15분) 침범 방지
- `run.sh` 에 `flock -n` — run 이 겹치면 이번 회차는 건너뛴다

> **증상 오독 주의**: 로그의 `비정상 응답 (r/xxx)` 은 그 서브레딧이 막힌 게 아니라
> 그 순간 예산이 없었다는 뜻이다. 단독 호출하면 200 이 온다.

**근본 해결은 OAuth** (`oauth.reddit.com`, 분당 100건 = 100배). 소스를 늘리면
(NBA 등) 로테이션으로는 못 버틴다 — 45개 소스면 한 바퀴에 2시간 15분.
OAuth 는 JSON API 도 열려서 화력 측정이 순위 합성이 아닌 **절대 점수**가 된다.

### 서브별 산출량 측정 (소스 정리 판단용)

```bash
# 초안까지 간 건수 / LLM 판정까지 간 후보 수 — 서브레딧별
python scripts/vultr-exec.py 'grep -oP "draft ✓ \[\K[^/]+" /opt/news-scanner/cron.log | sort | uniq -c | sort -rn'
python scripts/vultr-exec.py 'grep -oP "(draft ✓|skip) \[\K[^/]+" /opt/news-scanner/cron.log | sort | uniq -c | sort -rn'
```

⚠️ **2026-08-02 이전 로그는 오염돼 있다** — 그때까진 r/soccer + "운 좋은 자리 1개"만
성공해서, 특정 클럽이 높은 건 실력이 아니라 자리 덕이고 0 인 서브는 산출이 없는 게
아니라 한 번도 안 긁힌 것이다. 로테이션 가동(2026-08-02) 이후 구간만 볼 것.

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
