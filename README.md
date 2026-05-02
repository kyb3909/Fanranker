# gongnori.fan

무료 스포츠 승부예측 + 커뮤니티 플랫폼. 매일 볼(토큰)을 받아 실제 프로토 배당률로 예측하고, 검증된 적중률 기반 랭킹으로 전문가를 증명하는 서비스.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **Language**: TypeScript 5 (strict mode)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Clerk
- **Styling**: Tailwind CSS 4 + Radix UI
- **Monitoring**: Sentry + Vercel Analytics
- **Testing**: Vitest (unit) + Playwright (E2E)
- **CI/CD**: GitHub Actions

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment variables
cp .env.example .env
# Fill in Supabase, Clerk, and other values

# 3. Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format code with Prettier |
| `pnpm format:check` | Check formatting without writing |
| `pnpm test` | Run unit tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Run tests with coverage report |

## Project Structure

```
app/                  # Next.js App Router pages & API routes
  api/                # API route handlers
  (pages)/            # Page routes
components/           # React components
  ui/                 # shadcn/ui base components
  home/               # Home page sections
  betting/            # Betting feature components
  post-card/          # Post card sub-components
  post-detail/        # Post detail sub-components
hooks/                # Custom React hooks
lib/                  # Utilities & business logic
  betman/             # Betting system logic
  utils/              # General utilities
  admin/              # Admin helpers
docs/                 # Internal documentation
__tests__/            # Unit tests
e2e/                  # E2E test specs (Playwright)
```

## Key Features

- **Sports Predictions**: Daily free tokens, real odds from betman.co.kr, automated settlement
- **Community Boards**: Topic-based boards with team/group flair (축구 18 클럽, 야구 16팀, 농구 NBA 8, 아이돌 12 그룹 등 ~108 flair), follow system, TipTap editor
- **Fan Identity / Titles**: 글/댓글/추천으로 flair 활동 점수 누적 → 임계값 도달 시 호칭 자동 잠금 해제 (구너/앙리/벵거 같은 클럽별 unique 호칭 141개) → 마이페이지에서 선택 → 닉네임 옆 표시
- **Stadium Donation**: flair 활동 점수 잔액으로 같은 팀 경기장에 기부 → `team_stadiums.total_points` 누적 → 레벨업 → 기여자 랭킹 (stadium 페이지 "랭킹" Dialog)
- **Ranking System**: Verified accuracy rankings, streaks, sport-specific stats
- **Embed Support**: YouTube, Instagram, X (Twitter) embeds with oEmbed
- **Audit Harness**: production 회귀 자동 감지 (`pnpm audit`) + Core Web Vitals 측정 (`pnpm audit:cwv`) + 사이클별 비교 (`pnpm audit:diff`)

## Environment Variables

See [`.env.example`](.env.example) for all required and optional variables.

## Documentation

Detailed docs are in the [`docs/`](docs/) folder:

- [PROJECT.md](docs/PROJECT.md) — Product guide & architecture
- [BETMAN_SYSTEM.md](docs/BETMAN_SYSTEM.md) — Betting system design
- [TEMPERATURE_FORMULA.md](docs/TEMPERATURE_FORMULA.md) — Post engagement algorithm
- [CLERK_INTEGRATION.md](docs/CLERK_INTEGRATION.md) — Authentication setup

## Deployment

Deployed on **Vercel** with automatic preview deployments on PR.

Betman sync runs on a **Vultr VPS** (Seoul) due to Korean IP requirement for betman.co.kr.

## License

Private — All rights reserved.
