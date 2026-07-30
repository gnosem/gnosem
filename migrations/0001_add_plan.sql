-- 0001_add_plan.sql — Add plan + Stripe subscription tracking to users.
-- Free tier: 200 memories. Pro: unlimited.

ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN subscription_id TEXT;
ALTER TABLE users ADD COLUMN subscription_status TEXT;
ALTER TABLE users ADD COLUMN subscription_period_end INTEGER;

CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS users_subscription_idx ON users(subscription_id);
