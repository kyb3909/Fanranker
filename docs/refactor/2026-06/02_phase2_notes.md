# Phase 2 집행 메모 (2026-06-11)

## 집행
- D-목록 삭제: cheer-battle-view.tsx, galcup-page.tsx, galcup-page-client.tsx, app/games/galcup/page.tsx
  (use-cheer-battle.ts 는 선행 대청소에서 이미 삭제)
- H-목록: app/games/worldcup/page.tsx → notFound() (worldcup-page-client 보존)
- games-tab-nav: 항목은 이전에 이미 제거돼 있었음 — 주석만 현행화
- 플랜 외 발견: app/games/page.tsx 가 /games/galcup 으로 redirect → /games/draft 로 변경
  (미수정 시 /games 진입이 404)

## knip 재실행 — 신규 고아 (보류 보존 영역, 삭제 금지 — 기록만)
worldcup 게임 숨김으로 다음 6파일이 unreferenced 가 됨. AUDIT_REPORT 보존 결정에 따라
삭제하지 않고 knip ignore 에 등록 (재오픈 시 ignore 해제):
- hooks/use-worldcup.ts
- components/battle/create-worldcup-dialog.tsx / worldcup-stats.tsx / worldcup-view.tsx
- components/worldcup/worldcup-page.tsx / worldcup-page-client.tsx
