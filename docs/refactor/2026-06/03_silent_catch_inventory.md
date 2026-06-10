# Phase 3 — silent catch 인벤토리 (2026-06-11)

분류: **A** silent(수정 대상) · **B** 이미 표면화(reportClientError 로 Sentry 가시성만 보강) · **C** 동결 영역(제외) · **G** 로직 가드(데이터 페치 아님 — 제외)

## 이번 Phase 적용 범위: post-detail 도메인 (플랜 3-3 분할 규정 — A 다수로 post-detail 까지 끊음)

| 파일 | 줄 | 현재 동작 | 분류 | 조치 |
|---|---|---|---|---|
| comment-section.tsx | 77 | 로드 실패 → 빈 목록 위장 | **A** | report + loadFailed 상태 + 인라인 에러/재시도 |
| comment-section.tsx | 119 | 작성 실패 → toast + rethrow | B | +report("comments.create") |
| comment-section.tsx | 163 | 답글 실패 → toast + 입력 복원 | B | +report("comments.reply") |
| comment-item.tsx | 78 | 수정 실패 → toast | B | +report("comments.update") |
| comment-item.tsx | 98 | 삭제 실패 → toast | B | +report("comments.delete") |
| comment-item.tsx | 139 | 투표 실패 → 롤백만 (무알림) | **A** | report + toast("투표 처리에 실패했습니다") |
| comment-form.tsx | 71 | 실패 시 입력 복원 (표면화는 상위 catch) | B | 유지 — 상위(comment-section)가 toast+report |
| post-actions.tsx | 43 | vote 상태 조회 실패 silent | **A**(경) | report("post.voteStatus") — 토스트 없음(비핵심 프리페치) |
| post-actions.tsx | 62 | bookmark 상태 조회 실패 silent | **A**(경) | report("post.bookmarkStatus") |
| post-actions.tsx | 99 | 투표 실패 → 롤백 + toast | B | +report("post.vote") |
| post-actions.tsx | 131 | 북마크 실패 → toast | B | +report("post.bookmark") |
| post-detail-content.tsx | 96 | 차단 실패 → toast | B | +report("post.block") |
| post-detail-content.tsx | 120 | 삭제 실패 → toast | B | +report("post.delete") |
| post-detail-content.tsx | 275 | 본문 이미지 중복 가드 try/catch | G | 유지 (렌더 가드) |
| mention-autocomplete.tsx | 42 | 멘션 검색 실패 → 빈 결과 위장 | **A**(경) | report("comments.mentionSearch") — 자동완성이라 토스트 생략 |

## C — 동결 (플랜 3-1 선확정, 건드리지 않음)
- hooks/use-worldcup.ts (보류 보존)
- betting·home 도메인 전체 (G1): use-betting-*, components/betting/**, home
- lib/betman/**

## Phase 3b 백로그 (도메인 단위 잔여 — 차기)
write/editor(use-write-editor 6) → draft(draft-setup 5, waiting-room 4, chat-panel 3, open-rooms-grid) → metaverse/stadium(side-scroller-demo 4, highbury-stage 4, avatar-shop-modal 3) → profile(my-profile-settings 6, avatar-section 3) → header(notification-dropdown 3, sign-in-menu 3, header-search) → 기타(shop-page 3, news-talk 3, community-content, community-sidebar, use-post-card-actions 5, use-hot-post-alerts 4, use-draft-room-game 8)

## 수동 게이트 메모
- 정상 회귀(게이트 3)는 로컬 browse 로 확인.
- 실패 주입(게이트 1·2)·Sentry 수신(게이트 4)은 로그인 필요 → prod 에서 수동 체크리스트로:
  ① 글 상세에서 devtools Network 차단 후 댓글 새로고침 → 인라인 에러+재시도 노출
  ② 댓글 작성 차단 → 입력 보존 + 실패 toast ③ Sentry 에 [comments.*] 이벤트 수신
