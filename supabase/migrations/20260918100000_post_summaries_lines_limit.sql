-- 인터뷰는 발언이 많으면 더 싣는다 (2026-09-18 운영자: "인터뷰 내용이 많을 때는 좀 더 길게 적어도 괜찮을 듯").
-- 단신 뉴스는 여전히 2~3문장, 인터뷰는 발언 2~6개.
alter table public.post_summaries drop constraint if exists post_summaries_lines_check;
alter table public.post_summaries
  add constraint post_summaries_lines_check check (array_length(lines, 1) between 2 and 6);
