-- 경기장 벽돌 구매 (2026-08-27)
--
-- 공동 건설 1단계: 활동 점수(user_flair_scores.score_balance)로 벽돌을 "개" 단위로 산다.
-- 왜 이벤트 테이블인가: stadium_contributions 는 유저당 누적치 하나뿐이라
-- "언제 몇 개를 샀고, 내 벽돌이 경기장의 몇 번째 벽돌인지"를 답할 수 없다.
-- 이 표는 구매 1건 = 1행(append-only)이고, 팀 내 시작 순번(start_index)이
-- 3D 청사진의 건설 순서 인덱스와 1:1 로 매핑된다 → "3,412번째 벽돌이 내 것".
--
-- 신규 화폐가 아니다 — 점수 차감·경기장 총점 반영은 전부 기존
-- donate_flair_score_to_team 이 하고, 여기는 귀속 기록만 얹는다.

create table if not exists stadium_bricks (
  id bigint generated always as identity primary key,
  team_id text not null,
  user_id text not null,
  brick_count int not null check (brick_count > 0),
  points_spent int not null check (points_spent > 0),
  /** 팀 내 0-base 시작 순번 — [start_index, start_index + brick_count) 가 내 벽돌 구간 */
  start_index bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists stadium_bricks_team_idx on stadium_bricks (team_id, id);
create index if not exists stadium_bricks_user_idx on stadium_bricks (team_id, user_id);

alter table stadium_bricks enable row level security;
-- 누가 투자했는지 보여주는 게 목적이므로 읽기는 공개. 쓰기 정책은 만들지 않는다
-- (security definer RPC 만 쓸 수 있다).
create policy "stadium_bricks_public_read" on stadium_bricks for select using (true);

-- 벽돌 단가: 10점 = 1벽돌 ("글 하나 = 벽돌 하나"). 운영자 조정 지점 — 이 함수만 고치면 된다.
create or replace function buy_stadium_bricks(
  p_user_id text,
  p_flair_id uuid,
  p_brick_count int
) returns jsonb
language plpgsql security definer as $$
declare
  v_price      constant int := 10;
  v_amount     int;
  v_donate     jsonb;
  v_team_id    text;
  v_start      bigint;
  v_my_bricks  bigint;
begin
  if p_brick_count is null or p_brick_count <= 0 or p_brick_count > 1000 then
    return jsonb_build_object('ok', false, 'error', '벽돌 수는 1~1000개여야 합니다.');
  end if;

  v_amount := p_brick_count * v_price;

  -- 점수 차감 + 경기장 총점·레벨·기여 누적은 기존 경로 그대로.
  -- 이 호출이 team_stadiums 행을 UPDATE 하며 락을 잡으므로, 아래 순번 계산은
  -- 같은 팀의 동시 구매와 직렬화된다 (start_index 중복 없음).
  v_donate := donate_flair_score_to_team(p_user_id, p_flair_id, v_amount);
  if coalesce((v_donate->>'ok')::boolean, false) = false then
    return v_donate;
  end if;

  v_team_id := v_donate->>'team_id';

  select coalesce(sum(brick_count), 0) into v_start
    from stadium_bricks where team_id = v_team_id;

  insert into stadium_bricks (team_id, user_id, brick_count, points_spent, start_index)
  values (p_user_id, v_team_id, p_brick_count, v_amount, v_start);

  select coalesce(sum(brick_count), 0) into v_my_bricks
    from stadium_bricks where team_id = v_team_id and user_id = p_user_id;

  return v_donate || jsonb_build_object(
    'brick_count', p_brick_count,
    'brick_price', v_price,
    'start_index', v_start,
    'my_total_bricks', v_my_bricks
  );
end;
$$;

-- 경제 RPC 권한 규율 (⚠️ REVOKE FROM anon 은 no-op 인 경우가 있다 — PUBLIC 에서 회수):
-- 서버(service role)만 부른다. CREATE OR REPLACE 로 재정의하면 이 REVOKE 를 재첨부할 것.
revoke all on function buy_stadium_bricks(text, uuid, int) from public;
revoke all on function buy_stadium_bricks(text, uuid, int) from anon;
revoke all on function buy_stadium_bricks(text, uuid, int) from authenticated;
