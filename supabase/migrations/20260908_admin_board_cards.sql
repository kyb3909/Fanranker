-- 운영 할 일 보드 (2026-09-08)
-- 운영자: "해야 할 것들을 Trello 칸반처럼 옆으로 옮기는 식으로 어드민에 표시해줘."
--
-- 관리자 전용 표. 읽기·쓰기는 /api/admin/board 가 서비스 롤로만 한다.
-- RLS 를 켜고 정책을 두지 않으면 anon/authenticated 는 전건 차단된다 (서비스 롤은 RLS 를 지나친다).
-- 되돌리기: drop table public.admin_board_cards;

create table if not exists public.admin_board_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text not null default '',
  tag text,
  effort text,
  status text not null default 'todo'
    constraint admin_board_cards_status_check check (status in ('todo', 'doing', 'review', 'done')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_board_cards_status_position_idx
  on public.admin_board_cards (status, position);

alter table public.admin_board_cards enable row level security;
revoke all on table public.admin_board_cards from anon, authenticated;
grant all on table public.admin_board_cards to service_role;

-- 첫 카드 = 2026-09-08 주말 사후 점검에서 나온 할 일. 표가 비어 있을 때만 넣는다.
insert into public.admin_board_cards (title, detail, tag, effort, status, position)
select v.title, v.detail, v.tag, v.effort, v.status, v.position
from (
  values
    ('매일 아침 "빠진 것" 표를 디스코드로 받기',
     '매치데이 다음날 경기마다 라인업·점수·투표·리포트가 됐는지, 안 됐으면 왜인지 자동으로 표를 만들어 보낸다. 지금은 스크립트를 손으로 돌려야 보인다.',
     '점검', '2~3일', 'todo', 0),
    ('"결정 대기" 화면 만들기',
     '운영자가 확정할 선수 이름·팀 매핑을 한 화면에 오래된 순으로 모으고 승인·거절 버튼을 둔다. 8월부터 안 처리된 것이 15건이고, 이게 안 풀리면 리포트가 안 만들어진다.',
     '사전', '3~4일', 'todo', 1),
    ('외부 사이트 매일 확인',
     '매일 새벽 이미 끝난 경기 하나를 다시 받아 지난번과 모양이 다르면 알린다. LFA 스탯 이름·벤치 선수, 소커웨이 기사 목록.',
     '외부', '1일', 'todo', 2),
    ('팀 사전 백필이 별칭도 보게 한 줄 고치기',
     '샬케04·SC프라이부르크를 매일 15:00 에 없는 팀으로 찍는 문제. lib/lfa/team-backfill.ts 의 known 집합에 aliases_kr 을 포함하면 된다.',
     '사전', '30분', 'todo', 3),
    ('리포트 다시 만들기 버튼',
     '관리자 화면에서 경기 하나를 골라 리포트를 다시 만들게 한다. 지금은 로컬 스크립트로만 되살릴 수 있다.',
     '리포트', '1일', 'todo', 4),
    ('8월 리포트 빈 경기 5개 처리 결정',
     '브렌트퍼드–토트넘(8/22), 우디네세–코모(8/22), 르아브르–모나코(8/23), 릴–PSG(8/28), 라이프치히–묀헨글라트바흐(8/29). 되살릴지 그냥 둘지.',
     '리포트', '결정', 'todo', 5),
    ('인테르 투르쿠 자리표시 행 정리',
     '팀 사전에 남은 마지막 가짜 id 행(lfa_ 접두). 실제 행에 합칠지 지울지 운영자 결정.',
     '사전', '결정', 'todo', 6),
    ('확정 라인업이 킥오프 몇 분 전에 오는지 재기',
     '9/8 칼리아리–레체는 예상 명단이 킥오프 64분 전까지 유지됐다. 불판이 예상 명단으로 열리는지 확인한다.',
     '점검', '1일', 'todo', 7),
    ('경기 데이터를 한 곳에 모으는 공사',
     '경기마다 베트맨·LFA·투표·리포트 키가 달라서 생기는 문제의 근본 해법. 위 항목들이 끝난 뒤에 한다. 설계는 docs/match-pipeline/STAGE_LEDGER_DESIGN_20260907.md.',
     '공사', '1~2주', 'todo', 8),
    ('주말 사후 점검 도구 고치기',
     '투표 0건·점수 누락으로 잘못 나오던 것 수리(9/8). scripts/_check-workflow.ts.',
     '점검', null, 'done', 0),
    ('분데스리가 팀 사전 중복 행 합치기',
     '9/7 배포. 소커웨이 매핑 창을 72시간으로 늘려 봉인됐던 경기 3개가 자동으로 다시 연결됐다.',
     '사전', null, 'done', 1)
) as v(title, detail, tag, effort, status, position)
where not exists (select 1 from public.admin_board_cards);
