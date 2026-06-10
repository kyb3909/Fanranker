-- 034: Add onboarding fields to profiles
-- bio: 한줄 소개
-- onboarding_completed: 온보딩 완료 여부

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- 기존 유저는 온보딩 완료 처리
UPDATE profiles SET onboarding_completed = true WHERE onboarding_completed IS NULL OR onboarding_completed = false;
