-- =============================================================
-- Window Quote Pro — Subscriptions Table Migration
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================

-- 1. Create the subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_plan TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'free',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  trial_end TIMESTAMPTZ,
  team_seat_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(stripe_customer_id),
  UNIQUE(stripe_subscription_id)
);

-- 2. Enable Row Level Security
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. RLS policy: authenticated users can read their own subscription row
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (used by webhook and Netlify Functions) bypasses RLS,
-- so no INSERT/UPDATE/DELETE policies are needed for anon/authenticated.
-- This ensures only server-side code can modify subscription state.

-- 4. Index for fast lookups by stripe_customer_id (used by webhook)
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions (stripe_customer_id);

-- 5. Index for fast lookups by stripe_subscription_id (used by webhook)
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription
  ON subscriptions (stripe_subscription_id);

-- 6. Updated_at trigger — automatically set updated_at on row changes
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();
