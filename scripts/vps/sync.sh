#!/bin/bash
# Betman Sync v3 - 고가용성 + 에러 리포팅 + 자동 복구
# cron: 매 2시간마다 실행
set -uo pipefail
# 주의: set -e 사용하지 않음 (프로빙 실패 등 예상된 실패를 허용하기 위해)

source /opt/betman/.env
LOG="/opt/betman/sync.log"
LOCK="/tmp/betman-sync.lock"
BETMAN_BASE="https://www.betman.co.kr"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

log() { echo "[$(TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# EXIT trap: 스크립트 종료 시 비정상이면 sync_state에 기록
on_exit() {
  local code=$?
  rm -f "$LOCK" 2>/dev/null || true
  if [ $code -ne 0 ]; then
    log "ERROR: 비정상 종료 (exit $code)"
    if [ -n "${SYNC_STATE_ID:-}" ]; then
      curl -sf -X PATCH \
        -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        "${SUPABASE_URL}/rest/v1/betman_sync_state?id=eq.${SYNC_STATE_ID}" \
        -d "{\"last_checked_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"last_sync_action\":\"vps_error\",\"last_error\":\"script_crash_exit_$code\"}" \
        > /dev/null 2>&1 || true
    fi
  fi
}
trap on_exit EXIT

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
    resp=$(curl -s --connect-timeout 15 --max-time 45 \
      -H "User-Agent: ${UA}" \
      -H "Accept-Language: ko-KR,ko;q=0.9" \
      "$@" "$url" 2>/dev/null) || true
    exit_code=$?

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
  http_code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 10 --max-time 20 \
    -H "User-Agent: ${UA}" "${BETMAN_BASE}/" 2>/dev/null) || true
  local exit_code=$?

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
  local result=1

  while [ $attempt -lt $max_retries ]; do
    local cookies=$(mktemp)

    # 쿠키 초기화 (gameSlip 페이지)
    curl -s -c "$cookies" --connect-timeout 15 --max-time 30 \
      -H "User-Agent: ${UA}" \
      "${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=G101&gmTs=${gmts}" > /dev/null 2>&1
    local cookie_exit=$?

    if [ $cookie_exit -ne 0 ]; then
      rm -f "$cookies"
      attempt=$((attempt + 1))
      [ $attempt -lt $max_retries ] && sleep $delay
      continue
    fi

    # 게임 데이터 요청
    local resp
    resp=$(curl -s -b "$cookies" -X POST --connect-timeout 15 --max-time 45 \
      "${BETMAN_BASE}/buyPsblGame/gameInfoInq.do" \
      -H "Content-Type: application/json;charset=UTF-8" \
      -H "X-Requested-With: XMLHttpRequest" \
      -H "User-Agent: ${UA}" \
      -H "Accept: application/json, text/javascript, */*; q=0.01" \
      -H "Accept-Language: ko-KR,ko;q=0.9" \
      -H "Origin: ${BETMAN_BASE}" \
      -H "Referer: ${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=G101&gmTs=${gmts}" \
      -d "{\"gmId\":\"G101\",\"gmTs\":${gmts},\"gameYear\":\"\",\"_sbmInfo\":{\"_sbmInfo\":{\"debugMode\":\"false\"}}}" 2>/dev/null) || true
    local data_exit=$?

    rm -f "$cookies"

    if [ -n "$resp" ]; then
      # JSON 유효성 검증
      if echo "$resp" | jq -e '.compSchedules' > /dev/null 2>&1; then
        echo "$resp"
        result=0
        break
      fi
      # 구조 불일치는 프로빙에서 정상 (해당 회차가 없는 경우)
    fi

    attempt=$((attempt + 1))
    [ $attempt -lt $max_retries ] && sleep $delay
  done

  return $result
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

  # 게임 파싱 — 2026-04 betman 개편 후 keys 기반 매핑.
  # betman 이 컬럼을 shift 해도 key 이름만 유지되면 안 깨짐.
  # betTypId 매핑: 1/2=일반, 4/5=핸디캡, 7=언더오버, 9=SUM. 3(승N패)는 스키마 부적합으로 스킵.
  local JQ_FILTER='
. as $root |
($root.compSchedules.keys | to_entries | map({(.value): .key}) | add) as $idx |
[ $root.compSchedules.datas[] |
  . as $d |
  select(($d[$idx.winAllot] // 0) != 0 or ($d[$idx.drawAllot] // 0) != 0 or ($d[$idx.loseAllot] // 0) != 0) |
  ({"1":"일반","2":"일반","4":"핸디캡","5":"핸디캡","7":"언더오버","9":"SUM"}[$d[$idx.betTypId] | tostring]) as $gt |
  select($gt != null) |
  ({"SC":"축구","BK":"농구","VL":"배구","BS":"야구"}[$d[$idx.itemCode] // ""] // ($d[$idx.itemCode] // "축구")) as $sp |
  ($d[$idx.winAllot] // 0) as $wa |
  ($d[$idx.drawAllot] // 0) as $da |
  ($d[$idx.loseAllot] // 0) as $la |
  ($d[$idx.winHandi] // 0) as $wh |
  {
    round_id: $rid,
    game_no: ($d[$idx.matchSeq] // 0),
    match_time: (if $d[$idx.gameDate] then (($d[$idx.gameDate] / 1000 + 32400) | strftime("%Y-%m-%dT%H:%M:%S+09:00")) else null end),
    sport: $sp,
    league_code: ($d[$idx.leagueShortName] // $d[$idx.leagueCode] // ""),
    game_type: $gt,
    home_team_name: ($d[$idx.homeName] // ""),
    away_team_name: ($d[$idx.awayName] // ""),
    venue: ($d[$idx.meetStadiumFullName] // null),
    handicap: (if $gt == "핸디캡" then $wh else null end),
    over_under_line: (if $gt == "언더오버" then $wh else null end),
    home_win_odds: (if ($gt == "일반" or $gt == "핸디캡") and $wa > 0 then $wa else null end),
    draw_odds: (if ($gt == "일반" or $gt == "핸디캡") and $da > 0 then $da else null end),
    away_win_odds: (if ($gt == "일반" or $gt == "핸디캡") and $la > 0 then $la else null end),
    over_odds: (if $gt == "언더오버" and $la > 0 then $la else null end),
    under_odds: (if $gt == "언더오버" and $wa > 0 then $wa else null end),
    odd_odds: (if $gt == "SUM" and $wa > 0 then $wa else null end),
    even_odds: (if $gt == "SUM" and $la > 0 then $la else null end)
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

  # 배치 upsert — 실패 시 응답 body 첫 200자를 같이 로그 (이전 "HTTP 000" 은 -sf 가
  # 4xx 에서 exit code 비정상 만들어 || 분기로 가리던 문제 → -s 로 바꾸고 http_code +
  # body 를 한 번에 캡처).
  local batch_size=100 offset=0
  while [ "$offset" -lt "$games_count" ]; do
    local batch=$(echo "$games_json" | jq ".[$offset:$((offset + batch_size))]")
    local resp http_code body
    resp=$(curl -s -w $'\n__HTTP_CODE__%{http_code}' -X POST \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: resolution=merge-duplicates,return=minimal" \
      "${SUPABASE_URL}/rest/v1/betman_games?on_conflict=round_id,game_no" \
      -d "$batch" 2>&1) || resp="${resp}"$'\n__HTTP_CODE__curl_error'
    http_code=$(echo "$resp" | awk -F'__HTTP_CODE__' '{print $2}' | tail -1)
    body=$(echo "$resp" | sed 's/__HTTP_CODE__.*$//' | head -c 200)

    if [ "$http_code" != "201" ] && [ "$http_code" != "200" ] && [ "$http_code" != "204" ]; then
      log "  WARN: batch offset=$offset 실패 (HTTP ${http_code:-?}): ${body}"
      ERRORS=$((ERRORS + 1))
    fi
    offset=$((offset + batch_size))
  done

  TOTAL_GAMES=$((TOTAL_GAMES + games_count))
  log "  완료: ${games_count}건 (new=${is_new})"

  # ─────────────────────────────────────────────────────────────────────
  # 미지원 betTypId raw 캡처 (betman_unknown_games)
  # 정산/UI 미사용 — 신규 베팅 유형(전반전 등) 분석용. 실패해도 동기화는 진행.
  # ─────────────────────────────────────────────────────────────────────
  local UNKNOWN_FILTER='
. as $root |
($root.compSchedules.keys | to_entries | map({(.value): .key}) | add) as $idx |
[ $root.compSchedules.datas[] |
  . as $d |
  select(($d[$idx.winAllot] // 0) != 0 or ($d[$idx.drawAllot] // 0) != 0 or ($d[$idx.loseAllot] // 0) != 0) |
  ({"1":"일반","2":"일반","4":"핸디캡","5":"핸디캡","7":"언더오버","9":"SUM"}[$d[$idx.betTypId] | tostring]) as $gt |
  select($gt == null) |
  ({"SC":"축구","BK":"농구","VL":"배구","BS":"야구"}[$d[$idx.itemCode] // ""] // ($d[$idx.itemCode] // "")) as $sp |
  ($root.compSchedules.keys | to_entries | map({key: .value, value: $d[.key]}) | from_entries) as $raw |
  {
    source: "game",
    gm_ts: $gmts,
    game_no: ($d[$idx.matchSeq] // -1),
    bet_typ_id: ($d[$idx.betTypId] | tostring),
    handi_val: -1,
    sport: $sp,
    league_code: ($d[$idx.leagueShortName] // $d[$idx.leagueCode] // null),
    home_team_name: ($d[$idx.homeName] // null),
    away_team_name: ($d[$idx.awayName] // null),
    match_time: (if $d[$idx.gameDate] then (($d[$idx.gameDate] / 1000 + 32400) | strftime("%Y-%m-%dT%H:%M:%S+09:00")) else null end),
    raw_data: $raw,
    last_seen_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
  }
]'

  local unknown_json
  unknown_json=$(echo "$games_resp" | jq --arg gmts "$gmts" "$UNKNOWN_FILTER" 2>/dev/null)
  local unknown_count=$(echo "$unknown_json" | jq 'length' 2>/dev/null || echo 0)

  if [ -n "$unknown_count" ] && [ "$unknown_count" != "0" ] && [ "$unknown_count" != "null" ]; then
    local uk_resp uk_http_code uk_body
    uk_resp=$(curl -s -w $'\n__HTTP_CODE__%{http_code}' -X POST \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: resolution=merge-duplicates,return=minimal" \
      "${SUPABASE_URL}/rest/v1/betman_unknown_games?on_conflict=source,gm_ts,game_no,bet_typ_id,handi_val" \
      -d "$unknown_json" 2>&1) || uk_resp="${uk_resp}"$'\n__HTTP_CODE__curl_error'
    uk_http_code=$(echo "$uk_resp" | awk -F'__HTTP_CODE__' '{print $2}' | tail -1)
    uk_body=$(echo "$uk_resp" | sed 's/__HTTP_CODE__.*$//' | head -c 200)
    if [ "$uk_http_code" = "201" ] || [ "$uk_http_code" = "200" ] || [ "$uk_http_code" = "204" ]; then
      log "  미지원 betTypId 캡처: ${unknown_count}건"
    else
      log "  WARN: unknown_games upsert 실패 (HTTP ${uk_http_code:-?}): ${uk_body}"
    fi
  fi

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
  BUYABLE_RESP=$(betman_curl "${BETMAN_BASE}/buyPsblGame/inqBuyAbleGameInfoList.do" \
    -X POST \
    -H "Content-Type: application/json;charset=UTF-8" \
    -H "X-Requested-With: XMLHttpRequest" \
    -H "Accept: application/json, text/javascript, */*; q=0.01" \
    -H "Origin: ${BETMAN_BASE}" \
    -H "Referer: ${BETMAN_BASE}/main/mainPage/gamebuy/buyableGameList.do" \
    -d '{"_sbmInfo":{"_sbmInfo":{"debugMode":"false"}}}') || true

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

    PROBE_RESP=$(fetch_game_data "$CANDIDATE") || true
    PROBE_OK=$?

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
    PROBE_RESP=$(fetch_game_data "$i") || true
    PROBE_OK=$?
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
