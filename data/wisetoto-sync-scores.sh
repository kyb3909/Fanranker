#!/bin/bash
# wisetoto 실시간 점수 크롤링 → Vercel API 전송
# cron: */10 * * * * (10분마다 실행)
#
# wisetoto는 betman과 동일한 game_no + game_round(=gm_ts) 구조.
# POST /util/gameinfo/get_proto_list.htm 으로 진행 중인 경기 점수 수집.
# 종목 코드: sc=축구, bs=야구, bk=농구, vl=배구
set -euo pipefail
trap 'log "ERROR: 비정상 종료 (line $LINENO, exit $?)"' ERR

source /opt/betman/.env  # CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY 등
LOG="/opt/wisetoto/scores.log"
LOCK="/tmp/wisetoto-scores.lock"
WISETOTO_BASE="https://www.wisetoto.com"
API_BASE="${VERCEL_URL:-https://community-app-brown.vercel.app}"

log() { echo "[$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# 중복 실행 방지
if [ -f "$LOCK" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -gt 600 ]; then
    log "WARN: stale lock 제거 (${LOCK_AGE}s old)"
    rm -f "$LOCK"
  else
    log "SKIP: 이미 실행 중 (lock ${LOCK_AGE}s old)"
    exit 0
  fi
fi
trap "rm -f $LOCK" EXIT
touch "$LOCK"

log "=== wisetoto 점수 수집 시작 ==="

# ── Supabase 헤더 ──
SB_HEADERS=(
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  -H "Content-Type: application/json"
)

# ── Helper: curl with retry ──
curl_retry() {
  local url="$1"; shift
  local attempt=0 max_retries=3 delay=2
  while [ $attempt -lt $max_retries ]; do
    if OUTPUT=$(curl -sf --connect-timeout 10 --max-time 30 "$@" "$url" 2>/dev/null); then
      echo "$OUTPUT"
      return 0
    fi
    attempt=$((attempt + 1))
    if [ $attempt -lt $max_retries ]; then
      sleep $delay
      delay=$((delay * 2))
    fi
  done
  return 1
}

# ── Phase 1: 진행 중인 회차(gm_ts) 조회 ──
# betman_games에서 scheduled 또는 in_progress 상태인 경기의 회차 조회
SB_URL="${SUPABASE_URL}/rest/v1"

ACTIVE_ROUNDS=$(curl_retry "${SB_URL}/betman_rounds?select=id,gm_ts&status=in.(open,closed)&order=gm_ts.desc&limit=5" \
  "${SB_HEADERS[@]}") || {
  log "ERROR: 활성 회차 조회 실패"
  exit 1
}

ROUND_COUNT=$(echo "$ACTIVE_ROUNDS" | jq 'length')
if [ "$ROUND_COUNT" -eq 0 ]; then
  log "INFO: 진행 중인 회차 없음 → 종료"
  exit 0
fi

log "INFO: 활성 회차 ${ROUND_COUNT}개 발견"

# ── Phase 2: 각 회차별로 wisetoto에서 점수 수집 ──
GAME_YEAR=$(TZ=Asia/Seoul date '+%Y')
ALL_SCORES="[]"
TOTAL_GAMES=0

for ROW in $(echo "$ACTIVE_ROUNDS" | jq -c '.[]'); do
  GM_TS=$(echo "$ROW" | jq -r '.gm_ts')

  # wisetoto game_round = betman gm_ts
  GAME_ROUND="$GM_TS"

  log "INFO: 회차 ${GAME_ROUND} 점수 조회 중..."

  # wisetoto API 호출: 각 종목별로 조회
  for SPORT_CODE in sc bs bk vl; do
    RESPONSE=$(curl_retry "${WISETOTO_BASE}/util/gameinfo/get_proto_list.htm" \
      -X POST \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -H "Referer: ${WISETOTO_BASE}" \
      -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
      -d "game_year=${GAME_YEAR}&game_round=${GAME_ROUND}&game_code=${SPORT_CODE}") || {
      log "WARN: wisetoto 조회 실패 (round=${GAME_ROUND}, sport=${SPORT_CODE})"
      continue
    }

    # 빈 응답 또는 에러 체크
    if [ -z "$RESPONSE" ] || [ "$RESPONSE" = "null" ] || [ "$RESPONSE" = "[]" ]; then
      continue
    fi

    # JSON 파싱: game_no, home_score, away_score 추출
    # wisetoto 응답 형식: [{gm_no, h_score, a_score, ...}, ...]
    SCORES=$(echo "$RESPONSE" | jq -c --arg gr "$GAME_ROUND" '
      [.[] | select(.h_score != null and .h_score != "" and .a_score != null and .a_score != "") |
       {
         game_round: $gr,
         game_no: (.gm_no | tonumber),
         home_score: (.h_score | tonumber),
         away_score: (.a_score | tonumber)
       }
      ]
    ' 2>/dev/null) || {
      log "WARN: JSON 파싱 실패 (round=${GAME_ROUND}, sport=${SPORT_CODE})"
      continue
    }

    SCORE_COUNT=$(echo "$SCORES" | jq 'length')
    if [ "$SCORE_COUNT" -gt 0 ]; then
      ALL_SCORES=$(echo "$ALL_SCORES" "$SCORES" | jq -s '.[0] + .[1]')
      TOTAL_GAMES=$((TOTAL_GAMES + SCORE_COUNT))
      log "INFO: ${SPORT_CODE} ${SCORE_COUNT}건 점수 수집 (round=${GAME_ROUND})"
    fi

    # 요청 간 딜레이
    sleep 0.5
  done
done

if [ "$TOTAL_GAMES" -eq 0 ]; then
  log "INFO: 수집된 점수 없음 → 종료"
  exit 0
fi

log "INFO: 총 ${TOTAL_GAMES}건 점수 수집 완료, API 전송 중..."

# ── Phase 3: Vercel API로 전송 ──
PAYLOAD=$(jq -n --argjson scores "$ALL_SCORES" '{ scores: $scores }')

API_RESPONSE=$(curl_retry "${API_BASE}/api/betman/scores" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -d "$PAYLOAD") || {
  log "ERROR: API 전송 실패"
  exit 1
}

UPDATED=$(echo "$API_RESPONSE" | jq -r '.updated // 0')
SKIPPED=$(echo "$API_RESPONSE" | jq -r '.skipped // 0')
MSG=$(echo "$API_RESPONSE" | jq -r '.message // "unknown"')

log "INFO: API 응답 - updated=${UPDATED}, skipped=${SKIPPED}, message=${MSG}"

# 에러가 있으면 로그
ERRORS=$(echo "$API_RESPONSE" | jq -r '.errors // empty | .[]' 2>/dev/null)
if [ -n "$ERRORS" ]; then
  log "WARN: API 에러 - ${ERRORS}"
fi

log "=== wisetoto 점수 수집 완료 (${TOTAL_GAMES}건 수집, ${UPDATED}건 업데이트) ==="
