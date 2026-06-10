# 새 노트북 개발 환경 셋업 가이드

> gongnori.fan(community) 개발 환경을 **완전히 비어있는 새 노트북**에 그대로 재현하는 순서.
> 위에서부터 순서대로 따라 하면 됩니다. (현재 머신 기준: Windows 11 / Cursor CLI 안의 Claude Code)
>
> **현재 검증된 버전**: Node `22.16.0` · pnpm `10.18.3` · bun `1.3.11` · uv `0.8.0` · Python `3.13` · git `2.49`

---

## ⚡ 한눈에 보기 (체크리스트)

```
[ ] 0. 시스템 기본 도구    Git · Node 22 · pnpm 10 · bun · uv(+Python)
[ ] 1. 데스크톱 앱          Cursor · Aseprite · Obsidian
[ ] 2. 프로젝트            git clone · pnpm install · playwright install · .env 복사
[ ] 3. 전역 Claude 설정     ~/.claude/* (SuperClaude 프레임워크 + settings.json) · ~/.claude.json
[ ] 4. MCP 서버 5개         supabase · pixellab · playwright · aseprite · obsidian
[ ] 5. gstack              clone + ./setup (bun 필요)
[ ] 6. 검증               build · test · lint · e2e 가 통과하는지
```

> 💡 **잊기 쉬운 것 TOP 5** (네가 매번 빼먹는 것들)
> 1. **`.env` / `.env.local` 실제 값** — 새로 깔면 비어있음. 옛 노트북에서 안전하게 복사해와야 함 (아래 §2.4)
> 2. **`bun`** — gstack(`/browse`, `/qa`, `/ship` …) 전부 bun으로 돌아감. 없으면 gstack 전체가 죽음
> 3. **`uv` + Python** — aseprite-mcp, obsidian-mcp 두 MCP 서버의 런타임
> 4. **`pnpm exec playwright install`** — 브라우저 바이너리. 안 깔면 E2E/audit/playwright 전부 실패
> 5. **전역 `~/.claude` 설정** — SuperClaude 프레임워크 + MCP 서버 정의. 프로젝트가 아니라 홈에 있음

---

## 0. 시스템 기본 도구

> Windows라면 **Git Bash가 필수**입니다 (gstack `./setup`이 bash 스크립트). Git for Windows에 포함됨.

가장 빠른 방법 — **winget** (Windows 11 기본 내장):

```powershell
winget install Git.Git                    # Git 2.49+ (Git Bash 포함)
winget install OpenJS.NodeJS.LTS          # Node 22.x  (또는 fnm/nvm-windows 로 22.16.0 고정)
winget install astral-sh.uv               # uv (Python 런타임 매니저)
```

### Node 22 + pnpm 10

Node를 깔면 `corepack`이 같이 옵니다. **corepack을 켜면 pnpm 버전이 자동으로 맞춰집니다** (`package.json`의 `packageManager: pnpm@10.18.3` 필드를 읽음):

```powershell
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm -v        # 10.18.3 나오면 성공
```

> corepack이 싫으면 `npm i -g pnpm@10` 로도 됨. 단 버전 핀이 안 맞을 수 있음.

### bun (gstack 전용 런타임)

```powershell
# PowerShell
powershell -c "irm bun.sh/install.ps1 | iex"
# 또는 winget
winget install Oven-sh.Bun
bun --version   # 1.3.x
```

### uv + Python (MCP 서버용)

`uv`가 Python 3.13을 자동으로 관리합니다. 위에서 `astral-sh.uv` 설치했으면:

```powershell
uv python install 3.13
uv --version    # 0.8.x
```

> uv 실행 파일 경로: `C:\Users\<you>\.local\bin\uv.exe` (aseprite MCP가 이 절대경로를 참조함 — 아래 §4 주의)

### (선택) gh CLI — private repo 클론 / Vercel 빌드 진단에 유용

```powershell
winget install GitHub.cli
gh auth login
```

---

## 1. 데스크톱 앱

| 앱 | 용도 | 비고 |
|---|---|---|
| **Cursor** | 메인 에디터 + 그 안의 Claude Code CLI | [cursor.com](https://cursor.com) |
| **Claude Code** | CLI | `npm i -g @anthropic-ai/claude-code` 후 `claude` / 로그인. Cursor 터미널에서 실행 |
| **Aseprite** | 픽셀아트 (aseprite-mcp가 호출) | Steam 또는 itch.io. 안 쓸 거면 aseprite MCP 스킵 가능 |
| **Obsidian** | 메모 (obsidian-mcp가 호출) | + 커뮤니티 플러그인 **Local REST API** 활성화 + API 키 필요 |

> Aseprite / Obsidian을 안 쓸 거면 해당 MCP만 빼면 됩니다. **playwright + gstack + supabase MCP만 있으면 개발 자체는 다 돌아감.**

---

## 2. 프로젝트 클론 & 셋업

### 2.1 클론

```powershell
# private repo이므로 gh auth 또는 SSH 키 필요
cd D:\Projects
git clone <이-repo-URL> community
cd community
```

> 현재 경로에 한글/괄호(`새 폴더\adding(test)`)가 들어가 있는데, 새 노트북에선 **영문 경로**(`D:\Projects\community`)를 권장 — 일부 도구가 한글/특수문자 경로에서 문제를 일으킴.

### 2.2 의존성 설치

```powershell
pnpm install
```
- `prepare` 스크립트가 **husky pre-commit 훅을 자동 설치**합니다 (staged 파일에 `eslint --fix` + `prettier --write`).

### 2.3 Playwright 브라우저 (⚠️ 필수)

```powershell
pnpm exec playwright install
```
- E2E(`pnpm exec playwright test`), audit(`pnpm audit`), CWV 측정 전부 이 브라우저 바이너리가 있어야 동작.
- 5개 프로젝트 사용: chromium / firefox / webkit / Mobile Chrome / Mobile Safari / Tablet.

### 2.4 환경 변수 (⚠️ 가장 잘 까먹는 부분)

`.env`, `.env.local`은 git에 안 올라가므로 **새 노트북엔 없습니다.** 두 가지 방법:

**방법 A (권장): 옛 노트북에서 그대로 복사**
- `.env` 와 `.env.local` 파일을 USB / 비밀번호 매니저 / 보안 채널로 안전하게 옮겨오기.
- 실제 시크릿(service role key, Clerk secret, CRON_SECRET 등)이 들어있으니 절대 평문 채팅/메일로 보내지 말 것.

**방법 B: 대시보드에서 재발급**
```powershell
cp .env.example .env
```
그리고 아래 값을 채움:

| 변수 | 어디서 | 필수? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | ✅ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API (`sb_publishable_...`) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API (절대 클라이언트 노출 금지) | ✅ |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys (`pk_...`) | ✅ |
| `CLERK_SECRET_KEY` | Clerk → API Keys (`sk_...`) | ✅ |
| `CRON_SECRET` | `openssl rand -hex 32` 로 생성 (옛 값과 같아야 Vultr cron 호환) | ✅ |
| `NEXT_PUBLIC_SITE_URL` | `https://gongnori.fan` | 권장 |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_*` | Sentry 프로젝트 | 선택 (없어도 빌드 통과) |
| `FACEBOOK_ACCESS_TOKEN` / `NEXT_PUBLIC_ADSENSE_ID` / `NEXT_PUBLIC_GA_ID` | 각 서비스 | 선택 |
| `VULTR_*` (있다면) | `scripts/vultr-exec.py` SSH 자동화용 | 선택 |

> 빠른 확인: `pnpm dev` 가 뜨고 로그인까지 되면 env는 OK. env가 빠지면 `lib/env.ts`의 zod 검증이 **어떤 키가 없는지** 에러로 알려줌.

---

## 3. 전역 Claude 설정 (~/.claude) — 홈 디렉토리

> 이건 **프로젝트가 아니라 홈(`C:\Users\<you>`)에** 있습니다. 옛 노트북에서 통째로 복사하는 게 제일 빠름.

### 3.1 SuperClaude 프레임워크 파일 + 메모리

`C:\Users\<you>\.claude\` 아래 이 파일들을 복사:

```
CLAUDE.md  COMMANDS.md  FLAGS.md  PRINCIPLES.md  RULES.md
MCP.md  PERSONAS.md  ORCHESTRATOR.md  MODES.md  KARPATHY.md
settings.json
projects\...\memory\        ← 자동 메모리(프로젝트별, 선택이지만 매우 유용)
```
- `~/.claude/CLAUDE.md`가 위 `@COMMANDS.md` 등을 `@import`로 끌어옴 → 파일들이 같이 있어야 함.

### 3.2 settings.json (전역)

핵심 내용 (옛 노트북에서 복사하거나 아래로 재현):
```jsonc
{
  "enabledPlugins": { "andrej-karpathy-skills@karpathy-skills": true },
  "effortLevel": "xhigh",
  "mcpServers": {
    "supabase": { "url": "https://mcp.supabase.com/mcp?project_ref=ekysrlhdrapmsnrkytif" },
    "pixellab": {
      "url": "https://api.pixellab.ai/mcp",
      "transport": "http",
      "headers": { "Authorization": "Bearer <PIXELLAB_TOKEN>" }   // ← 옛 노트북 값 복사
    }
  }
}
```

### 3.3 ~/.claude.json (전역 MCP — stdio 서버들)

`C:\Users\<you>\.claude.json`의 **top-level `mcpServers`**에 stdio MCP 3개가 정의돼 있음:
```jsonc
"mcpServers": {
  "playwright":   { "type":"stdio", "command":"npx", "args":["-y","@playwright/mcp@latest","--headless"] },
  "mcp-obsidian": { "type":"stdio", "command":"uv", "args":["--directory","C:\\Users\\<you>\\mcp-obsidian","run","mcp-obsidian"], "env":{} },
  "aseprite":     { "type":"stdio", "command":"C:\\Users\\<you>\\.local\\bin\\uv.exe", "args":["--directory","<프로젝트>\\aseprite-mcp","run","-m","aseprite_mcp"], "env":{} }
}
```
> 경로(`<you>`, `<프로젝트>`)를 **새 노트북 경로로 반드시 수정**. 옛 노트북에서 복사했다면 경로가 안 맞아 MCP가 안 뜸.
> `~/.claude.json`은 대화 히스토리 등 개인 데이터도 많으니, MCP 부분만 발췌 복사하는 걸 권장.

### 3.4 카르파티 스킬 플러그인

```powershell
# Claude Code 안에서:
/plugin marketplace add forrestchang/andrej-karpathy-skills
/plugin install andrej-karpathy-skills@karpathy-skills
```
(또는 §3.2의 `enabledPlugins`가 있으면 자동 인식)

---

## 4. MCP 서버 5개 정리

| MCP | 타입 | 새 노트북에서 할 일 |
|---|---|---|
| **playwright** | stdio (npx) | **설치 불필요.** Node만 있으면 `npx`가 자동 다운로드. (네가 제일 많이 쓰는 것) |
| **supabase** | 호스티드 (OAuth) | settings.json에 URL만 있으면 됨. Claude에서 첫 호출 시 **브라우저 OAuth 로그인** 한 번 |
| **pixellab** | 호스티드 (토큰) | settings.json `headers`의 Bearer 토큰 복사. 없으면 [pixellab.ai](https://pixellab.ai)에서 재발급 |
| **aseprite** | stdio (uv) | ① Aseprite 앱 설치 ② 프로젝트 안 `aseprite-mcp/` 폴더(repo에 포함) ③ uv 설치 ④ `~/.claude.json` 경로 수정 |
| **mcp-obsidian** | stdio (uv) | ① Obsidian + Local REST API 플러그인 ② `git clone <obsidian-mcp> C:\Users\<you>\mcp-obsidian` ③ uv ④ REST API 키를 env에 |

> **개발만 할 거면 playwright + supabase 둘만 살아있어도 충분.** aseprite/pixellab/obsidian은 픽셀아트·메모 작업할 때만 필요.

확인:
```powershell
# Claude Code 안에서
/mcp        # 연결된 서버 목록 + 상태
```

---

## 5. gstack (네가 두 번째로 많이 쓰는 것)

> `/browse` `/qa` `/ship` `/review` `/investigate` `/health` `/benchmark` 등 전부 gstack. **bun 필수** (§0에서 설치했어야 함).

```bash
# ⚠️ Git Bash 에서 실행 (PowerShell 아님 — ./setup이 bash 스크립트)
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack
./setup
```
- `./setup`이 bun으로 의존성 설치 + 브라우저 바이너리 빌드 + 모든 gstack 스킬을 Claude Code에 등록.
- 끝나면 Claude Code 재시작 후 `/browse`, `/qa` 등이 보임.
- 업데이트: Claude에서 `/gstack-upgrade`.

> 현재 버전 `1.42.2.0`. 새로 깔면 최신 버전 — 사용법은 동일.

---

## 6. 검증 (다 됐는지 확인)

순서대로 다 통과하면 환경 재현 완료:

```powershell
pnpm dev                       # http://localhost:3000 뜨고 로그인 되는지
pnpm exec tsc --noEmit         # 타입 체크 (strict)
pnpm lint                      # ESLint
pnpm test                      # Vitest 단위 테스트
pnpm build                     # 프로덕션 빌드 통과
pnpm exec playwright test e2e/home.spec.ts --project=chromium   # E2E 1개
```

Claude Code 쪽:
```
/mcp        # supabase·playwright 등 connected 확인
/browse     # gstack 동작 확인 (bun 셋업 성공 여부)
```

---

## 부록: 안 까먹게 도구별 "왜 필요한지"

| 도구 | 없으면 죽는 것 |
|---|---|
| **bun** | gstack 전부 (`/browse`, `/qa`, `/ship`, `/review`, `/health` …) |
| **uv + Python** | aseprite MCP, obsidian MCP |
| **playwright install** | E2E, `pnpm audit`, CWV, playwright MCP 브라우저 |
| **corepack / pnpm** | 모든 빌드·설치 (`pnpm@10` 핀) |
| **Git Bash** | gstack `./setup` (Windows에서 bash 필요) |
| **.env / .env.local** | 앱 부팅 자체 (zod 검증 실패) |
| **~/.claude 전역설정** | SuperClaude 프레임워크 + MCP 서버 정의 |
| **gh auth / SSH 키** | private repo 클론 |

> 인프라 메모: betman 동기화는 **Vultr 서울 VPS cron** (한국 IP 필요)에서 별도로 돎 — 노트북 셋업과 무관. 배포는 Vercel 자동. 둘 다 새 노트북에서 따로 설치할 것 없음.
</content>
</invoke>
