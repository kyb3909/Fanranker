---
name: gongnori-migration
description: DB 스키마를 바꿀 때, supabase/migrations/ 에 새 SQL 파일을 추가할 때, 테이블·컬럼·인덱스·RLS 정책·RPC 함수를 만들거나 고칠 때, mcp__supabase__apply_migration 이나 Management API 로 마이그레이션을 적용할 때, lib/supabase/database.types.ts 를 갱신할 때 쓴다. "테이블 추가", "컬럼 추가", "RLS", "마이그레이션" 이야기가 나오면 쓴다.
allowed-tools: Read, Edit, Write, Grep, Bash
---

# 마이그레이션 규약

## 1. 파일

`supabase/migrations/` 에 기존 번호 규칙(`NNN_…` 또는 `YYYYMMDD_…`)으로 추가한다.
90개가 넘으므로 **마지막 파일부터 확인**한다.

```bash
ls supabase/migrations/ | tail -5
```

같은 날 여러 개면 접미 문자를 쓴다 (`20260825b_`, `20260825c_` … 가 실제 관례다).

## 2. 적용

Supabase MCP `mcp__supabase__apply_migration`, 또는 Management API
(`POST https://api.supabase.com/v1/projects/ekysrlhdrapmsnrkytif/database/query`).

프로젝트는 **gongnori.fan (`ekysrlhdrapmsnrkytif`)** 하나뿐이다 — 스테이징이 없다.
적용은 곧 프로덕션이다. 되돌릴 방법을 먼저 생각한다.

## 3. 적용 뒤에 반드시

`lib/supabase/database.types.ts` 를 갱신한다.

안 하면 타입이 거짓말을 하고, strict 모드라서 그 거짓말이 `as unknown as` 캐스팅으로
이어진다. 그 캐스팅은 나중에 진짜 타입 불일치를 가린다.

```bash
pnpm exec tsc --noEmit
```

## 4. RLS 를 건드렸다면

인증은 **Clerk JWT → Supabase RLS** 다. Supabase Auth 가 아니다.
`auth.uid()` 가 아니라 Clerk 클레임을 보는 정책인지 확인하고, 실제 로그인 경로로
읽기·쓰기를 한 번 해본다. 정책은 조용히 전건 차단되거나 전건 통과한다.

## 5. 함정 (실측)

- `REVOKE … FROM anon` 은 **no-op 인 경우가 있다** — 권한이 `PUBLIC` 에 붙어 있으면
  `FROM PUBLIC` 이어야 한다.
- 함수를 재정의(`CREATE OR REPLACE`)하면 붙여둔 `REVOKE` 가 날아간다. **재첨부 필수.**
- CTE 안에서 `INSERT` 한 행은 같은 문장에서 `DELETE` 할 수 없다.
- 더미 시드를 넣으면 지표가 오염된다 — 지우기 전까지 대시보드가 거짓말을 한다.
