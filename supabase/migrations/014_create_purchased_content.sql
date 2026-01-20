-- ============================================
-- 014: Create purchased_content table (One-time purchase tracking)
-- Purpose: Track individual premium prediction purchases
-- Dependencies: profiles table (001_create_profiles.sql), predictions table (PRED-008)
-- ============================================

-- ============================================
-- Step 1: Create purchased_content table
-- ============================================

CREATE TABLE IF NOT EXISTS purchased_content (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    prediction_id uuid NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
    purchase_price integer NOT NULL, -- Price paid in tokens or currency
    purchased_at timestamptz DEFAULT now(),
    
    -- Prevent duplicate purchases
    UNIQUE(user_id, prediction_id)
);

-- ============================================
-- Step 2: Indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_purchased_content_user_id ON purchased_content(user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchased_content_prediction_id ON purchased_content(prediction_id);

-- ============================================
-- Step 3: Enable RLS
-- ============================================

ALTER TABLE purchased_content ENABLE ROW LEVEL SECURITY;

-- Users can view their own purchases
CREATE POLICY "Users can view their own purchases"
    ON purchased_content FOR SELECT
    USING ((auth.jwt()->>'sub') = user_id);

-- System can insert purchases (via API with proper auth)
CREATE POLICY "System can insert purchases"
    ON purchased_content FOR INSERT
    WITH CHECK (true); -- Server-side auth validation required

-- ============================================
-- Step 4: Function to check if content is purchased
-- ============================================

CREATE OR REPLACE FUNCTION is_content_purchased(
    p_user_id text,
    p_prediction_id uuid
)
RETURNS boolean
LANGUAGE SQL
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM purchased_content
        WHERE user_id = p_user_id
          AND prediction_id = p_prediction_id
    )
$$;

-- ============================================
-- Verification
-- ============================================
SELECT 'purchased_content table created successfully!' as status;
