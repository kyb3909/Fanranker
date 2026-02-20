#!/bin/bash
# Betman Sync v3 - 고가용성 + 에러 리포팅 + 자동 복구
# cron: 매 2시간마다 실행
set -euo pipefail

source /opt/betman/.env
LOG="/opt/betman/sync.log"
LOCK="/tmp/betman-sync.lock"
BETMAN_BASE="https://www.betman.co.kr"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

log() { echo "[$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# ERR trap: 에러 발생 시 sync_state에 기록 후 종료
on_error() {
  local line=$1 code=$2
  log "ERROR: 비정상 종료 (line $line, exit $code)"
  # sync_state에 에러 기록 시도
  if [ -n "${SYNC_STATE_ID:-}" ]; then
    curl -sf -X PATCH \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      "${SUPABASE_URL}/rest/v1/betman_sync_state?id=eq.${SYNC_STATE_ID}" \
      -d "{\"last_checked_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"last_sync_action\":\"vps_error\",\"last_error\":\"line $line exit $code\"}" \
      > /dev/null 2>&1 || true
  fi
}
trap 'on_error $LINENO $?' ERR

# 중복 실행 방지
if [ -f "$LOCK" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -gt 1800 ]; then
    log "WARN: stale lock 제거 (${LOCK_AGE}s old)"
    rm -f "$LOCK"
  else
    log "SKIP: 이미 실행 중 (lock ${LOCK_AGE}s old)"
    exit 0
  fi
fi
trap "rm -f $LOCK" EXIT
touch "$LOCK"

log "=== 동기화 v3 시작 ==="
TOTAL_GAMES=0
ERRORS=0
SYNCED_GMTS=""
BETMAN_REACHABLE="unknown"

# ── Helper: curl with retry (Supabase용) ──
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

# ── Helper: betman HTTP 요청 (retry + 에러코드 추적) ──
betman_curl() {
  local url="$1"; shift
  local attempt=0 max_retries=3 delay=3
  local exit_code resp
  while [ $attempt -lt $max_retries ]; do
    set +e
    resp=$(curl -s --connect-timeout 15 --max-time 45 \
      -H "User-Agent: ${UA}" \
      -H "Accept-Language: ko-KR,ko;q=0.9" \
      "$@" "$url" 2>/dev/null)
    exit_code=$?
    set -e

    if [ $exit_code -eq 0 ] && [ -n "$resp" ]; then
      echo "$resp"
      return 0
    fi

    attempt=$((attempt + 1))
    if [ $attempt -lt $max_retries ]; then
      log "  betman retry ${attempt}/${max_retries} (curl exit $exit_code)"
      sleep $delay
      delay=$((delay * 2))
    fi
  done
  log "  betman 요청 실패 (curl exit $exit_code, ${max_retries}회 시도)"
  return 1
}

# ── Helper: betman 접속 가능 확인 ──
check_betman() {
  local http_code
  set +e
  http_code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 10 --max-time 20 \
    -H "User-Agent: ${UA}" "${BETMAN_BASE}/" 2>/dev/null)
  local exit_code=$?
  set -e

  if [ $exit_code -ne 0 ]; then
    log "betman 접속 불가 (curl exit $exit_code)"
    BETMAN_REACHABLE="false"
    return 1
  fi

  if [ "$http_code" = "200" ] || [ "$http_code" = "302" ] || [ "$http_code" = "301" ]; then
    BETMAN_REACHABLE="true"
    return 0
  fi

  log "betman 비정상 응답 (HTTP $http_code)"
  BETMAN_REACHABLE="false"
  return 1
}

# ── Helper: betman에서 게임 데이터 가져오기 (retry 포함) ──
fetch_game_data() {
  local gmts="$1"
  local attempt=0 max_retries=2 delay=3

  while [ $attempt -lt $max_retries ]; do
    local cookies=$(mktemp)

    # 쿠키 초기화 (gameSlip 페이지)
    set +e
    curl -s -c "$cookies" --connect-timeout 15 --max-time 30 \
      -H "User-Agent: ${UA}" \
      "${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=G101&gmTs=${gmts}" > /dev/null 2>&1
    local cookie_exit=$?
    set -e

    if [ $cookie_exit -ne 0 ]; then
      rm -f "$cookies"
      attempt=$((attempt + 1))
      [ $attempt -lt $max_retries ] && sleep $delay
      continue
    fi

    # 게임 데이터 요청
    local resp
    set +e
    resp=$(curl -s -b "$cookies" -X POST --connect-timeout 15 --max-time 45 \
      "${BETMAN_BASE}/buyPsblGame/gameInfoInq.do" \
      -H "Content-Type: application/json;charset=UTF-8" \
      -H "X-Requested-With: XMLHttpRequest" \
      -H "User-Agent: ${UA}" \
      -H "Accept: application/json, text/javascript, */*; q=0.01" \
      -H "Accept-Language: ko-KR,ko;q=0.9" \
      -H "Origin: ${BETMAN_BASE}" \
      -H "Referer: ${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=G101&gmTs=${gmts}" \
      -d "{\"gmId\":\"G101\",\"gmTs\":${gmts},\"gameYear\":\"\",\"_sbmInfo\":{\"_sbmInfo\":{\"debugMode\":\"false\"}}}" 2>/dev/null)
    local data_exit=$?
    set -e

    rm -f "$cookies"

    if [ $data_exit -eq 0 ] && [ -n "$resp" ]; then
      # JSON 유효성 검증
      if echo "$resp" | jq -e '.compSchedules' > /dev/null 2>&1; then
        echo "$resp"
        return 0
      else
        log "  gmTs $gmts: 응답은 받았으나 JSON 구조 불일치"
      fi
    fi

    attempt=$((attempt + 1))
    [ $attempt -lt $max_retries ] && sleep $delay
  done

  return 1
}

# ── Helper: 하나의 gmTs를 동기화 ──
sync_one_gmts() {
  local gmts="$1"
  log "--- gmTs $gmts 동기화 ---"

  # 게임 데이터 가져오기
  local games_resp
  if ! games_resp=$(fetch_game_data "$gmts"); then
    log "  betman 데이터 조회 실패, 스킵"
    ERRORS=$((ERRORS + 1))
    return 0
  fi

  local datas_count
  datas_count=$(echo "$games_resp" | jq '.compSchedules.datas | length' 2>/dev/null || echo 0)

  if [ -z "$datas_count" ] || [ "$datas_count" = "null" ] || [ "$datas_count" = "0" ]; then
    log "  데이터 없음, 스킵"
    return 0
  fi

  log "  게임 데이터: ${datas_count}건"

  # 라운드 생성/조회
  local round_id
  round_id=$(curl_retry "${SUPABASE_URL}/rest/v1/betman_rounds?select=id&gm_ts=eq.${gmts}&limit=1" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    | jq -r '.[0].id // empty' 2>/dev/null) || true

  local is_new="false"

  if [ -z "$round_id" ]; then
    # 새 라운드 생성
    local year=$(date +%Y)
    local deadline=$(date -d "+7 days" -u +%Y-%m-%dT23:59:59+09:00 2>/dev/null || date -u +%Y-%m-%dT23:59:59+09:00)

    local new_round
    new_round=$(curl_retry "${SUPABASE_URL}/rest/v1/betman_rounds" \
      -X POST \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=representation" \
      -d "{\"gm_ts\":\"${gmts}\",\"year\":${year},\"round\":${gmts},\"status\":\"open\",\"deadline\":\"${deadline}\"}") || true

    round_id=$(echo "$new_round" | jq -r '.[0].id // empty' 2>/dev/null)
    is_new="true"

    if [ -z "$round_id" ]; then
      log "  ERROR: 라운드 생성 실패"
      ERRORS=$((ERRORS + 1))
      return 1
    fi
    log "  새 라운드 생성: $round_id"
  else
    # 기존 라운드가 closed면 reopen
    curl -sf -X PATCH \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      "${SUPABASE_URL}/rest/v1/betman_rounds?id=eq.${round_id}&status=eq.closed" \
      -d '{"status":"open"}' > /dev/null 2>&1 || true
    log "  기존 라운드: $round_id"
  fi

  # 게임 파싱
  local JQ_FILTER='
[.compSchedules.datas[] |
  select((.[16] // 0) != 0 or (.[17] // 0) != 0 or (.[18] // 0) != 0) |
  ({"0":"일반","2":"핸디캡","5":"SUM","9":"언더오버","12":"핸디캡","14":"일반"}[.[19] | tostring] // "일반") as $gt |
  ({"SC":"축구","BK":"농구","VL":"배구","BS":"야구"}[.[0] // ""] // (.[0] // "축구")) as $sp |
  {
    round_id: $rid,
    game_no: (.[11] // 0),
    match_time: (if .[3] then ((.[3] / 1000 + 32400) | strftime("%Y-%m-%dT%H:%M:%S+09:00")) else null end),
    sport: $sp,
    league_code: (.[7] // ""),
    game_type: $gt,
    home_team_name: (.[14] // ""),
    away_team_name: (.[15] // ""),
    venue: (.[10] // null),
    status: "scheduled",
    handicap: (if $gt == "핸디캡" and (.[20] // null) != null and (.[20] // 0) != 0 then .[20] else null end),
    over_under_line: (if $gt == "언더오버" and (.[20] // null) != null and (.[20] // 0) != 0 then .[20] else null end),
    home_win_odds: (if $gt == "일반" or $gt == "핸디캡" then (if (.[16] // 0) > 0 then .[16] else null end) else null end),
    draw_odds: (if $gt == "일반" or $gt == "핸디캡" then (if (.[17] // 0) > 0 then .[17] else null end) else null end),
    away_win_odds: (if $gt == "일반" or $gt == "핸디캡" then (if (.[18] // 0) > 0 then .[18] else null end) else null end),
    over_odds: (if $gt == "언더오버" then (if (.[18] // 0) > 0 then .[18] else null end) else null end),
    under_odds: (if $gt == "언더오버" then (if (.[16] // 0) > 0 then .[16] else null end) else null end),
    odd_odds: (if $gt == "SUM" then (if (.[16] // 0) > 0 then .[16] else null end) else null end),
    even_odds: (if $gt == "SUM" then (if (.[18] // 0) > 0 then .[18] else null end) else null end)
  }
]'

  local games_json
  games_json=$(echo "$games_resp" | jq --arg rid "$round_id" "$JQ_FILTER" 2>/dev/null)
  local games_count=$(echo "$games_json" | jq 'length' 2>/dev/null || echo 0)
  log "  파싱: ${games_count}건"

  if [ "$games_count" = "0" ]; then
    log "  유효 게임 없음, 스킵"
    return 0
  fi

  # 배치 upsert
  local batch_size=100 offset=0
  while [ "$offset" -lt "$games_count" ]; do
    local batch=$(echo "$games_json" | jq ".[$offset:$((offset + batch_size))]")
    local http_code
    http_code=$(curl -sf -o /dev/null -w '%{http_code}' -X POST \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: resolution=merge-duplicates" \
      "${SUPABASE_URL}/rest/v1/betman_games?on_conflict=round_id,game_no" \
      -d "$batch" 2>/dev/null) || http_code="000"

    if [ "$http_code" != "201" ] && [ "$http_code" != "200" ]; then
      log "  WARN: batch offset=$offset 실패 (HTTP $http_code)"
      ERRORS=$((ERRORS + 1))
    fi
    offset=$((offset + batch_size))
  done

  TOTAL_GAMES=$((TOTAL_GAMES + games_count))
  log "  완료: ${games_count}건 (new=${is_new})"
  return 0
}

# ══════════════════════════════════════════
# Phase 0: sync_state 조회 + SYNC_STATE_ID 확보
# ══════════════════════════════════════════
SYNC_STATE=$(curl_retry "${SUPABASE_URL}/rest/v1/betman_sync_state?select=id,latest_gm_ts,last_error,last_checked_at&order=updated_at.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null) || SYNC_STATE="[]"

SYNC_STATE_ID=$(echo "$SYNC_STATE" | jq -r '.[0].id // empty' 2>/dev/null) || true
LAST_ERROR=$(echo "$SYNC_STATE" | jq -r '.[0].last_error // empty' 2>/dev/null) || true
DB_GMTS=$(echo "$SYNC_STATE" | jq -r '.[0].latest_gm_ts // empty' 2>/dev/null) || true

log "DB gmTs: ${DB_GMTS:-없음}, sync_state_id: ${SYNC_STATE_ID:-없음}"

# ══════════════════════════════════════════
# Phase 1: Watchdog resync 요청 확인
# ══════════════════════════════════════════
RESYNC_NEEDED="false"
PROBE_START=""
PROBE_END=""

if echo "$LAST_ERROR" | jq -e '.needs_resync' > /dev/null 2>&1; then
  RESYNC_NEEDED="true"
  PROBE_START=$(echo "$LAST_ERROR" | jq -r '.probe_range_start // empty' 2>/dev/null)
  PROBE_END=$(echo "$LAST_ERROR" | jq -r '.probe_range_end // empty' 2>/dev/null)
  log "Watchdog resync 요청 감지! 범위: ${PROBE_START:-?} ~ ${PROBE_END:-?}"
fi

# ══════════════════════════════════════════
# Phase 2: betman 접속 확인 + gmTs 조회
# ══════════════════════════════════════════
BETMAN_FAILURES=0

# betman 접속 가능 확인 (3회 retry)
for try in 1 2 3; do
  if check_betman; then
    break
  fi
  if [ $try -lt 3 ]; then
    log "betman 재시도 ${try}/3..."
    sleep $((try * 5))
  fi
done

ALL_GMTS=""

if [ "$BETMAN_REACHABLE" = "true" ]; then
  # 구매 가능 게임 목록 조회
  BUYABLE_RESP=""
  set +e
  BUYABLE_RESP=$(betman_curl "${BETMAN_BASE}/buyPsblGame/inqBuyAbleGameInfoList.do" \
    -X POST \
    -H "Content-Type: application/json;charset=UTF-8" \
    -H "X-Requested-With: XMLHttpRequest" \
    -H "Accept: application/json, text/javascript, */*; q=0.01" \
    -H "Origin: ${BETMAN_BASE}" \
    -H "Referer: ${BETMAN_BASE}/main/mainPage/gamebuy/buyableGameList.do" \
    -d '{"_sbmInfo":{"_sbmInfo":{"debugMode":"false"}}}')
  set -e

  ALL_GMTS=$(echo "$BUYABLE_RESP" | jq -r '.protoGames[]? | select(.gmId=="G101") | .gmTs' 2>/dev/null | sort -n) || ALL_GMTS=""

  if [ -n "$ALL_GMTS" ]; then
    log "구매 가능 gmTs: $(echo $ALL_GMTS | tr '\n' ', ')"
  else
    log "WARN: betman 응답에 G101 게임이 없음 (응답 크기: $(echo "$BUYABLE_RESP" | wc -c)b)"
    BETMAN_FAILURES=$((BETMAN_FAILURES + 1))
  fi
else
  log "ERROR: betman 접속 불가 (3회 시도 실패)"
  BETMAN_FAILURES=$((BETMAN_FAILURES + 1))
fi

# ══════════════════════════════════════════
# Phase 3: 다음 gmTs 프로빙 (새 회차 자동 감지)
# ══════════════════════════════════════════
PROBE_GMTS=""

if [ -n "$ALL_GMTS" ]; then
  MAX_GMTS=$(echo "$ALL_GMTS" | tail -1)
elif [ -n "$DB_GMTS" ]; then
  MAX_GMTS="$DB_GMTS"
else
  MAX_GMTS=""
fi

# betman이 접속 가능한 경우에만 프로빙
if [ -n "$MAX_GMTS" ] && [ "$BETMAN_REACHABLE" = "true" ]; then
  log "프로빙 시작 (기준: $MAX_GMTS)..."
  for i in 1 2 3 4 5; do
    CANDIDATE=$((MAX_GMTS + i))
    if echo "$ALL_GMTS" | grep -q "^${CANDIDATE}$" 2>/dev/null; then
      continue
    fi

    set +e
    PROBE_RESP=$(fetch_game_data "$CANDIDATE")
    PROBE_OK=$?
    set -e

    if [ $PROBE_OK -eq 0 ]; then
      PROBE_COUNT=$(echo "$PROBE_RESP" | jq '.compSchedules.datas | length' 2>/dev/null || echo 0)
      if [ -n "$PROBE_COUNT" ] && [ "$PROBE_COUNT" != "null" ] && [ "$PROBE_COUNT" -gt 0 ] 2>/dev/null; then
        log "  프로빙 성공: gmTs $CANDIDATE (${PROBE_COUNT}건)"
        PROBE_GMTS="${PROBE_GMTS} ${CANDIDATE}"
      fi
    fi
  done
fi

# Phase 3b: resync 요청의 프로빙 범위도 시도
if [ "$RESYNC_NEEDED" = "true" ] && [ -n "$PROBE_START" ] && [ "$BETMAN_REACHABLE" = "true" ]; then
  END=${PROBE_END:-$PROBE_START}
  for i in $(seq "$PROBE_START" "$END"); do
    if echo "$ALL_GMTS $PROBE_GMTS" | grep -q "\b${i}\b" 2>/dev/null; then
      continue
    fi
    set +e
    PROBE_RESP=$(fetch_game_data "$i")
    PROBE_OK=$?
    set -e
    if [ $PROBE_OK -eq 0 ]; then
      PROBE_COUNT=$(echo "$PROBE_RESP" | jq '.compSchedules.datas | length' 2>/dev/null || echo 0)
      if [ -n "$PROBE_COUNT" ] && [ "$PROBE_COUNT" != "null" ] && [ "$PROBE_COUNT" -gt 0 ] 2>/dev/null; then
        log "  resync 프로빙 성공: gmTs $i"
        PROBE_GMTS="${PROBE_GMTS} ${i}"
      fi
    fi
  done
fi

# ══════════════════════════════════════════
# Phase 4: 모든 gmTs 동기화
# ══════════════════════════════════════════
SYNC_TARGETS=$(echo "$ALL_GMTS $PROBE_GMTS" | tr ' ' '\n' | sort -n -u | grep -v '^$') || SYNC_TARGETS=""

if [ -z "$SYNC_TARGETS" ]; then
  log "동기화할 gmTs가 없음"

  # betman 불통 여부에 따라 다른 메시지 기록
  if [ "$BETMAN_REACHABLE" = "false" ]; then
    ERROR_JSON='"betman_unreachable"'
    ACTION="vps_error"
  else
    ERROR_JSON="null"
    ACTION="vps_checked"
  fi

  if [ -n "$SYNC_STATE_ID" ]; then
    curl -sf -X PATCH \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      "${SUPABASE_URL}/rest/v1/betman_sync_state?id=eq.${SYNC_STATE_ID}" \
      -d "{\"last_checked_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"last_sync_action\":\"${ACTION}\",\"last_error\":${ERROR_JSON}}" \
      > /dev/null 2>&1 || true
  fi

  log "=== 동기화 완료 (변경 없음, betman=${BETMAN_REACHABLE}) ==="
  exit 0
fi

log "동기화 대상: $(echo $SYNC_TARGETS | tr '\n' ', ')"

for gmts in $SYNC_TARGETS; do
  sync_one_gmts "$gmts" || true
  SYNCED_GMTS="${SYNCED_GMTS} ${gmts}"
done

# ══════════════════════════════════════════
# Phase 5: sync_state 업데이트
# ══════════════════════════════════════════
LATEST_GMTS=$(echo "$SYNCED_GMTS" | tr ' ' '\n' | sort -n | tail -1)
ACTIVE_ROUNDS_JSON=$(echo "$SYNCED_GMTS" | tr ' ' '\n' | sort -n -u | grep -v '^$' | jq -R . | jq -s .)
ACTION="vps_synced"
[ "$TOTAL_GAMES" = "0" ] && ACTION="vps_checked"
ERROR_MSG="null"
[ "$ERRORS" -gt 0 ] && ERROR_MSG="\"${ERRORS} batch errors\""
[ "$BETMAN_FAILURES" -gt 0 ] && [ "$TOTAL_GAMES" = "0" ] && ERROR_MSG="\"betman_partial_failure\""

PATCH_DATA=$(cat <<JSONEOF
{
  "latest_gm_ts": "${LATEST_GMTS}",
  "active_rounds": ${ACTIVE_ROUNDS_JSON},
  "last_checked_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "last_sync_action": "${ACTION}",
  "last_sync_games_count": ${TOTAL_GAMES},
  "last_error": ${ERROR_MSG}
}
JSONEOF
)

if [ -n "$SYNC_STATE_ID" ]; then
  curl -sf -X PATCH \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    "${SUPABASE_URL}/rest/v1/betman_sync_state?id=eq.${SYNC_STATE_ID}" \
    -d "$PATCH_DATA" > /dev/null 2>&1 || log "WARN: sync_state 업데이트 실패"
fi

log "=== 동기화 v3 완료 === $(echo $SYNCED_GMTS | wc -w | tr -d ' ')개 라운드, ${TOTAL_GAMES}건, 에러 ${ERRORS}건"
