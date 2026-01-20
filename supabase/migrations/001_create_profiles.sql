-- ============================================
-- STEP 1: Create profiles table for Clerk users
-- Run this in Supabase SQL Editor
-- ============================================

-- Helper function for updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Profiles table (linked to Clerk users via JWT sub claim)
CREATE TABLE IF NOT EXISTS profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- This should match auth.jwt()->>'sub' (Clerk user ID)
    user_id text NOT NULL UNIQUE,
    nickname text NOT NULL,
    avatar_url text,
    temperature numeric(5,2) DEFAULT 36.5,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Clerk Third-Party Auth
-- Note: auth.jwt()->>'sub' returns the Clerk user ID

-- Anyone can view profiles
CREATE POLICY "Profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING ((auth.jwt()->>'sub') = user_id)
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICATION: Check if table was created
-- ============================================
SELECT 'profiles table created successfully!' as status;
