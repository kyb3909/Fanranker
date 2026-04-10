# Vultr VPS Deploy Guide — News Agents

뉴스 에이전트 파이프라인을 Vultr 서울 VPS에 배포하고 30분 cron으로 돌리는 가이드.

## 전제

- Vultr VPS에 SSH 접속 가능 (`ssh root@[IP]`)
- 기존 betman/crawlers가 이미 돌고 있음 (Node, cron 검증됨)
- `data/crawlers/.env`에 `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY` 세 값 필요

## Step 1: 코드 배포

프로젝트 루트를 Vultr에 동기화. 방법은 환경에 맞게 선택:

### Option A: git clone (처음이라면)
```bash
ssh root@[VULTR_IP]
cd /opt
git clone [repo-url] community
cd community
```

### Option B: rsync (이미 있다면)
```bash
# 로컬에서 Vultr로 동기화 (Windows PowerShell)
rsync -avz --exclude node_modules --exclude .next \
  "D:/Projects/새 폴더/adding(test)/community/" \
  root@[VULTR_IP]:/opt/community/
```

### Option C: git pull (이미 clone돼 있다면)
```bash
ssh root@[VULTR_IP]
cd /opt/community
git pull
```

## Step 2: 환경변수 확인

```bash
cd /opt/community

# crawlers .env에 3개 키가 있는지 확인
grep -c 'SUPABASE_URL\|SUPABASE_SERVICE_KEY\|OPENAI_API_KEY' data/crawlers/.env
# 3이 나와야 함

# OPENAI_API_KEY가 없으면 추가
echo 'OPENAI_API_KEY=sk-...' >> data/crawlers/.env
```

## Step 3: 의존성 확인

```bash
# Node 18+ 필요 (native fetch)
node --version   # v18.x 이상

# crawlers 의존성 (supabase-js, openai) 이미 설치돼 있어야 함
ls data/crawlers/node_modules/@supabase data/crawlers/node_modules/openai
# 두 디렉터리 모두 존재해야 함

# 없으면:
cd data/crawlers && npm install && cd ../..
```

## Step 4: 첫 수동 실행 (검증)

```bash
cd /opt/community

# dry run으로 먼저 확인
bash data/agents/scripts/run-cycle.sh --dry-run
# 로그 확인
cat data/agents/logs/cycle-$(date +%Y%m%d).log

# 문제 없으면 실제 실행
bash data/agents/scripts/run-cycle.sh
# 로그 확인
tail -50 data/agents/logs/cycle-$(date +%Y%m%d).log

# reservoir 상태 확인
node data/agents/scripts/verify-phase-a.js
```

기대 결과:
- scout fetches ~5-25 items (시간대에 따라)
- credibility filter passes ~30-40%
- desk approves items with known entities
- writer produces Korean drafts

## Step 5: Cron 등록

```bash
crontab -e
```

아래 줄 추가:

```cron
# 뉴스 에이전트: 30분마다 1 cycle
*/30 * * * * cd /opt/community && bash data/agents/scripts/run-cycle.sh >> data/agents/logs/cron.log 2>&1
```

저장 후 확인:
```bash
crontab -l | grep news-agent
# 또는
crontab -l | grep run-cycle
```

## Step 6: 모니터링

### 로그 확인
```bash
# 오늘 cycle 로그
tail -100 /opt/community/data/agents/logs/cycle-$(date +%Y%m%d).log

# cron 로그 (stdout/stderr)
tail -50 /opt/community/data/agents/logs/cron.log

# 마지막 cycle 성공 여부
grep "Cycle finished" /opt/community/data/agents/logs/cycle-$(date +%Y%m%d).log | tail -5
```

### reservoir 상태
```bash
cd /opt/community
set -a; source data/crawlers/.env; set +a
node data/agents/scripts/verify-phase-a.js
```

### Supabase에서 직접
```sql
-- 단계별 큐 길이
SELECT * FROM news_reservoir_queue_lengths;

-- 오늘 drafted 목록
SELECT draft->>'headline' AS 헤드라인, draft->>'body' AS 본문
FROM news_reservoir
WHERE status = 'drafted'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

-- hold 큐 (alias dictionary 확장 후보)
SELECT raw->>'title' AS 제목, source->>'domain' AS 출처, decision->>'reason' AS 사유
FROM news_reservoir
WHERE status = 'desk_held'
ORDER BY created_at DESC;
```

## 트러블슈팅

### cron이 안 돌아요
```bash
systemctl status cron        # cron 서비스 확인
grep "run-cycle" /var/log/syslog | tail -10  # 시스템 로그
```

### "Previous cycle still running" 반복
```bash
# lock 파일 확인
ls -la /tmp/news-agents-cycle.lock
# 좀비 lock 해제 (확인 후)
rm /tmp/news-agents-cycle.lock
```

### OpenAI rate limit
- model-tiers.json의 rpm 값 확인
- 30분 간격이면 거의 안 걸림 (cycle당 11~25 요청)
- 걸리면 로그에 OpenAI error 출력됨

### Reddit RSS 차단
- Vultr 서울 IP는 보통 괜찮지만 간헐적 차단 발생
- scout 로그에 "blocked by TLS fingerprint" 있으면 일시적 — 다음 cycle에 복구
- 지속되면 User-Agent 교체 고려

## 안정화 후 조정 (선택)

### lookback_hours 줄이기
`config/subreddits.json`의 `scout.lookback_hours`를 24 → 6으로 줄여도 됨.
30분마다 도니까 6시간 이전 글은 이미 이전 cycle에서 다 잡음.

### subreddit 추가
`config/subreddits.json`의 `subreddits` 배열에 추가:
```json
{ "name": "PremierLeague", "min_score": 80, "weight": 0.95, "tier1_flairs": ["News"] }
```

### alias dictionary 확장
desk_held 큐를 주기적으로 보고 `config/alias-seeds.json`에 누락 인물 추가 후:
```bash
set -a; source data/crawlers/.env; set +a
node data/agents/scripts/seed-aliases.js
```
