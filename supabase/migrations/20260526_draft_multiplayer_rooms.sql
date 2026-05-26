-- ============================================================
-- Draft Multiplayer Rooms — Phase 3A.1
-- PRD: docs/PRD-draft-multiplayer.md
-- ============================================================
-- 4명까지 모여서 실시간 스네이크 드래프트를 하는 방 시스템.
-- 모든 mutation 은 service role 로 (RLS 우회). 클라는 RLS 통한 SELECT 만.
-- 신규 테이블 prefix `draft_room_*` — 솔로 모드 (lib/draft/engine.ts) 와 격리.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. draft_rooms — 방 (대기실 + 진행 + 완료/포기 통합)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.draft_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text UNIQUE NOT NULL,
  host_user_id text NOT NULL,
  game_slug text NOT NULL DEFAULT 'epl',
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'drafting', 'completed', 'abandoned')),
  is_private boolean NOT NULL DEFAULT false,
  max_participants int NOT NULL DEFAULT 4
    CHECK (max_participants BETWEEN 2 AND 4),
  formation text DEFAULT '4-3-3',
  budget int NOT NULL DEFAULT 80,
  total_rounds int NOT NULL DEFAULT 11,
  snake_order int[],
  current_pick int NOT NULL DEFAULT 0,
  pick_deadline_at timestamptz,
  drafting_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draft_rooms_open
  ON public.draft_rooms (created_at DESC)
  WHERE status = 'waiting' AND is_private = false;
CREATE INDEX IF NOT EXISTS idx_draft_rooms_host
  ON public.draft_rooms (host_user_id, status);
CREATE INDEX IF NOT EXISTS idx_draft_rooms_invite
  ON public.draft_rooms (invite_code)
  WHERE status IN ('waiting', 'drafting');

COMMENT ON TABLE public.draft_rooms IS
  'PvP 드래프트 게임 방. 4명까지 모여 스네이크 드래프트. PRD-draft-multiplayer.md 참조.';
COMMENT ON COLUMN public.draft_rooms.invite_code IS
  '6자리 영문대문자+숫자, 혼동 글자(0/O/1/I/L) 제외. 친구 초대용.';
COMMENT ON COLUMN public.draft_rooms.snake_order IS
  '시작 시점에 확정되는 seat_index 순서 배열 (라운드별 reverse 는 클라에서 처리).';
COMMENT ON COLUMN public.draft_rooms.pick_deadline_at IS
  '현재 픽의 30초 deadline. 서버 권위, broadcast로 클라에 전송.';

-- ─────────────────────────────────────────────
-- 2. draft_room_seats — 좌석 (0..max_participants-1)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.draft_room_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.draft_rooms(id) ON DELETE CASCADE,
  seat_index int NOT NULL CHECK (seat_index >= 0 AND seat_index <= 3),
  user_id text,
  display_name text NOT NULL,
  is_ai boolean NOT NULL DEFAULT false,
  ai_name text,
  is_ready boolean NOT NULL DEFAULT false,
  is_host boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  disconnected_at timestamptz,
  UNIQUE (room_id, seat_index),
  CONSTRAINT seat_user_or_ai CHECK (
    (is_ai = true AND user_id IS NULL)
    OR (is_ai = false AND user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_seats_room
  ON public.draft_room_seats (room_id);
CREATE INDEX IF NOT EXISTS idx_seats_user_active
  ON public.draft_room_seats (user_id)
  WHERE left_at IS NULL AND user_id IS NOT NULL;

COMMENT ON COLUMN public.draft_room_seats.disconnected_at IS
  '30초 grace 시작 시각. NULL=정상 접속, NOT NULL=재접속 대기 중 (30초 후 AI 전환).';

-- ─────────────────────────────────────────────
-- 3. draft_room_picks — 픽 기록
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.draft_room_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.draft_rooms(id) ON DELETE CASCADE,
  pick_number int NOT NULL CHECK (pick_number >= 0),
  seat_index int NOT NULL,
  player_id text NOT NULL,
  is_auto_pick boolean NOT NULL DEFAULT false,
  picked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, pick_number),
  UNIQUE (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_picks_room
  ON public.draft_room_picks (room_id, pick_number);

COMMENT ON CONSTRAINT draft_room_picks_room_id_player_id_key ON public.draft_room_picks IS
  '한 방 안에서 같은 선수 중복 픽 금지 (동시 클릭 race 보호).';

-- ─────────────────────────────────────────────
-- 4. draft_room_messages — 채팅 + 시스템 메시지
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.draft_room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.draft_rooms(id) ON DELETE CASCADE,
  user_id text,
  display_name text NOT NULL,
  kind text NOT NULL DEFAULT 'chat'
    CHECK (kind IN ('chat', 'system_join', 'system_leave', 'system_pick', 'system_start', 'system_complete', 'system_host_change')),
  body text CHECK (body IS NULL OR length(body) <= 200),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_has_body CHECK (kind != 'chat' OR (body IS NOT NULL AND length(body) > 0))
);

CREATE INDEX IF NOT EXISTS idx_messages_room
  ON public.draft_room_messages (room_id, created_at);

COMMENT ON COLUMN public.draft_room_messages.kind IS
  'chat=사용자 메시지, system_*=시스템 알림 (입장/이탈/픽/시작/종료/호스트 변경).';

-- ─────────────────────────────────────────────
-- 5. RLS — Clerk JWT 기반
-- ─────────────────────────────────────────────
ALTER TABLE public.draft_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_room_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_room_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_room_messages ENABLE ROW LEVEL SECURITY;

-- draft_rooms:
-- (a) 공개 대기방은 익명 포함 누구나 SELECT
-- (b) 본인이 좌석 점유 중인 방은 SELECT
CREATE POLICY "rooms_open_readable" ON public.draft_rooms
  FOR SELECT
  USING (status = 'waiting' AND is_private = false);

CREATE POLICY "rooms_member_readable" ON public.draft_rooms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.draft_room_seats s
      WHERE s.room_id = draft_rooms.id
        AND s.user_id = (auth.jwt() ->> 'sub')
        AND s.left_at IS NULL
    )
  );

-- draft_room_seats: 방을 볼 수 있으면 좌석도 볼 수 있음
CREATE POLICY "seats_via_room" ON public.draft_room_seats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.draft_rooms r
      WHERE r.id = draft_room_seats.room_id
        AND (
          (r.status = 'waiting' AND r.is_private = false)
          OR EXISTS (
            SELECT 1 FROM public.draft_room_seats s2
            WHERE s2.room_id = r.id
              AND s2.user_id = (auth.jwt() ->> 'sub')
              AND s2.left_at IS NULL
          )
        )
    )
  );

-- draft_room_picks: 방 멤버만 SELECT (공개 방 대기실에선 픽 아직 없음)
CREATE POLICY "picks_via_room_member" ON public.draft_room_picks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.draft_room_seats s
      WHERE s.room_id = draft_room_picks.room_id
        AND s.user_id = (auth.jwt() ->> 'sub')
        AND s.left_at IS NULL
    )
  );

-- draft_room_messages: 방 멤버만 SELECT
CREATE POLICY "messages_via_room_member" ON public.draft_room_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.draft_room_seats s
      WHERE s.room_id = draft_room_messages.room_id
        AND s.user_id = (auth.jwt() ->> 'sub')
        AND s.left_at IS NULL
    )
  );

-- INSERT/UPDATE/DELETE 는 모두 service role 통해서만 (정책 없음 → 일반 사용자 차단)

-- ─────────────────────────────────────────────
-- 6. Realtime 활성화
-- ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_room_seats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_room_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_room_messages;
