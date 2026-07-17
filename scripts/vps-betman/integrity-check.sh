#!/bin/bash
# Betman 결과 무결성 체크 + 자동 백필
# cron: 0 */4 * * * (4시간마다 실행)
#
# 1. 경기 시간 6시간 이상 지났는데 result=null인 게임 감지
# 2. score가 있으면 result를 계산해서 자동 백필
# 3. score도 없으면 해당 회차에 대해 fetch-results.sh 재실행 트리거
# 4. 결과를 로그에 기록
set -euo pipefail
trap 'log "ERROR: 비정상 종료 (line $LINENO, exit $?)"' ERR

source /opt/betman/.env
LOG="/opt/betman/integrity.log"

log() { echo "[$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

SB_HEADERS=(
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Content-Type: application/json"
)

curl_retry() {
  local url="$1"; shift
  local attempt=0 max_retries=3 delay=2
  while [ $attempt -lt $max_retries ]; do
    if OUTPUT=$(curl -sf --connect-timeout 10 --max-time 30 "$@" "$url" 2>/dev/null); then
      echo "$OUTPUT"
      return 0
    fi
    attempt=$((attempt + 1))
    [ $attempt -lt $max_retries ] && sleep $delay && delay=$((delay * 2))
  done
  return 1
}

log "=== 무결성 체크 시작 ==="

# 6시간 전 시각
CUTOFF=$(date -u -d '-6 hours' '+%Y-%m-%dT%H:%M:%SZ')

# ── Phase 1: result=null이고 경기 시간이 6시간 이상 지난 게임 조회 ──
MISSING=$(curl_retry \
  "${SUPABASE_URL}/rest/v1/betman_games?select=id,game_no,game_type,round_id,home_score,away_score,over_under_line,match_time&result=is.null&status=neq.cancelled&match_time=lt.${CUTOFF}&order=match_time.desc&limit=200" \
  "${SB_HEADERS[@]}" 2>/dev/null) || MISSING="[]"

MISSING_COUNT=$(echo "$MISSING" | jq 'length' 2>/dev/null || echo 0)

if [ "$MISSING_COUNT" = "0" ]; then
  log "모든 경기 결과 정상 (result=null 0건)"
  exit 0
fi

log "result=null 감지: ${MISSING_COUNT}건"

# ── Phase 2: score가 있는 게임은 자동 백필 ──
BACKFILLED=0
NEED_REFETCH_ROUNDS=""

for ROW in $(echo "$MISSING" | jq -c '.[]'); do
  GAME_ID=$(echo "$ROW" | jq -r '.id')
  GAME_TYPE=$(echo "$ROW" | jq -r '.game_type')
  HOME_SCORE=$(echo "$ROW" | jq '.home_score')
  AWAY_SCORE=$(echo "$ROW" | jq '.away_score')
  OU_LINE=$(echo "$ROW" | jq '.over_under_line')
  ROUND_ID=$(echo "$ROW" | jq -r '.round_id')

  # score가 없으면 재수집 대상
  if [ "$HOME_SCORE" = "null" ] || [ "$AWAY_SCORE" = "null" ]; then
    NEED_REFETCH_ROUNDS="${NEED_REFETCH_ROUNDS} ${ROUND_ID}"
    continue
  fi

  # score가 있으면 result 계산
  RESULT=""
  TOTAL=$((HOME_SCORE + AWAY_SCORE))

  case "$GAME_TYPE" in
    SUM)
      if [ $((TOTAL % 2)) -eq 1 ]; then RESULT="odd"; else RESULT="even"; fi
      ;;
    일반|핸디캡|S핸디캡)
      if [ "$HOME_SCORE" -gt "$AWAY_SCORE" ]; then RESULT="home"
      elif [ "$HOME_SCORE" -lt "$AWAY_SCORE" ]; then RESULT="away"
      else RESULT="draw"; fi
      ;;
    언더오버|S언더오버)
      if [ "$OU_LINE" != "null" ] && [ -n "$OU_LINE" ]; then
        OVER=$(echo "$TOTAL > $OU_LINE" | bc -l 2>/dev/null || echo "")
        if [ "$OVER" = "1" ]; then RESULT="over"; else RESULT="under"; fi
      fi
      ;;
  esac

  if [ -z "$RESULT" ]; then
    NEED_REFETCH_ROUNDS="${NEED_REFETCH_ROUNDS} ${ROUND_ID}"
    continue
  fi

  # DB 업데이트
  HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' -X PATCH \
    "${SB_HEADERS[@]}" \
    "${SUPABASE_URL}/rest/v1/betman_games?id=eq.${GAME_ID}" \
    -d "{\"result\":\"${RESULT}\",\"status\":\"completed\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
    2>/dev/null) || HTTP_CODE="000"

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
    BACKFILLED=$((BACKFILLED + 1))
  fi
done

log "자동 백필: ${BACKFILLED}건"

# ── Phase 3: score가 없는 게임의 회차에 대해 fetch-results 재실행 ──
UNIQUE_ROUNDS=$(echo "$NEED_REFETCH_ROUNDS" | tr ' ' '\n' | sort -u | grep -v '^$' || true)
REFETCH_COUNT=0

for RID in $UNIQUE_ROUNDS; do
  # round_id로 gm_ts 조회
  ROUND_DATA=$(curl_retry \
    "${SUPABASE_URL}/rest/v1/betman_rounds?select=gm_ts,status&id=eq.${RID}" \
    "${SB_HEADERS[@]}" 2>/dev/null) || ROUND_DATA="[]"

  GMTS=$(echo "$ROUND_DATA" | jq -r '.[0].gm_ts // empty' 2>/dev/null)
  ROUND_STATUS=$(echo "$ROUND_DATA" | jq -r '.[0].status // empty' 2>/dev/null)

  if [ -z "$GMTS" ]; then
    log "  WARN: round_id=${RID} → gm_ts 없음, 스킵"
    continue
  fi

  # settled 상태여도 재수집 시도 (settled를 open으로 되돌림)
  if [ "$ROUND_STATUS" = "settled" ]; then
    curl -sf -o /dev/null -X PATCH \
      "${SB_HEADERS[@]}" \
      "${SUPABASE_URL}/rest/v1/betman_rounds?id=eq.${RID}" \
      -d "{\"status\":\"open\"}" 2>/dev/null || true
    log "  회차 ${GMTS} settled → open 복원 (재수집 위해)"
  fi

  REFETCH_COUNT=$((REFETCH_COUNT + 1))
  log "  재수집 필요: 회차 ${GMTS} (round_id=${RID})"
done

# ── Phase 4: 백필된 게임이 있으면 정산 트리거 ──
if [ "$BACKFILLED" -gt 0 ]; then
  log "백필 후 정산 트리거..."
  # 백필된 게임의 daily_round_id 수집해서 정산 호출
  DAILY_ROUNDS=$(curl_retry \
    "${SUPABASE_URL}/rest/v1/betman_games?select=daily_round_id&result=is.not.null&status=eq.completed&updated_at=gte.$(date -u -d '-1 hour' '+%Y-%m-%dT%H:%M:%SZ')&limit=100" \
    "${SB_HEADERS[@]}" 2>/dev/null) || DAILY_ROUNDS="[]"

  UNIQUE_DR_IDS=$(echo "$DAILY_ROUNDS" | jq -r '.[].daily_round_id // empty' 2>/dev/null | sort -u | grep -v '^$' || true)

  for DR_ID in $UNIQUE_DR_IDS; do
    SETTLE_RESULT=$(curl_retry \
      "${APP_URL}/api/betman/settle" \
      -X POST \
      -H "Authorization: Bearer ${CRON_SECRET}" \
      -H "Content-Type: application/json" \
      -d "{\"daily_round_id\":\"${DR_ID}\"}" 2>/dev/null) || SETTLE_RESULT="{}"

    SETTLED=$(echo "$SETTLE_RESULT" | jq '.settled // 0' 2>/dev/null || echo 0)
    log "  정산 daily_round=${DR_ID}: ${SETTLED}건"
  done
fi

log "=== 무결성 체크 완료 === 백필 ${BACKFILLED}건, 재수집 대상 ${REFETCH_COUNT}회차"
