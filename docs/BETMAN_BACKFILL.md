# Betman 결과 backfill 패치 (Vultr fetch-results.sh)

**최초 설치**: 2026-05-12

## 배경 — 누락 패턴

betman.co.kr 이 같은 경기/같은 `game_type` 을 **다른 round(gmTs)** 에 중복 등록한다 (시간대별 odds 변동). 그 중 한 round 의 status 업데이트가 누락되어 `betman_games.status` 가 `in_progress` 로 stuck 되는 row 가 발생한다. `result` 컬럼은 정상적으로 채워지지만 status 만 stale.

```
예: SSG vs 한화 (KBO 야구, 4/8 09:30, game_type=일반)
  ('일반', completed, away) ✓
  ('일반', completed, draw) ✓
  ('일반', in_progress, away)   ← stuck (result 는 정확)
  ('일반', completed, away) ✓
```

**실제 영향**:

- **정산**: 영향 없음. `lib/betman/settle.ts` guardrail 이 `status !== "cancelled" && (!result || result === "")` 만 skip → result 있으면 status 무관 정산 수행.
- **UI / 통계**: status="in_progress" 로 표시되어 "진행 중" 으로 잘못 노출 가능.

## 일회성 정리 (2026-05-12)

86 row 일괄 정정:

```bash
source .env
curl -X PATCH "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/betman_games?status=eq.in_progress&result=not.is.null&match_time=lt.<24h ago ISO>" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"status":"completed"}'
```

## 영구 자동화 (Vultr fetch-results.sh Phase 6)

`/opt/betman/fetch-results.sh` 마지막 `log "=== 결과 수집 완료 ===` 라인 직전에 삽입.

```bash
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
```

**동작 방식**:

- 매 cron 사이클 (15분마다) — result fetch + settle 후 자동 실행
- `match_time < now - 24h` + `status=in_progress` + `result IS NOT NULL` row 일괄 PATCH
- 정정된 row 1+ 이면 `results.log` 에 `stuck row backfill: N건 status=completed 정정` 기록
- 0 건이면 조용히 통과

## 백업 / 복원

- 백업 위치: `/opt/betman/fetch-results.sh.bak-YYYYMMDD`
- 복원: `cp /opt/betman/fetch-results.sh.bak-20260512 /opt/betman/fetch-results.sh && chmod +x /opt/betman/fetch-results.sh`

## 진단 명령

```bash
# 현재 stuck row 카운트
curl --get "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/betman_games" \
  --data-urlencode "select=id" \
  --data-urlencode "status=eq.in_progress" \
  --data-urlencode "match_time=lt.<24h ago>" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  | jq length

# Vultr 최근 backfill log
ssh root@${VULTR_HOST} "grep 'backfill' /opt/betman/results.log | tail -5"
```
