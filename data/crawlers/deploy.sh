#!/usr/bin/env bash
# Deploy crawlers to Vultr VPS
# Usage: bash data/crawlers/deploy.sh

set -euo pipefail

VPS_HOST="root@158.247.193.9"
VPS_DIR="/opt/crawlers"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Deploying crawlers to VPS ==="
echo "Local: $LOCAL_DIR"
echo "Remote: $VPS_HOST:$VPS_DIR"

# 1. Ensure Node.js is installed on VPS
echo ""
echo "[1/5] Checking Node.js on VPS..."
ssh "$VPS_HOST" bash <<'REMOTE'
if ! command -v node &>/dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v), npm $(npm -v)"
REMOTE

# 2. Create directory and copy files
echo ""
echo "[2/5] Copying files..."
ssh "$VPS_HOST" "mkdir -p $VPS_DIR/config $VPS_DIR/core $VPS_DIR/logs"

scp "$LOCAL_DIR/package.json" "$VPS_HOST:$VPS_DIR/"
scp "$LOCAL_DIR/runner.js" "$VPS_HOST:$VPS_DIR/"
scp "$LOCAL_DIR/config/sources.json" "$VPS_HOST:$VPS_DIR/config/"
scp "$LOCAL_DIR/core/db.js" "$VPS_HOST:$VPS_DIR/core/"
scp "$LOCAL_DIR/core/reddit-fetcher.js" "$VPS_HOST:$VPS_DIR/core/"
scp "$LOCAL_DIR/core/naver-news-fetcher.js" "$VPS_HOST:$VPS_DIR/core/"
scp "$LOCAL_DIR/core/summarizer.js" "$VPS_HOST:$VPS_DIR/core/"

# 3. Install dependencies
echo ""
echo "[3/5] Installing dependencies..."
ssh "$VPS_HOST" "cd $VPS_DIR && npm install --production"

# 4. Set up .env (prompt if not exists)
echo ""
echo "[4/5] Checking .env..."
ssh "$VPS_HOST" bash <<REMOTE
if [ ! -f "$VPS_DIR/.env" ]; then
  echo "Creating .env from betman env..."
  # Reuse SUPABASE vars from betman if available
  if [ -f /opt/betman/.env ]; then
    grep -E '^SUPABASE_' /opt/betman/.env > "$VPS_DIR/.env" || true
  fi
  # Add Naver API keys
  cat >> "$VPS_DIR/.env" <<'ENVEOF'
OPENAI_API_KEY=your-openai-key-here
NAVER_CLIENT_ID=HvpzdoUMRDmvoofu2jsQ
NAVER_CLIENT_SECRET=diqAqBn_ie
ENVEOF
  echo ""
  echo "========================================"
  echo " .env created with Naver keys."
  echo " OPENAI_API_KEY still needs to be set!"
  echo " SSH into VPS and edit: $VPS_DIR/.env"
  echo "========================================"
else
  echo ".env already exists"
  # Ensure Naver keys are present
  if ! grep -q 'NAVER_CLIENT_ID' "$VPS_DIR/.env"; then
    cat >> "$VPS_DIR/.env" <<'ENVEOF'
NAVER_CLIENT_ID=HvpzdoUMRDmvoofu2jsQ
NAVER_CLIENT_SECRET=diqAqBn_ie
ENVEOF
    echo "Added Naver API keys to existing .env"
  fi
fi
REMOTE

# 5. Set up cron
echo ""
echo "[5/5] Setting up cron..."
CRON_LINE="*/10 * * * * cd $VPS_DIR && /usr/bin/node runner.js >> logs/cron.log 2>&1"
ssh "$VPS_HOST" bash -c "'
if crontab -l 2>/dev/null | grep -q \"$VPS_DIR/runner.js\"; then
  echo \"Cron already configured\"
else
  (crontab -l 2>/dev/null; echo \"$CRON_LINE\") | crontab -
  echo \"Cron added\"
fi
'"

echo ""
echo "=== Deploy complete ==="
echo ""
echo "Next steps:"
echo "  1. SSH into VPS: ssh $VPS_HOST"
echo "  2. Verify OPENAI_API_KEY in $VPS_DIR/.env"
echo "  3. Test Reddit:  cd $VPS_DIR && node runner.js --source=reddit-soccer --dry-run"
echo "  4. Test Naver:   cd $VPS_DIR && node runner.js --source=naver-kbo --dry-run"
echo "  5. Run all:      cd $VPS_DIR && node runner.js"
