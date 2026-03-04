#!/bin/bash
# Betman Sync v2 - 다중 회차 + 프로빙 + Watchdog 연동
# cron: 매 2시간마다 실행
set -euo pipefail
trap 'log "ERROR: 비정상 종료 (line $LINENO, exit $?)"' ERR

source /opt/betman/.env
LOG="/opt/betman/sync.log"
LOCK="/tmp/betman-sync.lock"
BETMAN_BASE="https://www.betman.co.kr"

log() { echo "[$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

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

log "=== 동기화 v2 시작 ==="
TOTAL_GAMES=0
ERRORS=0
SYNCED_GMTS=""

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

# ── Helper: betman에서 게임 데이터 가져오기 ──
fetch_game_data() {
  local gmts="$1"
  local cookies=$(mktemp)

  # 쿠키 초기화
  curl -s -c "$cookies" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    "${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=G101&gmTs=${gmts}" > /dev/null 2>&1 || true

  local resp
  resp=$(curl -s -b "$cookies" -X POST \
    "${BETMAN_BASE}/buyPsblGame/gameInfoInq.do" \
    -H "Content-Type: application/json;charset=UTF-8" \
    -H "X-Requested-With: XMLHttpRequest" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    -H "Accept: application/json, text/javascript, */*; q=0.01" \
    -H "Accept-Language: ko-KR,ko;q=0.9" \
    -H "Origin: ${BETMAN_BASE}" \
    -H "Referer: ${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=G101&gmTs=${gmts}" \
    -d "{\"gmId\":\"G101\",\"gmTs\":${gmts},\"gameYear\":\"\",\"_sbmInfo\":{\"_sbmInfo\":{\"debugMode\":\"false\"}}}" 2>/dev/null) || true

  rm -f "$cookies"
  echo "$resp"
}

# ── Helper: 하나의 gmTs를 동기화 ──
sync_one_gmts() {
  local gmts="$1"
  log "--- gmTs $gmts 동기화 ---"

  # 게임 데이터 가져오기
  local games_resp
  games_resp=$(fetch_game_data "$gmts")

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
  log "  완료: ${games_count}건 (${is_new} round)"
  return 0
}

# ══════════════════════════════════════════
# Phase 1: Watchdog resync 요청 확인
# ══════════════════════════════════════════
RESYNC_NEEDED="false"
PROBE_START=""
PROBE_END=""

SYNC_STATE=$(curl_retry "${SUPABASE_URL}/rest/v1/betman_sync_state?select=latest_gm_ts,last_error,last_checked_at&order=updated_at.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null) || SYNC_STATE="[]"

LAST_ERROR=$(echo "$SYNC_STATE" | jq -r '.[0].last_error // empty' 2>/dev/null) || true
DB_GMTS=$(echo "$SYNC_STATE" | jq -r '.[0].latest_gm_ts // empty' 2>/dev/null) || true

# resync 플래그 확인 (watchdog이 JSON으로 last_error에 저장)
if echo "$LAST_ERROR" | jq -e '.needs_resync' > /dev/null 2>&1; then
  RESYNC_NEEDED="true"
  PROBE_START=$(echo "$LAST_ERROR" | jq -r '.probe_range_start // empty' 2>/dev/null)
  PROBE_END=$(echo "$LAST_ERROR" | jq -r '.probe_range_end // empty' 2>/dev/null)
  log "Watchdog resync 요청 감지! 범위: ${PROBE_START:-?} ~ ${PROBE_END:-?}"
fi

# ══════════════════════════════════════════
# Phase 2: betman에서 구매 가능 gmTs 전체 조회
# ══════════════════════════════════════════
COOKIES=$(mktemp)
curl -s -c "$COOKIES" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  "${BETMAN_BASE}/main/mainPage/gamebuy/buyableGameList.do" > /dev/null 2>&1 || true

RESP=$(curl -s -b "$COOKIES" -X POST \
  "${BETMAN_BASE}/buyPsblGame/inqBuyAbleGameInfoList.do" \
  -H "Content-Type: application/json;charset=UTF-8" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: application/json, text/javascript, */*; q=0.01" \
  -H "Accept-Language: ko-KR,ko;q=0.9" \
  -H "Referer: ${BETMAN_BASE}/main/mainPage/gamebuy/buyableGameList.do" \
  -d '{"_sbmInfo":{"_sbmInfo":{"debugMode":"false"}}}' 2>/dev/null) || RESP="{}"

rm -f "$COOKIES"

# 모든 G101 gmTs 추출 (v1은 하나만 가져왔음)
ALL_GMTS=$(echo "$RESP" | jq -r '.protoGames[]? | select(.gmId=="G101") | .gmTs' 2>/dev/null | sort -n) || ALL_GMTS=""

if [ -z "$ALL_GMTS" ]; then
  log "WARN: betman에서 gmTs를 가져올 수 없음"
else
  log "구매 가능 gmTs: $(echo $ALL_GMTS | tr '\n' ', ')"
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

if [ -n "$MAX_GMTS" ]; then
  log "프로빙 시작 (기준: $MAX_GMTS)..."
  for i in 1 2 3 4 5; do
    CANDIDATE=$((MAX_GMTS + i))
    # 이미 ALL_GMTS에 있으면 스킵
    if echo "$ALL_GMTS" | grep -q "^${CANDIDATE}$" 2>/dev/null; then
      continue
    fi

    PROBE_RESP=$(fetch_game_data "$CANDIDATE")
    PROBE_COUNT=$(echo "$PROBE_RESP" | jq '.compSchedules.datas | length' 2>/dev/null || echo 0)

    if [ -n "$PROBE_COUNT" ] && [ "$PROBE_COUNT" != "null" ] && [ "$PROBE_COUNT" -gt 0 ] 2>/dev/null; then
      log "  프로빙 성공: gmTs $CANDIDATE (${PROBE_COUNT}건)"
      PROBE_GMTS="${PROBE_GMTS} ${CANDIDATE}"
    fi
  done
fi

# Phase 3b: resync 요청의 프로빙 범위도 시도
if [ "$RESYNC_NEEDED" = "true" ] && [ -n "$PROBE_START" ]; then
  END=${PROBE_END:-$PROBE_START}
  for i in $(seq "$PROBE_START" "$END"); do
    # 이미 처리 대상에 있으면 스킵
    if echo "$ALL_GMTS $PROBE_GMTS" | grep -q "\b${i}\b" 2>/dev/null; then
      continue
    fi
    PROBE_RESP=$(fetch_game_data "$i")
    PROBE_COUNT=$(echo "$PROBE_RESP" | jq '.compSchedules.datas | length' 2>/dev/null || echo 0)
    if [ -n "$PROBE_COUNT" ] && [ "$PROBE_COUNT" != "null" ] && [ "$PROBE_COUNT" -gt 0 ] 2>/dev/null; then
      log "  resync 프로빙 성공: gmTs $i"
      PROBE_GMTS="${PROBE_GMTS} ${i}"
    fi
  done
fi

# ══════════════════════════════════════════
# Phase 4: 모든 gmTs 동기화
# ══════════════════════════════════════════
# 전체 동기화 대상 = 구매 가능 + 프로빙 발견
SYNC_TARGETS=$(echo "$ALL_GMTS $PROBE_GMTS" | tr ' ' '\n' | sort -n -u | grep -v '^$') || SYNC_TARGETS=""

if [ -z "$SYNC_TARGETS" ]; then
  log "동기화할 gmTs가 없음"
  # sync_state 업데이트 (checked)
  curl -sf -X PATCH \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    "${SUPABASE_URL}/rest/v1/betman_sync_state?order=updated_at.desc&limit=1" \
    -d "{\"last_checked_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"last_sync_action\":\"vps_checked\",\"last_error\":null}" > /dev/null 2>&1 || true
  log "=== 동기화 완료 (변경 없음) ==="
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

curl -sf -X PATCH \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  "${SUPABASE_URL}/rest/v1/betman_sync_state?order=updated_at.desc&limit=1" \
  -d "$PATCH_DATA" > /dev/null 2>&1 || log "WARN: sync_state 업데이트 실패"

log "=== 동기화 v2 완료 === $(echo $SYNCED_GMTS | wc -w | tr -d ' ')개 라운드, ${TOTAL_GAMES}건, 에러 ${ERRORS}건"
