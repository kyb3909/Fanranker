-- 월드컵 게시판 (축구 하위 채널) + 말머리
--
-- categories.parent_slug='football' 로 "축구 > 월드컵" 중첩 채널 생성.
-- /write 의 계층 표시, /community/worldcup 라우트, 말머리 필터는 전부 기존 코드가
-- DB 기반으로 자동 처리 (코드 수정 0). 월드컵 이벤트 예측자들의 의견/토론 공간.
INSERT INTO categories (slug, name, icon, parent_slug, description, sort_order, is_active)
VALUES ('worldcup', '월드컵', '🏆', 'football', '월드컵 대회 이야기 · 예측 잡담', 5, true)
ON CONFLICT (slug) DO NOTHING;

-- 월드컵 전용 말머리 (대회 단계 + 분석/잡담)
INSERT INTO post_flairs (community_slug, name, color, sort_order, is_active) VALUES
  ('worldcup', '조별리그', '#6b7280', 1, true),
  ('worldcup', '16강', '#8b5cf6', 2, true),
  ('worldcup', '8강', '#f59e0b', 3, true),
  ('worldcup', '4강', '#ef4444', 4, true),
  ('worldcup', '결승', '#fbbf24', 5, true),
  ('worldcup', '분석', '#10b981', 6, true),
  ('worldcup', '잡담', '#3b82f6', 7, true)
ON CONFLICT (community_slug, name) DO NOTHING;
