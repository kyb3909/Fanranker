-- ============================================
-- 070: Extend purchased_content for real-money purchases
-- Purpose: Track whether content was purchased with tokens, gold, or KRW
-- Dependencies: 014_create_purchased_content.sql, 069_create_payment_orders.sql
-- ============================================

ALTER TABLE purchased_content
    ADD COLUMN IF NOT EXISTS payment_order_id uuid REFERENCES payment_orders(id),
    ADD COLUMN IF NOT EXISTS currency text DEFAULT 'token'
        CHECK (currency IN ('token', 'gold', 'krw'));

-- ============================================
-- Verification
-- ============================================
SELECT 'purchased_content extended for payments!' as status;
