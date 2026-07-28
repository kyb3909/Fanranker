-- 뉴스 표기 사전 category 확장: media(언론사 표기) + term(용어·음차)
--
-- 배경: 운영자 교정 학습 루프(edit_learner)가 발행 기사 수정 diff 에서
-- 표기 교정을 추출해 이 사전에 자동 등록한다. 기존 category 는 엔티티
-- (player/team/coach/competition)만 허용했는데, 실제 교정의 다수는
-- 매체명("foxsports.com" → "폭스 스포츠")과 일반 용어 표기라 두 분류를 추가.
-- write-run 은 media/term 을 로드해 발행 시 표기에 반영한다.

ALTER TABLE news_alias_dictionary
  DROP CONSTRAINT news_alias_dictionary_category_check;

ALTER TABLE news_alias_dictionary
  ADD CONSTRAINT news_alias_dictionary_category_check
  CHECK (category = ANY (ARRAY['player'::text, 'team'::text, 'coach'::text, 'competition'::text, 'media'::text, 'term'::text]));
