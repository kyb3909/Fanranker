-- 팀 사전 병합 — 분데스리가 6팀 (2026-09-07 운영자 검토표 확정)
--
-- ## 왜
-- 8/30 LFA 백필이 Soccerway 해시를 모르는 팀에 `lfa_<LFA 팀 id>` 자리표시를 기본 키로 넣었고,
-- 9/7 자동 발견·명부 수확이 진짜 해시를 **새 행으로** 등록해 같은 팀이 둘씩 됐다. 자리표시가
-- Soccerway URL 에 들어가 404 → `no_candidate` 봉인 → 분데스리가 리포트가 일주일 막힌 사고(A1)의
-- 잔재다. 운영자가 검토 페이지(https://claude.ai/code/artifact/b0cbf86a-…)에서 6건을 전부
-- "병합 승인"으로 확정했다 (2026-09-07 11:12~11:13Z).
--
-- ## 순서가 중요한 이유 (실측 제약)
--  - team_squads.soccerway_team_id → team_dictionary  **ON DELETE CASCADE**: 자리표시를 먼저 지우면
--    그 아래 스쿼드 231행(프라이부르크 32·함부르크 37·브레멘 37·샬케 34·아우크스부르크 50·글라트바흐 41)이
--    같이 지워진다. 스쿼드를 실제 해시로 옮긴 뒤 지운다. 실제 해시 아래 스쿼드는 0건이라 PK(팀, 선수) 충돌 없음.
--  - match_mapping_attempts.home/away_team_id → team_dictionary **NO ACTION**: 참조를 옮기지 않으면 삭제가 막힌다.
--  - team_dictionary_lfa_team_id_key (부분 유니크): 자리표시가 든 lfa_team_id 를 실제 행에 붙이려면 삭제가 먼저다.
--
-- ## 이름 규칙
--  - name_en 은 LFA 짝짓기 대조 키 → LFA 표기(Hamburg, M'gladbach, Schalke 04)로 둔다. slug 는 Soccerway URL 조각이라 건드리지 않는다.
--  - name_kr 을 바꾸는 팀(SC프라이부르크→프라이부르크, 미정→샬케)은 **베트맨 표기를 별칭에 남긴다** — resolveTeam 은
--    name_kr/별칭 정확일치라, 별칭이 빠지면 그 팀의 Soccerway 매핑이 다시 막힌다.
--  - 6행은 운영자 확정이므로 status = confirmed.
--
-- ## 되돌리기
-- 스키마 변경 없음(데이터만). 되돌리려면 아래 "ROLLBACK 참고"의 값으로 자리표시 행을 다시 넣고
-- 스쿼드·원장 참조를 되옮긴다. 자리표시 6행의 원본 값은 파일 끝에 적어 두었다.
-- database.types.ts 갱신 불필요(DDL 없음).

begin;

-- ── 0) 전제 확인 — 하나라도 다르면 중단 ──────────────────────────────────────────
do $$
declare v_placeholders int; v_real int; v_conflict int;
begin
  select count(*) into v_placeholders from public.team_dictionary
   where soccerway_team_id in (
     'lfa_75xi6hloabmnjn2kzgj1g8h1s','lfa_cu0eztmjcsbydyp53aleznorw','lfa_6k5zscdm9ufw0tguvzyjlp5hq',
     'lfa_ex3psl8e3ajeypwjy4xfltpx6','lfa_go76xxm0xyfgqt1h6tcrtimm','lfa_cz4a6wmzx2obyisadhgaccx7b');
  if v_placeholders <> 6 then raise exception '자리표시 행이 6개가 아니다 (%): 상태가 바뀌었다 — 검토표부터 다시', v_placeholders; end if;

  select count(*) into v_real from public.team_dictionary
   where soccerway_team_id in ('v9k3aY5F','Ig1f1fy3','fiEQZ7C7','fTVNku3I','0Ija0Ej9');
  if v_real <> 5 then raise exception '실제 해시 행이 5개가 아니다 (%)', v_real; end if;

  if exists (select 1 from public.team_dictionary where soccerway_team_id = '88HSzjDr') then
    raise exception '88HSzjDr(글라트바흐) 행이 이미 있다 — 수동 확인';
  end if;

  select count(*) into v_conflict from public.team_squads
   where soccerway_team_id in ('v9k3aY5F','Ig1f1fy3','fiEQZ7C7','fTVNku3I','0Ija0Ej9','88HSzjDr');
  if v_conflict <> 0 then raise exception '실제 해시 아래 스쿼드가 이미 %행 있다 — 이전 시 PK 충돌 가능, 수동 확인', v_conflict; end if;

  if exists (select 1 from public.team_dictionary
              where lfa_team_id in ('75xi6hloabmnjn2kzgj1g8h1s','cu0eztmjcsbydyp53aleznorw','6k5zscdm9ufw0tguvzyjlp5hq',
                                    'ex3psl8e3ajeypwjy4xfltpx6','go76xxm0xyfgqt1h6tcrtimm','cz4a6wmzx2obyisadhgaccx7b')
                and soccerway_team_id not like 'lfa_%') then
    raise exception 'LFA 팀 id 가 이미 다른 실제 행에 붙어 있다 — 수동 확인';
  end if;
end $$;

-- ── 1) 글라트바흐: 실제 행이 없다 — 먼저 만든다 (lfa_team_id 는 자리표시 삭제 뒤) ──
insert into public.team_dictionary
  (soccerway_team_id, slug, name_en, name_kr, aliases_kr, status, source, note)
values
  ('88HSzjDr', 'b-monchengladbach', 'M''gladbach', '묀헨글라트바흐', '{}', 'confirmed', 'admin',
   '2026-09-07 검토표 확정: Soccerway 명부 수확(B. Monchengladbach) + 자리표시 lfa_go76xxm0xyfgqt1h6tcrtimm 병합');

-- ── 2) 스쿼드 이전 — 자리표시 삭제(cascade)보다 먼저 ──────────────────────────────
update public.team_squads s
   set soccerway_team_id = m.real_id, updated_at = now()
  from (values
    ('lfa_75xi6hloabmnjn2kzgj1g8h1s', 'v9k3aY5F'),
    ('lfa_cu0eztmjcsbydyp53aleznorw', 'Ig1f1fy3'),
    ('lfa_6k5zscdm9ufw0tguvzyjlp5hq', 'fiEQZ7C7'),
    ('lfa_ex3psl8e3ajeypwjy4xfltpx6', 'fTVNku3I'),
    ('lfa_go76xxm0xyfgqt1h6tcrtimm', '88HSzjDr'),
    ('lfa_cz4a6wmzx2obyisadhgaccx7b', '0Ija0Ej9')
  ) as m(placeholder_id, real_id)
 where s.soccerway_team_id = m.placeholder_id;

-- ── 3) 매핑 원장의 참조 이전 (FK NO ACTION) ──────────────────────────────────────
update public.match_mapping_attempts a
   set home_team_id = m.real_id
  from (values
    ('lfa_75xi6hloabmnjn2kzgj1g8h1s', 'v9k3aY5F'), ('lfa_cu0eztmjcsbydyp53aleznorw', 'Ig1f1fy3'),
    ('lfa_6k5zscdm9ufw0tguvzyjlp5hq', 'fiEQZ7C7'), ('lfa_ex3psl8e3ajeypwjy4xfltpx6', 'fTVNku3I'),
    ('lfa_go76xxm0xyfgqt1h6tcrtimm', '88HSzjDr'), ('lfa_cz4a6wmzx2obyisadhgaccx7b', '0Ija0Ej9')
  ) as m(placeholder_id, real_id)
 where a.home_team_id = m.placeholder_id;

update public.match_mapping_attempts a
   set away_team_id = m.real_id
  from (values
    ('lfa_75xi6hloabmnjn2kzgj1g8h1s', 'v9k3aY5F'), ('lfa_cu0eztmjcsbydyp53aleznorw', 'Ig1f1fy3'),
    ('lfa_6k5zscdm9ufw0tguvzyjlp5hq', 'fiEQZ7C7'), ('lfa_ex3psl8e3ajeypwjy4xfltpx6', 'fTVNku3I'),
    ('lfa_go76xxm0xyfgqt1h6tcrtimm', '88HSzjDr'), ('lfa_cz4a6wmzx2obyisadhgaccx7b', '0Ija0Ej9')
  ) as m(placeholder_id, real_id)
 where a.away_team_id = m.placeholder_id;

-- ── 4) 자리표시 삭제 — 이제 cascade 로 지워질 스쿼드가 없고, lfa_team_id 유니크가 풀린다 ──
delete from public.team_dictionary
 where soccerway_team_id in (
   'lfa_75xi6hloabmnjn2kzgj1g8h1s','lfa_cu0eztmjcsbydyp53aleznorw','lfa_6k5zscdm9ufw0tguvzyjlp5hq',
   'lfa_ex3psl8e3ajeypwjy4xfltpx6','lfa_go76xxm0xyfgqt1h6tcrtimm','lfa_cz4a6wmzx2obyisadhgaccx7b');

-- ── 5) 실제 행 확정 — 이름·LFA id·별칭 ──────────────────────────────────────────
-- 함부르크: name_en 을 LFA 표기 Hamburg 로 (Soccerway 표시명 Hamburger SV 는 slug 에 남는다)
update public.team_dictionary
   set name_kr = '함부르크', name_en = 'Hamburg', lfa_team_id = '75xi6hloabmnjn2kzgj1g8h1s',
       status = 'confirmed', updated_at = now(),
       note = coalesce(note, '') || ' | 2026-09-07 검토표 확정: 자리표시 lfa_75xi… 병합, name_en Hamburg(LFA 표기)'
 where soccerway_team_id = 'v9k3aY5F';

-- 베르더 브레멘
update public.team_dictionary
   set name_kr = '베르더 브레멘', name_en = 'Werder Bremen', lfa_team_id = 'cu0eztmjcsbydyp53aleznorw',
       status = 'confirmed', updated_at = now(),
       note = coalesce(note, '') || ' | 2026-09-07 검토표 확정: 자리표시 lfa_cu0e… 병합'
 where soccerway_team_id = 'Ig1f1fy3';

-- 프라이부르크: name_kr 변경 — 베트맨 표기 'SC프라이부르크' 를 별칭으로 남긴다 (매핑이 정확일치라)
update public.team_dictionary
   set name_kr = '프라이부르크', name_en = 'Freiburg', lfa_team_id = '6k5zscdm9ufw0tguvzyjlp5hq',
       aliases_kr = array(select distinct a from unnest(coalesce(aliases_kr, '{}') || '{SC프라이부르크}'::text[]) a where a <> '프라이부르크'),
       status = 'confirmed', updated_at = now(),
       note = coalesce(note, '') || ' | 2026-09-07 검토표 확정: 자리표시 lfa_6k5z… 병합, 베트맨 표기 SC프라이부르크 는 별칭'
 where soccerway_team_id = 'fiEQZ7C7';

-- 아우크스부르크
update public.team_dictionary
   set name_kr = '아우크스부르크', name_en = 'Augsburg', lfa_team_id = 'ex3psl8e3ajeypwjy4xfltpx6',
       status = 'confirmed', updated_at = now(),
       note = coalesce(note, '') || ' | 2026-09-07 검토표 확정: 자리표시 lfa_ex3p… 병합'
 where soccerway_team_id = 'fTVNku3I';

-- 글라트바흐: 1)에서 만든 행에 LFA id
update public.team_dictionary
   set lfa_team_id = 'go76xxm0xyfgqt1h6tcrtimm', updated_at = now()
 where soccerway_team_id = '88HSzjDr';

-- 샬케: 9/4 admin 행의 쓰레기 name_en(페이지 제목)·name_kr '미정' 정정. 베트맨 표기 '샬케04' 는 별칭 유지
update public.team_dictionary
   set name_kr = '샬케', name_en = 'Schalke 04', lfa_team_id = 'cz4a6wmzx2obyisadhgaccx7b',
       aliases_kr = array(select distinct a from unnest(coalesce(aliases_kr, '{}') || '{샬케04}'::text[]) a where a <> '샬케'),
       status = 'confirmed', updated_at = now(),
       note = coalesce(note, '') || ' | 2026-09-07 검토표 확정: name_kr 미정→샬케, name_en 페이지 제목→Schalke 04, 자리표시 lfa_cz4a… 병합'
 where soccerway_team_id = '0Ija0Ej9';

-- ── 6) 보조 사전 정리 — 정본(team_dictionary)에 들어간 팀은 lfa_team_names 에서 뺀다
--    (백필 규칙: 정본에 있는 팀은 보조에 두지 않는다. cachedTeamEn 은 Map 이라 뒤 행이 이겨 표기가 갈릴 수 있다)
delete from public.lfa_team_names
 where name_kr in ('함부르크','베르더 브레멘','SC프라이부르크','아우크스부르크','묀헨글라트바흐','샬케04');

-- ── 7) 사후 확인 — 여섯 팀이 한 행씩, LFA id 가 붙어 있고, 스쿼드가 옮겨졌는지 ──
do $$
declare v_rows int; v_squads int; v_left int;
begin
  select count(*) into v_rows from public.team_dictionary
   where soccerway_team_id in ('v9k3aY5F','Ig1f1fy3','fiEQZ7C7','fTVNku3I','88HSzjDr','0Ija0Ej9')
     and lfa_team_id is not null and status = 'confirmed';
  if v_rows <> 6 then raise exception '확정 행이 6개가 아니다 (%)', v_rows; end if;

  select count(*) into v_squads from public.team_squads
   where soccerway_team_id in ('v9k3aY5F','Ig1f1fy3','fiEQZ7C7','fTVNku3I','88HSzjDr','0Ija0Ej9');
  if v_squads < 231 then raise exception '스쿼드 이전이 덜 됐다 (% < 231)', v_squads; end if;

  select count(*) into v_left from public.team_dictionary
   where name_kr in ('함부르크','베르더 브레멘','프라이부르크','아우크스부르크','묀헨글라트바흐','샬케')
      or '샬케04' = any(aliases_kr) or 'SC프라이부르크' = any(aliases_kr);
  if v_left <> 6 then raise exception '이름당 한 행이 아니다 (%): 다른 행이 같은 이름을 쓴다', v_left; end if;

  if exists (select 1 from public.match_mapping_attempts where home_team_id like 'lfa_%' or away_team_id like 'lfa_%') then
    raise exception '매핑 원장에 lfa_ 참조가 남아 있다';
  end if;
end $$;

commit;

-- ── ROLLBACK 참고 (자리표시 6행의 삭제 전 원본, 2026-09-07 19:xx KST 조회) ──
-- soccerway_team_id                 | slug(같음)                         | name_en       | name_kr        | lfa_team_id                | status/source
-- lfa_75xi6hloabmnjn2kzgj1g8h1s     | lfa_75xi6hloabmnjn2kzgj1g8h1s     | Hamburg       | 함부르크        | 75xi6hloabmnjn2kzgj1g8h1s  | proposed/lfa_pair
-- lfa_cu0eztmjcsbydyp53aleznorw     | lfa_cu0eztmjcsbydyp53aleznorw     | Werder Bremen | 베르더 브레멘    | cu0eztmjcsbydyp53aleznorw  | proposed/lfa_pair
-- lfa_6k5zscdm9ufw0tguvzyjlp5hq     | lfa_6k5zscdm9ufw0tguvzyjlp5hq     | Freiburg      | SC프라이부르크  | 6k5zscdm9ufw0tguvzyjlp5hq  | proposed/lfa_pair
-- lfa_ex3psl8e3ajeypwjy4xfltpx6     | lfa_ex3psl8e3ajeypwjy4xfltpx6     | Augsburg      | 아우크스부르크   | ex3psl8e3ajeypwjy4xfltpx6  | proposed/lfa_pair
-- lfa_go76xxm0xyfgqt1h6tcrtimm      | lfa_go76xxm0xyfgqt1h6tcrtimm      | M'gladbach    | 묀헨글라트바흐   | go76xxm0xyfgqt1h6tcrtimm   | proposed/lfa_pair
-- lfa_cz4a6wmzx2obyisadhgaccx7b     | lfa_cz4a6wmzx2obyisadhgaccx7b     | Schalke 04    | 샬케04          | cz4a6wmzx2obyisadhgaccx7b  | proposed/lfa_pair
-- 실제 행의 변경 전 값: v9k3aY5F name_en 'Hamburger SV' · fiEQZ7C7 name_kr 'SC프라이부르크' · 0Ija0Ej9 name_kr '미정',
--   name_en 'Schalke stats, results, fixtures &amp; transfers', aliases {샬케04} · 88HSzjDr 는 없었음(삭제로 되돌림).
-- lfa_team_names 삭제 6행: (함부르크,Hamburg) (베르더 브레멘,Werder Bremen) (SC프라이부르크,Freiburg)
--   (아우크스부르크,Augsburg) (묀헨글라트바흐,M'gladbach) (샬케04,Schalke 04)
-- 되돌릴 때 순서: 실제 행 lfa_team_id 를 NULL → 자리표시 6행 재삽입 → 스쿼드·원장 참조를 자리표시로 되옮김 → 이름 복원.
