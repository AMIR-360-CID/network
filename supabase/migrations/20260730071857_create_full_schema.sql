/*
# Create full application schema (users, subscribers, payment_history)

1. New Tables
- `users`: custom auth table (id, username, password, role, is_active, last_login, created_at)
- `subscribers`: subscriber records (id, name, subscription_fee, paid_amount, status, created_at, updated_at)
- `payment_history`: payment records (id, subscriber_id, collector_id, amount_paid, previous_paid_amount, previous_status, created_at, received_at)
2. Triggers
- `trg_apply_payment`: BEFORE INSERT on payment_history — computes previous values and updates subscribers.paid_amount/status atomically.
3. Functions
- `undo_payment(p_payment_id)`: reverts a payment and deletes its history row.
4. Security
- RLS enabled on all tables with permissive anon+authenticated policies (frontend enforces real access control via custom users table).
5. Seed
- Inserts default admin user (username: admin, password: 1).
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'data_entry', 'viewer')),
  is_active boolean NOT NULL DEFAULT true,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subscription_fee numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'red' CHECK (status IN ('red', 'yellow', 'green')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  collector_id uuid REFERENCES users(id) ON DELETE SET NULL,
  amount_paid numeric NOT NULL,
  previous_paid_amount numeric NOT NULL,
  previous_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_history_subscriber ON payment_history(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_history_received_at ON payment_history(received_at);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

CREATE OR REPLACE FUNCTION apply_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_fee numeric;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  SELECT subscription_fee, paid_amount
  INTO v_fee, NEW.previous_paid_amount
  FROM subscribers WHERE id = NEW.subscriber_id
  FOR UPDATE;

  SELECT status INTO NEW.previous_status
  FROM subscribers WHERE id = NEW.subscriber_id;

  v_new_paid := NEW.previous_paid_amount + NEW.amount_paid;

  IF v_new_paid <= 0 THEN
    v_new_status := 'red';
  ELSIF v_new_paid >= v_fee THEN
    v_new_status := 'green';
  ELSE
    v_new_status := 'yellow';
  END IF;

  UPDATE subscribers
  SET paid_amount = v_new_paid,
      status = v_new_status,
      updated_at = now()
  WHERE id = NEW.subscriber_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_payment ON payment_history;
CREATE TRIGGER trg_apply_payment
BEFORE INSERT ON payment_history
FOR EACH ROW
EXECUTE FUNCTION apply_payment();

CREATE OR REPLACE FUNCTION undo_payment(p_payment_id uuid)
RETURNS void AS $$
DECLARE
  v_row payment_history%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM payment_history WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment record % not found', p_payment_id;
  END IF;

  UPDATE subscribers
  SET paid_amount = v_row.previous_paid_amount,
      status = v_row.previous_status,
      updated_at = now()
  WHERE id = v_row.subscriber_id;

  DELETE FROM payment_history WHERE id = p_payment_id;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_delete_users" ON users FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_subscribers" ON subscribers;
CREATE POLICY "anon_select_subscribers" ON subscribers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_subscribers" ON subscribers;
CREATE POLICY "anon_insert_subscribers" ON subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_subscribers" ON subscribers;
CREATE POLICY "anon_update_subscribers" ON subscribers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_subscribers" ON subscribers;
CREATE POLICY "anon_delete_subscribers" ON subscribers FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_payment_history" ON payment_history;
CREATE POLICY "anon_select_payment_history" ON payment_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_payment_history" ON payment_history;
CREATE POLICY "anon_insert_payment_history" ON payment_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_payment_history" ON payment_history;
CREATE POLICY "anon_update_payment_history" ON payment_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_payment_history" ON payment_history;
CREATE POLICY "anon_delete_payment_history" ON payment_history FOR DELETE TO anon, authenticated USING (true);

INSERT INTO users (username, password, role)
VALUES ('admin', '1', 'admin')
ON CONFLICT (username) DO NOTHING;