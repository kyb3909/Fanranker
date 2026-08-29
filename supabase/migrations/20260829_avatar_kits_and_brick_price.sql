-- 아바타 유니폼 구매(활동 점수) + 벽돌 단가 100점 + 벽돌 적재 버그 수정
--
-- 운영자 확정 2026-08-29:
--   · 벽돌 단가 10 → 100점 (글 10개 = 벽돌 1장)
--   · 유니폼 한 벌 300점, **자기 팀 것만** 구매 가능
--
-- 함께 고치는 버그: buy_stadium_bricks() 의 INSERT 가 team_id/user_id 를 뒤집어
-- 넣고 있었다. 그 탓에 순번(start_index)·내 벽돌 수가 영원히 0 이었다.
-- stadium_bricks 가 비어 있어(아직 실구매 0건) 데이터 보정은 필요 없다.

-- ── 1. 유니폼 카탈로그 ─────────────────────────────────────────────────
-- 가격·구단 매핑의 정본을 DB 에 둔다. 클라이언트가 "이 유니폼은 우리 팀 것"
-- 이라고 주장하는 걸 그대로 믿으면 남의 팀 옷을 내 점수로 살 수 있다.
create table if not exists avatar_kits (
  kit_key       text primary key,
  team_id       text not null,
  name          text not null,
  price_points  int  not null default 300 check (price_points >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

insert into avatar_kits (kit_key, team_id, name) values
  ('red-horizon-home',            'epl_arsenal',    'Red Horizon 26'),
  ('west-london-blue-26-home',    'epl_chelsea',    'Lion Blue 26'),
  ('manchester-red-26-home',      'epl_manutd',     'Red Theatre 26'),
  ('mersey-deep-red-26-home',     'epl_liverpool',  'Mersey Deep Red 26'),
  ('manchester-sky-26-home',      'epl_mancity',    'Sky Gradient 26'),
  ('north-london-lily-26-home',   'epl_tottenham',  'Lily White 26')
on conflict (kit_key) do nothing;

-- ── 2. 보유 유니폼 ─────────────────────────────────────────────────────
create table if not exists user_avatar_kits (
  user_id       text not null,
  kit_key       text not null references avatar_kits(kit_key) on delete cascade,
  points_spent  int  not null default 0,
  acquired_at   timestamptz not null default now(),
  primary key (user_id, kit_key)
);

create index if not exists user_avatar_kits_user_idx on user_avatar_kits(user_id);

-- 착용 중인 유니폼 + 아바타 캐릭터 (지금은 브라우저 localStorage 에만 있다)
alter table profiles add column if not exists equipped_kit_key text;
alter table profiles add column if not exists avatar_character text
  check (avatar_character in ('colin', 'chloe'));

alter table user_avatar_kits enable row level security;
alter table avatar_kits enable row level security;

-- 카탈로그는 누구나 읽는다(가격표). 보유 목록은 본인 것만.
drop policy if exists avatar_kits_read on avatar_kits;
create policy avatar_kits_read on avatar_kits for select using (true);

drop policy if exists user_avatar_kits_read_own on user_avatar_kits;
create policy user_avatar_kits_read_own on user_avatar_kits
  for select using (user_id = auth.jwt() ->> 'sub');

-- ── 3. 유니폼 구매 RPC ────────────────────────────────────────────────
-- 점수 차감은 벽돌과 같은 규칙: 그 말머리(=팀)에 쌓은 score_balance 에서만 뺀다.
create or replace function buy_avatar_kit(
  p_user_id  text,
  p_flair_id uuid,
  p_kit_key  text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_price     int;
  v_kit_team  text;
  v_flair_team text;
  v_balance   int;
begin
  select price_points, team_id into v_price, v_kit_team
    from avatar_kits where kit_key = p_kit_key and is_active;
  if v_price is null then
    return jsonb_build_object('ok', false, 'error', '판매 중인 유니폼이 아닙니다.');
  end if;

  select team_id into v_flair_team from post_flairs where id = p_flair_id;
  if v_flair_team is null then
    return jsonb_build_object('ok', false, 'error', '구단이 연결된 말머리가 아닙니다.');
  end if;
  if v_flair_team is distinct from v_kit_team then
    return jsonb_build_object('ok', false, 'error', '내 팀 유니폼만 구매할 수 있습니다.');
  end if;

  if exists (select 1 from user_avatar_kits where user_id = p_user_id and kit_key = p_kit_key) then
    return jsonb_build_object('ok', false, 'error', '이미 보유한 유니폼입니다.');
  end if;

  -- 잔액 확인과 차감을 한 문장으로 — 동시에 두 번 눌러도 한 번만 빠진다
  update user_flair_scores
     set score_balance = score_balance - v_price
   where user_id = p_user_id
     and flair_id = p_flair_id
     and score_balance >= v_price
  returning score_balance into v_balance;

  if v_balance is null then
    return jsonb_build_object('ok', false, 'error', '활동 점수가 부족합니다.', 'price', v_price);
  end if;

  insert into user_avatar_kits (user_id, kit_key, points_spent)
  values (p_user_id, p_kit_key, v_price);

  -- profiles.id 는 uuid, Clerk 식별자는 profiles.user_id 다
  update profiles set equipped_kit_key = p_kit_key where user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'kit_key', p_kit_key,
    'price', v_price,
    'remaining', v_balance
  );
end;
$$;

-- 경제 RPC 권한 규율 (⚠️ REVOKE FROM anon 은 no-op 인 경우가 있다 — PUBLIC 에서 회수)
revoke all on function buy_avatar_kit(text, uuid, text) from public;
revoke all on function buy_avatar_kit(text, uuid, text) from anon;
revoke all on function buy_avatar_kit(text, uuid, text) from authenticated;

-- ── 4. 벽돌: 단가 100점 + team_id/user_id 뒤바뀜 수정 ──────────────────
create or replace function public.buy_stadium_bricks(
  p_user_id text, p_flair_id uuid, p_brick_count integer
) returns jsonb
language plpgsql
security definer
as $$
declare
  -- ⚠️ lib/constants/stadium-bricks.ts 의 BRICK_PRICE 와 같은 값이어야 한다
  v_price      constant int := 100;
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

  v_donate := donate_flair_score_to_team(p_user_id, p_flair_id, v_amount);
  if coalesce((v_donate->>'ok')::boolean, false) = false then
    return v_donate;
  end if;

  v_team_id := v_donate->>'team_id';

  select coalesce(sum(brick_count), 0) into v_start
    from stadium_bricks where team_id = v_team_id;

  -- ⚠️ 예전에는 여기 값이 (p_user_id, v_team_id) 로 뒤집혀 들어가 순번과
  --    "내 벽돌 수" 가 영원히 0 이었다.
  insert into stadium_bricks (team_id, user_id, brick_count, points_spent, start_index)
  values (v_team_id, p_user_id, p_brick_count, v_amount, v_start);

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

revoke all on function buy_stadium_bricks(text, uuid, int) from public;
revoke all on function buy_stadium_bricks(text, uuid, int) from anon;
revoke all on function buy_stadium_bricks(text, uuid, int) from authenticated;
