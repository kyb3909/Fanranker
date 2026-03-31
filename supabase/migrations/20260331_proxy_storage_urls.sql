-- Supabase Storage URL → 프록시 경로 변환 (도메인 노출 방지)
-- posts.image
UPDATE posts
SET image = REPLACE(image, 'https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/', '/storage/')
WHERE image LIKE '%ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/%';

-- profiles.avatar_url
UPDATE profiles
SET avatar_url = REPLACE(avatar_url, 'https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/', '/storage/')
WHERE avatar_url LIKE '%ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/%';

-- posts.content (TipTap JSON 내 이미지 URL)
UPDATE posts
SET content = REPLACE(content::text, 'https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/', '/storage/')::jsonb
WHERE content::text LIKE '%ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/%';

-- stickers.image_url
UPDATE stickers
SET image_url = REPLACE(image_url, 'https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/', '/storage/')
WHERE image_url LIKE '%ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/%';
