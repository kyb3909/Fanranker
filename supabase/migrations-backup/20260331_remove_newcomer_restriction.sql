-- 뉴비 등급 제한 해제: 기존 newcomer 전원 regular로 승급 + 기본값 변경
UPDATE profiles SET grade = 'regular' WHERE grade = 'newcomer';
ALTER TABLE profiles ALTER COLUMN grade SET DEFAULT 'regular';
