#!/bin/bash
# Betman 경기 결과 수집 + 자동 정산
# cron: 30 */2 * * * (sync.sh 30분 후 실행)
#
# 1. Supabase에서 활성 회차(open/closed) 조회
# 2. betman inqWinrstDetlBody.do로 결과 수집
# 3. Supabase REST로 betman_games 업데이트
# 4. /api/betman/settle API 호출 → 자동 정산 (볼 반환 없음, 포인트만 기록)
set -euo pipefail
trap 'log "ERROR: 비정상 종료 (line $LINENO, exit $?)"' ERR

source /opt/betman/.env
LOG="/opt/betman/results.log"
LOCK="/tmp/betman-results.lock"
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

log "=== 결과 수집 시작 ==="

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

# ── Phase 1: 활성 회차 조회 ──
ACTIVE_ROUNDS=$(curl_retry \
  "${SUPABASE_URL}/rest/v1/betman_rounds?select=id,gm_ts&status=in.(open,closed)&order=gm_ts.desc&limit=3" \
  "${SB_HEADERS[@]}" 2>/dev/null) || ACTIVE_ROUNDS="[]"

GMTS_LIST=$(echo "$ACTIVE_ROUNDS" | jq -r '.[].gm_ts' 2>/dev/null) || GMTS_LIST=""

if [ -z "$GMTS_LIST" ]; then
  log "활성 회차 없음, 종료"
  exit 0
fi

log "활성 회차: $(echo $GMTS_LIST | tr '\n' ', ')"

TOTAL_UPDATED=0
TOTAL_SETTLED=0
ERRORS=0

# ── Phase 2: 각 회차별 결과 수집 ──
for GMTS in $GMTS_LIST; do
  log "--- gmTs $GMTS 결과 수집 ---"

  # 쿠키 초기화 (betman 세션)
  COOKIES=$(mktemp)
  curl -s -c "$COOKIES" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    "${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=G101&gmTs=${GMTS}" \
    > /dev/null 2>&1 || true

  # 결과 API 호출
  RESULT_RESP=$(curl -s -b "$COOKIES" -X POST \
    "${BETMAN_BASE}/gamebuy/winrst/inqWinrstDetlBody.do" \
    -H "Content-Type: application/json;charset=UTF-8" \
    -H "X-Requested-With: XMLHttpRequest" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    -H "Accept: application/json, text/javascript, */*; q=0.01" \
    -H "Accept-Language: ko-KR,ko;q=0.9" \
    -H "Origin: ${BETMAN_BASE}" \
    -H "Referer: ${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=G101&gmTs=${GMTS}" \
    -d "{\"gmId\":\"G101\",\"gmTs\":${GMTS},\"_sbmInfo\":{\"_sbmInfo\":{\"debugMode\":\"false\"}}}" \
    2>/dev/null) || RESULT_RESP="{}"

  rm -f "$COOKIES"

  # detlBody 배열 추출
  ITEMS_COUNT=$(echo "$RESULT_RESP" | jq '.detlBody | length' 2>/dev/null || echo 0)

  if [ -z "$ITEMS_COUNT" ] || [ "$ITEMS_COUNT" = "null" ] || [ "$ITEMS_COUNT" = "0" ]; then
    log "  결과 데이터 없음 (아직 미발표), 스킵"
    continue
  fi

  log "  결과 데이터: ${ITEMS_COUNT}건"

  # round_id 조회
  ROUND_ID=$(echo "$ACTIVE_ROUNDS" | jq -r --arg gt "$GMTS" '.[] | select(.gm_ts == $gt) | .id' 2>/dev/null)
  if [ -z "$ROUND_ID" ]; then
    log "  ERROR: round_id 찾을 수 없음"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # ── jq로 결과 파싱 + 실제 점수 매핑 ──
  # HANDI_VAL: 0,14=일반(승무패/승1패/승5패), 2=핸디캡, 9=언더오버, 5=SUM,
  #            21=승패2way(야구/농구), 23=핸디캡(야구/농구), 27=SUM(야구/농구)
  # GAME_RESULT: 0=WIN(홈승/언더), 1=DRAW, 2=LOSE(원정승/오버), 4=취소
  PARSED=$(echo "$RESULT_RESP" | jq '
    # 1단계: 풀타임 점수 소스에서 실제 점수 맵 구축 (전반 마켓 제외)
    (.detlBody | map(select(
       ((.HANDI_VAL // 0) == 0 or (.HANDI_VAL // 0) == 14 or (.HANDI_VAL // 0) == 21)
       and ((.BETTYP_NM // "") | contains("전반") | not)
     ))
     | map({
         key: ((.HOME_TEAM // "" | ltrimstr(" ") | rtrimstr(" ")) + "|" + (.AWAY_TEAM // "" | ltrimstr(" ") | rtrimstr(" ")) + "|" + (.FIX_MCH_DTM // "")),
         value: (.MCH_SCORE // "" | split(":") | if length == 2 and (.[0] | length > 0) and (.[1] | length > 0) then {home: (.[0] | tonumber), away: (.[1] | tonumber)} else null end)
       })
     | map(select(.value != null))
     | from_entries
    ) as $scoreMap |

    # 2단계: 각 항목 매핑
    [.detlBody[] |
      ((.HANDI_VAL // 0) | tostring) as $hv |
      ({"0":"일반","14":"일반","2":"핸디캡","9":"언더오버","5":"SUM","6":"S핸디캡","7":"S언더오버","21":"승패2way","23":"핸디캡","27":"SUM"}[$hv] // "일반") as $gt |
      (.GAME_RESULT // "" | tostring) as $gr |

      # result 매핑
      (if $gr == "4" then "cancelled"
       elif $gt == "일반" or $gt == "핸디캡" or $gt == "S핸디캡" then
         (if $gr == "0" then "home" elif $gr == "1" then "draw" elif $gr == "2" then "away" else "" end)
       elif $gt == "승패2way" then
         (if $gr == "0" then "home" elif $gr == "2" then "away" else "" end)
       elif $gt == "언더오버" or $gt == "S언더오버" then
         (if $gr == "0" then "under" elif $gr == "2" then "over" else "" end)
       elif $gt == "SUM" then
         (if $gr == "0" then "odd" elif $gr == "2" then "even" else "" end)
       else "" end) as $result |

      # status 매핑
      (if $gr == "4" then "cancelled"
       elif $gr == "" or $gr == "null" then "scheduled"
       else "completed" end) as $status |

      # 점수: 일반/승패2way는 MCH_SCORE에서, 핸디캡/언오버/SUM은 풀타임 점수 참조
      ((.HOME_TEAM // "" | ltrimstr(" ") | rtrimstr(" ")) + "|" + (.AWAY_TEAM // "" | ltrimstr(" ") | rtrimstr(" ")) + "|" + (.FIX_MCH_DTM // "")) as $key |
      (if $gt == "일반" or $gt == "승패2way" then
        (.MCH_SCORE // "" | split(":") | if length == 2 and (.[0] | length > 0) and (.[1] | length > 0) then {home: (.[0] | tonumber), away: (.[1] | tonumber)} else null end)
       else
        ($scoreMap[$key] // null)
       end) as $score |

      # 결과가 없는 건(아직 미완료)은 제외
      select($status != "scheduled") |

      {
        game_no: (.GM_SEQ // 0),
        home_score: (if $score then $score.home else null end),
        away_score: (if $score then $score.away else null end),
        result: $result,
        status: $status
      }
    ]
  ' 2>/dev/null)

  PARSED_COUNT=$(echo "$PARSED" | jq 'length' 2>/dev/null || echo 0)

  if [ "$PARSED_COUNT" = "0" ]; then
    log "  파싱된 결과 없음 (모두 미완료), 스킵"
    continue
  fi

  log "  파싱 완료: ${PARSED_COUNT}건"

  # ── Phase 3: Supabase REST로 게임 결과 업데이트 ──
  UPDATED=0
  for ROW in $(echo "$PARSED" | jq -c '.[]'); do
    GAME_NO=$(echo "$ROW" | jq '.game_no')
    STATUS=$(echo "$ROW" | jq -r '.status')
    RESULT=$(echo "$ROW" | jq -r '.result')
    HOME_SCORE=$(echo "$ROW" | jq '.home_score')
    AWAY_SCORE=$(echo "$ROW" | jq '.away_score')

    # 핸디캡/언더오버/SUM에서 점수가 null이면 DB의 같은 경기 일반 타입에서 조회 (fallback)
    if [ "$HOME_SCORE" = "null" ] && [ "$AWAY_SCORE" = "null" ] && [ "$STATUS" = "completed" ]; then
      DB_SCORE=$(curl_retry \
        "${SUPABASE_URL}/rest/v1/betman_games?select=home_score,away_score&round_id=eq.${ROUND_ID}&game_type=eq.일반&home_score=not.is.null&game_no=lt.${GAME_NO}&order=game_no.desc&limit=1" \
        "${SB_HEADERS[@]}" 2>/dev/null) || DB_SCORE="[]"
      DB_HOME=$(echo "$DB_SCORE" | jq '.[0].home_score // empty' 2>/dev/null)
      DB_AWAY=$(echo "$DB_SCORE" | jq '.[0].away_score // empty' 2>/dev/null)
      if [ -n "$DB_HOME" ] && [ -n "$DB_AWAY" ]; then
        HOME_SCORE="$DB_HOME"
        AWAY_SCORE="$DB_AWAY"
      fi
    fi

    # PATCH 데이터 구성
    PATCH_DATA="{\"status\":\"${STATUS}\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""

    if [ "$RESULT" != "" ] && [ "$RESULT" != "null" ]; then
      PATCH_DATA="${PATCH_DATA},\"result\":\"${RESULT}\""
    fi
    if [ "$HOME_SCORE" != "null" ]; then
      PATCH_DATA="${PATCH_DATA},\"home_score\":${HOME_SCORE}"
    fi
    if [ "$AWAY_SCORE" != "null" ]; then
      PATCH_DATA="${PATCH_DATA},\"away_score\":${AWAY_SCORE}"
    fi
    PATCH_DATA="${PATCH_DATA}}"

    HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' -X PATCH \
      "${SB_HEADERS[@]}" \
      "${SUPABASE_URL}/rest/v1/betman_games?round_id=eq.${ROUND_ID}&game_no=eq.${GAME_NO}" \
      -d "$PATCH_DATA" 2>/dev/null) || HTTP_CODE="000"

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
      UPDATED=$((UPDATED + 1))
    fi
  done

  log "  게임 업데이트: ${UPDATED}/${PARSED_COUNT}건"
  TOTAL_UPDATED=$((TOTAL_UPDATED + UPDATED))

  # ─────────────────────────────────────────────────────────────────────
  # 미지원 HANDI_VAL / 매핑 실패 GAME_RESULT raw 캡처 (betman_unknown_games)
  # 정산/UI 미사용 — 신규 베팅 유형 분석용. 실패해도 결과 수집은 진행.
  # ─────────────────────────────────────────────────────────────────────
  UNKNOWN_RESULTS=$(echo "$RESULT_RESP" | jq --arg gmts "$GMTS" '
    [ .detlBody[] |
      . as $item |
      ((.HANDI_VAL // 0) | tostring) as $hv |
      ({"0":"일반","14":"일반","2":"핸디캡","9":"언더오버","5":"SUM","6":"S핸디캡","7":"S언더오버","21":"승패2way","23":"핸디캡","27":"SUM"}[$hv]) as $gt_known |
      (.GAME_RESULT // "" | tostring) as $gr |
      (if $gr == "4" then "cancelled"
       elif $gt_known == "일반" or $gt_known == "핸디캡" or $gt_known == "S핸디캡" then
         (if $gr == "0" then "home" elif $gr == "1" then "draw" elif $gr == "2" then "away" else "" end)
       elif $gt_known == "승패2way" then
         (if $gr == "0" then "home" elif $gr == "2" then "away" else "" end)
       elif $gt_known == "언더오버" or $gt_known == "S언더오버" then
         (if $gr == "0" then "under" elif $gr == "2" then "over" else "" end)
       elif $gt_known == "SUM" then
         (if $gr == "0" then "odd" elif $gr == "2" then "even" else "" end)
       else "" end) as $mapped |
      # capture: HANDI_VAL 미지원 OR (게임 끝났는데 결과 매핑 실패)
      select(
        ($gt_known == null and $gr != "" and $gr != "null") or
        ($mapped == "" and $gr != "" and $gr != "null" and $gr != "4")
      ) |
      (.MCH_SCORE // "" | split(":") | if length == 2 and (.[0] | length > 0) and (.[1] | length > 0) then {home: (.[0] | tonumber), away: (.[1] | tonumber)} else null end) as $score |
      {
        source: "result",
        gm_ts: $gmts,
        game_no: (.GM_SEQ // -1),
        bet_typ_id: "",
        handi_val: (.HANDI_VAL // -1),
        game_result: $gr,
        mch_score: (.MCH_SCORE // null),
        home_score: (if $score then $score.home else null end),
        away_score: (if $score then $score.away else null end),
        home_team_name: ((.HOME_TEAM // "") | ltrimstr(" ") | rtrimstr(" ") | (if . == "" then null else . end)),
        away_team_name: ((.AWAY_TEAM // "") | ltrimstr(" ") | rtrimstr(" ") | (if . == "" then null else . end)),
        match_time: ((.FIX_MCH_DTM // "" | tostring) as $t | if ($t | length) >= 12 then ($t[0:4] + "-" + $t[4:6] + "-" + $t[6:8] + "T" + $t[8:10] + ":" + $t[10:12] + ":" + (if ($t|length) >= 14 then $t[12:14] else "00" end) + "+09:00") else null end),
        raw_data: $item,
        last_seen_at: (now | strftime("%Y-%m-%dT%H:%M:%SZ"))
      }
    ]
  ' 2>/dev/null)

  UNKNOWN_COUNT=$(echo "$UNKNOWN_RESULTS" | jq 'length' 2>/dev/null || echo 0)

  if [ -n "$UNKNOWN_COUNT" ] && [ "$UNKNOWN_COUNT" != "0" ] && [ "$UNKNOWN_COUNT" != "null" ]; then
    UK_HTTP=$(curl -sf -o /dev/null -w '%{http_code}' -X POST \
      "${SB_HEADERS[@]}" \
      -H "Prefer: resolution=merge-duplicates,return=minimal" \
      "${SUPABASE_URL}/rest/v1/betman_unknown_games?on_conflict=source,gm_ts,game_no,bet_typ_id,handi_val" \
      -d "$UNKNOWN_RESULTS" 2>/dev/null) || UK_HTTP="000"
    if [ "$UK_HTTP" = "201" ] || [ "$UK_HTTP" = "200" ] || [ "$UK_HTTP" = "204" ]; then
      log "  미지원 HANDI_VAL/GAME_RESULT 캡처: ${UNKNOWN_COUNT}건"
    else
      log "  WARN: unknown_games upsert 실패 (HTTP ${UK_HTTP})"
    fi
  fi

  # ── Phase 4: TypeScript settle API 호출 (볼 반환 없음, 포인트만 기록) ──
  # NOTE: DB RPC settle_predictions_by_round는 승리 시 볼을 반환하는 버그가 있어 사용 금지.
  #       대신 /api/betman/settle API를 호출하여 안전한 정산 수행.
  if [ "$UPDATED" -gt 0 ]; then
    log "  정산 API 호출..."
    SETTLE_RESULT=$(curl_retry \
      "${APP_URL}/api/betman/settle" \
      -X POST \
      -H "Authorization: Bearer ${CRON_SECRET}" \
      -H "Content-Type: application/json" \
      -d "{\"gm_ts\":\"${GMTS}\"}" 2>/dev/null) || SETTLE_RESULT="{}"

    SETTLED=$(echo "$SETTLE_RESULT" | jq '.settled // 0' 2>/dev/null || echo 0)
    CORRECT=$(echo "$SETTLE_RESULT" | jq '.correct // 0' 2>/dev/null || echo 0)
    WRONG=$(echo "$SETTLE_RESULT" | jq '.wrong // 0' 2>/dev/null || echo 0)
    SLIPS_WON=$(echo "$SETTLE_RESULT" | jq '.slips.won // 0' 2>/dev/null || echo 0)
    SLIPS_LOST=$(echo "$SETTLE_RESULT" | jq '.slips.lost // 0' 2>/dev/null || echo 0)

    log "  정산 완료: ${SETTLED}건 (적중${CORRECT}/미적중${WRONG}) 슬립(승${SLIPS_WON}/패${SLIPS_LOST})"
    TOTAL_SETTLED=$((TOTAL_SETTLED + SETTLED))
  fi

  # ── Phase 5: 모든 게임의 result가 실제로 DB에 존재하는지 확인 후 settled 전환 ──
  if [ "$PARSED_COUNT" = "$ITEMS_COUNT" ] && [ "$PARSED_COUNT" -gt 0 ]; then
    # DB에서 해당 회차의 result=null인 게임 수 확인
    NULL_RESULT_COUNT=$(curl_retry \
      "${SUPABASE_URL}/rest/v1/betman_games?select=id&round_id=eq.${ROUND_ID}&result=is.null&status=neq.cancelled" \
      "${SB_HEADERS[@]}" \
      -H "Prefer: count=exact" \
      -o /dev/null -w '%{http_code}' 2>/dev/null) || NULL_RESULT_COUNT=""

    # REST API로 count 조회
    NULL_COUNT_RESP=$(curl_retry \
      "${SUPABASE_URL}/rest/v1/betman_games?select=id&round_id=eq.${ROUND_ID}&result=is.null&status=neq.cancelled" \
      "${SB_HEADERS[@]}" \
      -H "Prefer: count=exact" 2>/dev/null) || NULL_COUNT_RESP=""
    # curl 실패(빈 응답) 시 보류 — 빈 "[]" 로 오인해 result 미확인인데 강제 settled 전환되는 것 방지 (review #8)
    if [ -z "$NULL_COUNT_RESP" ]; then
      NULL_COUNT="999"
    else
      NULL_COUNT=$(echo "$NULL_COUNT_RESP" | jq 'length' 2>/dev/null || echo "999")
    fi

    if [ "$NULL_COUNT" = "0" ]; then
      SETTLE_RND_HTTP=$(curl -sf -o /dev/null -w "%{http_code}" -X PATCH \
        "${SB_HEADERS[@]}" \
        "${SUPABASE_URL}/rest/v1/betman_rounds?gm_ts=eq.${GMTS}" \
        -d "{\"status\":\"settled\"}" 2>/dev/null) || SETTLE_RND_HTTP="000"
      if [ "$SETTLE_RND_HTTP" = "200" ] || [ "$SETTLE_RND_HTTP" = "204" ]; then
        log "  회차 ${GMTS} -> settled (모든 result 확인 완료)"
      fi
    else
      log "  회차 ${GMTS}: result=null 게임 ${NULL_COUNT}건 남음, settled 보류"
    fi
  fi

  # 회차 간 딜레이 (betman 부하 방지)
  sleep 2
done

# ── Phase 6: stuck row backfill — result 있는데 status=in_progress 인 row(24h+ 지난) auto-fix ──
NOW_MINUS_24H=$(date -u -d '-24 hours' +%Y-%m-%dT%H:%M:%SZ)
BACKFILL_HTTP=$(curl -sf -o /tmp/backfill_resp.json -w '%{http_code}' -X PATCH \
  "${SB_HEADERS[@]}" \
  -H "Prefer: return=representation" \
  "${SUPABASE_URL}/rest/v1/betman_games?status=eq.in_progress&result=not.is.null&match_time=lt.${NOW_MINUS_24H}" \
  -d '{"status":"completed"}' 2>/dev/null) || BACKFILL_HTTP="000"
if [ "$BACKFILL_HTTP" = "200" ] || [ "$BACKFILL_HTTP" = "204" ]; then
  BACKFILL_COUNT=$(jq 'length' /tmp/backfill_resp.json 2>/dev/null || echo 0)
  if [ "$BACKFILL_COUNT" != "0" ] && [ "$BACKFILL_COUNT" != "null" ]; then
    log "  stuck row backfill: ${BACKFILL_COUNT}건 status=completed 정정"
  fi
  rm -f /tmp/backfill_resp.json
else
  log "  WARN: backfill failed (HTTP ${BACKFILL_HTTP})"
fi

log "=== 결과 수집 완료 === 업데이트 ${TOTAL_UPDATED}건, 정산 ${TOTAL_SETTLED}건, 에러 ${ERRORS}건"
