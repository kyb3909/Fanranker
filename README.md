# FanRanker

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
- **Community Boards**: Topic-based boards with follow system, rich text editor (TipTap)
- **Ranking System**: Verified accuracy rankings, streaks, sport-specific stats
- **Embed Support**: YouTube, Instagram, X (Twitter) embeds with oEmbed

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
