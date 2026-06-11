# /design-reskin — 디자인 리스킨 (게이트형 안전 워크플로우)

사용법: `/design-reskin <디자인 산출물 폴더 경로>`
예: `/design-reskin design-references/reskin-2026-06-11/`

당신(Claude Code)은 이 프로젝트(gongnori.fan / Fanranker)의 기존 기능을 **단 하나도 깨뜨리지 않고**
$ARGUMENTS 폴더의 디자인 산출물에 맞춰 표현(스킨)만 교체한다.

---

## 절대 규칙 (모든 Phase에 적용)

1. **로직 보존**: 핸들러, 상태, hooks, API 호출, 라우팅, 데이터 패칭 코드는 절대 수정하지 않는다. 변경 대상은 className / style / CSS 변수 값 / 마크업 내 시각 요소뿐이다.
2. **$ARGUMENTS 폴더는 참고 자료**다. 어떤 파일도 import 하지 않는다. 같은 부모 폴더의 다른 구버전 디자인 폴더(예: worldcup-design-2026-05-07/-08)는 읽지 않는다.
3. **컴포넌트당 1커밋**. 커밋 메시지: `reskin(<컴포넌트>): <한 줄 요약>`. 여러 컴포넌트를 한 커밋에 섞지 않는다.
4. 각 커밋 전 `pnpm typecheck`(또는 `tsc --noEmit`)가 통과해야 한다. 실패하면 해당 변경을 되돌리고 보고한다.
5. 구조 변경 금지 지점: `community-content.tsx`의 grid col-span/페이지네이션 URL, TipTap 에디터 내부, Clerk 관련 컴포넌트.
6. 막히거나 애매하면 **추측하지 말고 멈춰서 질문**한다.
7. $ARGUMENTS 안의 `RESKIN-NOTES.md`가 있으면 그것이 single source of truth다 — 토큰 diff, 대응표, high-risk 목록을 그대로 따른다.

---

## Phase 0 — 안전망 (자동)

1. `git status` 확인 — 미커밋 변경이 있으면 **중단하고 사용자에게 커밋을 요청**한다.
2. `pnpm build`(또는 `next build`)와 typecheck, 테스트가 있다면 테스트를 실행한다.
   - 하나라도 실패하면 **중단**: "시작점이 깨져 있습니다" + 실패 내용 보고. 리스킨을 시작하지 않는다.
3. 현재 브랜치명을 보고한다. `design/` 브랜치가 아니면 사용자에게 확인 후 진행.
4. 베이스라인 통과 내역을 첫 커밋 메시지에 기록: `reskin: baseline green (build/typecheck/test)`  (빈 커밋 허용)

## Phase 1 — 토큰 추출 (자동)

1. $ARGUMENTS의 `gn.css`와 `RESKIN-NOTES.md`를 읽는다.
2. 기존 `app/worldcup/wc-tokens.css`, `app/games/draft/draft-tokens.css`, `app/globals.css`의 현재 값과 비교해 **토큰 diff 표**를 출력한다 (변수명 | 기존값 | 신규값 | 사용처 요약).
3. 신설 토큰(예: `--wc-tint`)과 알파 틴트 치환(`rgba(160,32,59,…)` → `rgba(150,30,55,…)`) 목록도 포함한다.

## Phase 2 — 인벤토리 & 플랜 ⛔ GATE (사용자 승인 대기)

1. 영향 범위 인벤토리를 출력한다: 페이지 전체 목록(app/ 라우트) × 대응 컴포넌트 × 위험도(low/medium/high).
   - high 기본값: `betting-slip.tsx`, `multi-draft-board.tsx`, `community-content.tsx`, TipTap 에디터, `notification-dropdown.tsx` → **토큰 변경의 간접 효과만 받고 직접 수정하지 않는 것을 기본 제안**으로 한다.
2. 작업 순서를 제시한다: ① 전역 토큰 → ② 프리미티브(버튼/카드/탭/칩) → ③ leaf 컴포넌트(페이지별).
3. **여기서 멈추고** 사용자의 "승인"을 기다린다. 사용자가 빼라고 한 항목은 플랜에서 제외한다.

## Phase 3 — 전역 토큰 적용 ⛔ GATE (사용자 육안 확인 대기)

1. 오직 다음 파일의 **값만** 수정한다: `wc-tokens.css`, `draft-tokens.css`, `globals.css`(shadcn `--primary` 동기화 포함).
   컴포넌트 파일은 이 단계에서 절대 건드리지 않는다.
2. 커밋: `reskin: global tokens — white/steel/wine (#961E37)`
3. typecheck + build 확인 후 **멈추고** 사용자에게 안내한다:
   "`pnpm dev`로 확인하세요 — 체크: 배경 순백 / primary rgb(150,30,55) / soft 면 #F6E4E8 / 스틸 라인 / 드래프트 크라프트 질감 제거 / 카드 1px 윤곽 유지"
4. 사용자 피드백(예: "primary가 너무 어둡다")이 있으면 토큰 값만 조정 후 재확인. "통과" 답변 후 Phase 4 진행.

## Phase 4 — 컴포넌트 마이그레이션 루프 (자동, 커밋 단위)

승인된 플랜 순서대로, 컴포넌트 하나씩:
1. $ARGUMENTS의 대응 목업 파일(RESKIN-NOTES §2 대응표)을 참고해 표현만 맞춘다.
2. 하드코딩 색상(`#A0203B`, 웜 베이지, Tailwind rose/amber 등)을 토큰 또는 신규 값으로 교체.
3. typecheck 통과 확인 → 단독 커밋.
4. high-risk 표시 컴포넌트는 건너뛰고 "보류 목록"에 기록한다.

## Phase 5 — 검증 & 인수 (자동 + 사용자 QA)

1. `pnpm build` + 테스트 + (있다면) Playwright 전체 실행. 실패 시 해당 커밋을 식별해 보고.
2. 커밋 목록(컴포넌트별)을 표로 출력 — 선택적 revert 용도.
3. 사용자용 시각 QA 체크리스트 출력:
   - 베팅: 배당 선택 → 버건디 채움 → 슬립 → 제출 풀 플로우
   - 게시판: 말머리 필터 / 공지 행 / 페이지네이션
   - 임베드 3종(YouTube/X/Instagram) 헤더 BI
   - 모바일 360~420px: 하단 탭바, FAB, 슬립
   - 알림/프로필 드롭다운, 검색, 글쓰기
4. "머지해도 좋다"는 사용자 확인을 받기 전까지 merge를 제안만 하고 실행하지 않는다.
