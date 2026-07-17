#!/bin/bash
# Betman Monitor - 30분마다 실행, betman 상태만 체크 (동기화 안 함)
source /opt/betman/.env
LOG="/opt/betman/monitor.log"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

ts() { TZ=Asia/Seoul date '+%Y-%m-%d %H:%M:%S'; }

# 1. betman 구매 가능 목록 조회
RESP=$(curl -s --connect-timeout 10 --max-time 20 \
  -X POST \
  -H "User-Agent: ${UA}" \
  -H "Content-Type: application/json;charset=UTF-8" \
  -H "X-Requested-With: XMLHttpRequest" \
  -H "Accept: application/json" \
  -H "Referer: https://www.betman.co.kr/main/mainPage/gamebuy/buyableGameList.do" \
  -d '{"_sbmInfo":{"_sbmInfo":{"debugMode":"false"}}}' \
  "https://www.betman.co.kr/buyPsblGame/inqBuyAbleGameInfoList.do" 2>/dev/null) || RESP=""

GMTS_LIST=$(echo "$RESP" | jq -r '.protoGames[]? | select(.gmId=="G101") | .gmTs' 2>/dev/null | sort -n | tr '\n' ',' | sed 's/,$//')

# 2. DB 상태 조회
DB_STATE=$(curl -sf \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  "${SUPABASE_URL}/rest/v1/betman_sync_state?select=latest_gm_ts,last_sync_action,last_checked_at&limit=1" 2>/dev/null)
DB_GMTS=$(echo "$DB_STATE" | jq -r '.[0].latest_gm_ts // "?"' 2>/dev/null)
LAST_ACTION=$(echo "$DB_STATE" | jq -r '.[0].last_sync_action // "?"' 2>/dev/null)
LAST_CHECK=$(echo "$DB_STATE" | jq -r '.[0].last_checked_at // "?"' 2>/dev/null)

# 3. DB rounds 상태
OPEN_ROUNDS=$(curl -sf \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  "${SUPABASE_URL}/rest/v1/betman_rounds?select=gm_ts,status&status=eq.open&order=round.desc&limit=5" 2>/dev/null)
OPEN_LIST=$(echo "$OPEN_ROUNDS" | jq -r '.[].gm_ts' 2>/dev/null | tr '\n' ',' | sed 's/,$//')

# 4. 변화 감지
PREV_GMTS=""
[ -f /opt/betman/.last_gmts ] && PREV_GMTS=$(cat /opt/betman/.last_gmts)
echo "$GMTS_LIST" > /opt/betman/.last_gmts

CHANGE=""
if [ -n "$PREV_GMTS" ] && [ "$PREV_GMTS" != "$GMTS_LIST" ]; then
  CHANGE=" *** 변경 감지! (이전: $PREV_GMTS) ***"
fi

echo "[$(ts)] betman=[${GMTS_LIST:-없음}] db=$DB_GMTS open=[$OPEN_LIST] action=$LAST_ACTION${CHANGE}" >> "$LOG"
