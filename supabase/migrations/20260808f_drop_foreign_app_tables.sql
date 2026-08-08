-- 타 앱 잔재 테이블 삭제 (2026-08-08, 운영자 확정: "무비 퀴즈와 버츄얼 캐스팅은
-- 우리 서비스 꺼가 아냐 삭제해줘").
--
-- 전수 감사(docs/audit/notes/games.md §3) 재검증: 앱 코드 참조 0 (자동생성
-- database.types.ts 뿐), DB 함수/트리거 의존 0, FK 는 다섯 테이블 상호 참조뿐.
-- 데이터: movie_quizzes 12행 · virtual_castings 5행 (2026-02-20 타 앱 정리 때
-- 남은 잔재). FK 자식부터 순서대로 드랍 — CASCADE 불필요.

DROP TABLE IF EXISTS public.movie_quiz_results;
DROP TABLE IF EXISTS public.movie_quizzes;
DROP TABLE IF EXISTS public.virtual_casting_votes;
DROP TABLE IF EXISTS public.virtual_casting_suggestions;
DROP TABLE IF EXISTS public.virtual_castings;
