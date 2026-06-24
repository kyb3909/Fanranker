-- 메타버스 Realtime presence/broadcast 권한 (게스트=anon 포함)
--
-- 증상: /metaverse/gandalf 등에서 여러 명이 접속해도 서로 아바타가 안 보임.
-- 원인: Supabase Realtime authorization 은 private 채널의 broadcast/presence 를
--   realtime.messages 테이블 RLS 로 통제하는데, anon(게스트)·authenticated 모두에
--   허용 정책이 없어 presence 가 전파되지 않았다 (presenceState 가 빈 배열).
--   node 2-connection 테스트로 확인: subscribe=SUBSCRIBED 이지만 presenceState=[].
--
-- 해결: 채널 topic 이 'metaverse:%' 인 경우에만 anon+authenticated 의 read(receive)
--   와 write(send) 를 허용한다. 다른 Realtime 채널에는 영향 없음.
--
-- 클라이언트는 해당 채널을 `{ config: { private: true } }` 로 열어야 이 RLS 가 적용된다
--   (별도 커밋에서 indoor/sidescroll/room/world 채널에 private 플래그 추가).

-- 받기(presence sync / broadcast 수신)
create policy "metaverse realtime read (anon+auth)"
  on realtime.messages
  for select
  to anon, authenticated
  using (realtime.topic() like 'metaverse:%');

-- 보내기(presence track / broadcast 송신)
create policy "metaverse realtime write (anon+auth)"
  on realtime.messages
  for insert
  to anon, authenticated
  with check (realtime.topic() like 'metaverse:%');
