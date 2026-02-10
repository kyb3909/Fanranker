# Reddit 시드 봇

오픈 전 메인 피드에 컨텐츠를 미리 채우기 위한 레딧 시드 봇입니다.

## 준비

1. **마이그레이션 실행** (봇 프로필 등록)
   ```bash
   supabase db push
   # 또는 Supabase 대시보드 SQL 에디터에서 025_add_reddit_seed_bot_profile.sql 실행
   ```

2. **환경 변수** (`.env`)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - (Reddit 앱 등록 불필요 — RSS 기반 공개 API 사용)

3. **패키지 설치**
   ```bash
   pnpm install
   ```

## 실행

```bash
pnpm reddit-seed
```

## 동작

- **soccer** 서브레딧에서 **하루 top 10개**를 가져옵니다. (Reddit API: `/top.json?t=day`)
- `overseas-football`(해외축구)로 등록됩니다.
- 작성자는 "레딧 시드봇"으로 표시됩니다.
- `scripts/reddit-seed-bot.ts`의 `SUBREDDIT`, `LIMIT`, `TIME_FILTER`로 변경 가능합니다.
