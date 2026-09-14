BEGIN;
-- Existing purchases may already have been paid by the old non-idempotent RPC.
ALTER TABLE public.prediction_purchases ADD COLUMN IF NOT EXISTS reward_version text NOT NULL DEFAULT 'legacy';
-- During rolling deployment, old app instances must keep producing legacy purchases.
-- Only the new purchase route explicitly opts into receipt-v1.
ALTER TABLE public.prediction_purchases ALTER COLUMN reward_version SET DEFAULT 'legacy';
CREATE TABLE IF NOT EXISTS public.seller_reward_receipts (
  purchase_id uuid PRIMARY KEY,
  seller_id text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.seller_reward_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_reward_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.seller_reward_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.pay_analysis_seller(p_purchase_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE p public.prediction_purchases%ROWTYPE; receipt public.seller_reward_receipts%ROWTYPE;
  amount integer; paid jsonb;
BEGIN
  SELECT * INTO p FROM public.prediction_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase missing'; END IF;
  IF p.reward_version <> 'receipt-v1' THEN RAISE EXCEPTION 'legacy purchase requires payment reconciliation'; END IF;
  amount := floor(p.gold_spent::numeric * 9 / 10)::integer;
  IF amount <= 0 OR p.seller_id = p.buyer_id THEN RAISE EXCEPTION 'invalid seller payment'; END IF;
  SELECT * INTO receipt FROM public.seller_reward_receipts WHERE purchase_id = p.id;
  IF FOUND THEN
    IF receipt.seller_id <> p.seller_id OR receipt.amount <> amount THEN RAISE EXCEPTION 'receipt mismatch'; END IF;
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  END IF;
  INSERT INTO public.seller_reward_receipts(purchase_id,seller_id,amount) VALUES(p.id,p.seller_id,amount);
  paid := public.reward_gold(p.seller_id, amount, '분석글 판매 수익', 'analysis_sale_revenue');
  IF (paid->>'success')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'reward failed'; END IF;
  RETURN jsonb_build_object('success', true, 'duplicate', false, 'amount', amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_pending_seller_reward(p_reward_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE q public.pending_seller_rewards%ROWTYPE; p public.prediction_purchases%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO q FROM public.pending_seller_rewards WHERE id = p_reward_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reward missing'; END IF;
  IF q.status = 'resolved' THEN RETURN jsonb_build_object('success', true, 'duplicate', true); END IF;
  SELECT * INTO p FROM public.prediction_purchases WHERE id = q.purchase_id;
  IF NOT FOUND OR p.seller_id <> q.seller_id OR p.buyer_id <> q.buyer_id OR p.activity_id <> q.activity_id
    OR q.amount <> floor(p.gold_spent::numeric * 9 / 10)::integer OR q.transaction_type <> 'analysis_sale_revenue'
    THEN RAISE EXCEPTION 'queue does not match purchase'; END IF;
  BEGIN
    result := public.pay_analysis_seller(q.purchase_id);
    UPDATE public.pending_seller_rewards SET status='resolved', resolved_at=now(), attempts=attempts+1, last_error=NULL WHERE id=q.id;
    RETURN result;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.pending_seller_rewards SET attempts=attempts+1, last_error=SQLERRM WHERE id=q.id;
    RETURN jsonb_build_object('success',false,'error','지급 이력을 확인한 뒤 다시 시도해주세요.');
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.pay_analysis_seller(uuid), public.retry_pending_seller_reward(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_analysis_seller(uuid), public.retry_pending_seller_reward(uuid) TO service_role;
COMMIT;
