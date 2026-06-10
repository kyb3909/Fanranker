-- 플레이스홀더 공지 배너 3개 (가오픈 전까지 노출용, 이후 admin에서 교체/삭제 가능)
-- Idempotent: 같은 title이 이미 있으면 INSERT skip.
INSERT INTO announcement_banners (title, description, link_url, gradient, sort_order, is_active)
SELECT v.title, v.description, v.link_url, v.gradient, v.sort_order, true
FROM (VALUES
  (
    '🏟️ 공놀이판 가오픈 중!',
    '스포츠 예측 + 팬 커뮤니티. 회원가입하고 무료 볼 받아 첫 예측 해보세요.',
    '/sign-up',
    'from-rose-600 to-pink-600',
    1
  ),
  (
    '🎯 전문가 예측 무료 공개',
    '경기 종료된 모든 전문가 분석글은 무료로 열람할 수 있어요. 경기 분석글 탭에서 확인!',
    '/?tab=content',
    'from-indigo-600 to-purple-600',
    2
  ),
  (
    '🔥 실시간 인기글 알림',
    '팔로우한 커뮤니티에서 핫한 글이 올라오면 하단에 바로 알려드려요.',
    '/',
    'from-emerald-500 to-teal-600',
    3
  )
) AS v(title, description, link_url, gradient, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM announcement_banners WHERE announcement_banners.title = v.title
);
