#!/usr/bin/env bash
# data/agents/scripts/run-cycle.sh
#
# 뉴스 에이전트 파이프라인 1 cycle.
# 10단계 chain + 오래된 항목 정리.
# cron에서 이 파일 하나만 부르면 됨.
#
# 사용:
#   bash data/agents/scripts/run-cycle.sh            # 실제 실행
#   bash data/agents/scripts/run-cycle.sh --dry-run   # fetch만, DB write 없음
#
# crontab 예:
#   */30 * * * * cd /path/to/community && bash data/agents/scripts/run-cycle.sh >> data/agents/logs/cron.log 2>&1

set -euo pipefail

# ---- Lock (이전 cycle이 아직 돌고 있으면 skip) ----
LOCKFILE="/tmp/news-agents-cycle.lock"
exec 200>"$LOCKFILE"
flock -n 200 || {
  echo "[$(date -Iseconds)] [cycle] Previous cycle still running, skipping"
  exit 0
}

# ---- 프로젝트 루트로 이동 (이 스크립트 위치 기준) ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"

# ---- 환경변수 로드 ----
if [ -f data/crawlers/.env ]; then
  set -a
  # shellcheck disable=SC1091
  source data/crawlers/.env
  set +a
else
  echo "[$(date -Iseconds)] [cycle] ERROR: data/crawlers/.env not found"
  exit 1
fi

# ---- 로그 디렉터리 ----
LOG_DIR="data/agents/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/cycle-$(date +%Y%m%d).log"

log() {
  echo "[$(date -Iseconds)] [cycle] $1" | tee -a "$LOG_FILE"
}

# ---- Dry run 지원 ----
EXTRA_ARGS=""
if [[ "${1:-}" == "--dry-run" ]]; then
  EXTRA_ARGS="--dry-run"
  log "=== Cycle started (DRY RUN) ==="
else
  log "=== Cycle started ==="
fi

# ---- 10 stages ----
run_stage() {
  local name="$1"
  local script="$2"
  log "Stage: $name"
  if ! node "$script" $EXTRA_ARGS >> "$LOG_FILE" 2>&1; then
    log "ERROR: $name failed (exit=$?)"
    return 1
  fi
}

run_stage "scout"       "data/agents/scripts/scout-run.js"            && \
run_stage "credibility" "data/agents/scripts/filter-credibility-run.js" && \
run_stage "normalize"   "data/agents/scripts/normalize-run.js"          && \
run_stage "enrich"      "data/agents/scripts/enrich-run.js"             && \
run_stage "dedupe"      "data/agents/scripts/dedupe-run.js"             && \
run_stage "desk"        "data/agents/scripts/desk-review-run.js"        && \
run_stage "assign"      "data/agents/scripts/assign-run.js"             && \
run_stage "write"       "data/agents/scripts/write-run.js"              && \
run_stage "format"      "data/agents/scripts/seo-format-run.js"         && \
run_stage "publish"     "data/agents/scripts/publish-run.js"

PIPELINE_EXIT=$?

# ---- Cleanup (실패해도 cycle 자체는 성공 처리) ----
log "Stage: cleanup"
node data/agents/scripts/cleanup-reservoir.js >> "$LOG_FILE" 2>&1 || true

# ---- 완료 ----
if [ $PIPELINE_EXIT -eq 0 ]; then
  log "=== Cycle finished OK ==="
else
  log "=== Cycle finished with errors (exit=$PIPELINE_EXIT) ==="
fi

exit $PIPELINE_EXIT
