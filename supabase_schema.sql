-- =====================================================================
-- Subscription & Payment Tracking App — Full Schema
-- Run this entire script in the Supabase SQL Editor.
-- NOTE: This uses a custom "users" table instead of Supabase Auth,
-- with plaintext passwords, by explicit design request. Authorization is
-- enforced in the frontend, and RLS policies below simply allow the
-- anon-key client full access (see section 6). Do NOT expose the anon
-- key beyond a trusted internal tool — this schema is intentionally
-- insecure for maximum simplicity and is not suitable for a public app.
--
-- This file is kept in sync with supabase/migrations/*.sql — it is the
-- consolidated, final result of applying all of them in order, so a
-- fresh project only needs to run this one script.
-- =====================================================================

-- 1. CLEAN SLATE ------------------------------------------------------
DROP TABLE IF EXISTS payment_history CASCADE;
DROP TABLE IF EXISTS subscribers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. EXTENSIONS ---------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 3. TABLES -------------------------------------------------------------

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'data_entry', 'viewer')),
  is_active boolean NOT NULL DEFAULT true,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subscription_fee numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'red' CHECK (status IN ('red', 'yellow', 'green')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  collector_id uuid REFERENCES users(id) ON DELETE SET NULL,
  amount_paid numeric NOT NULL,
  previous_paid_amount numeric NOT NULL,
  previous_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_history_subscriber ON payment_history(subscriber_id);
CREATE INDEX idx_payment_history_created_at ON payment_history(created_at);
CREATE INDEX idx_payment_history_received_at ON payment_history(received_at);
CREATE INDEX idx_subscribers_status ON subscribers(status);

-- 4. TRIGGER: auto-update subscriber on new payment ----------------------
-- This is the SINGLE place that ever changes subscribers.paid_amount /
-- status as a result of a payment. The frontend must only INSERT into
-- payment_history (with subscriber_id, collector_id, amount_paid) and let
-- this trigger compute previous_paid_amount/previous_status and apply the
-- new totals. If the frontend also manually UPDATEs `subscribers` before
-- this insert, this trigger will read that already-updated row as
-- "previous" and add the payment again, silently doubling it.

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

CREATE TRIGGER trg_apply_payment
BEFORE INSERT ON payment_history
FOR EACH ROW
EXECUTE FUNCTION apply_payment();

-- 5. FUNCTION: undo a payment --------------------------------------------
-- Reverts the subscriber's paid_amount/status back to what they were
-- before the given payment_history row, then deletes that row.

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

-- 6. ENABLE RLS WITH PERMISSIVE ANON POLICIES -----------------------------
-- RLS is enabled (Supabase flags public tables with no RLS), but since this
-- app authenticates with a custom users table instead of Supabase Auth, the
-- frontend always connects as the `anon` role. These policies simply let
-- that anon-key client read/write everything; all real access control
-- (who can see/edit/delete what) is enforced in the frontend, not here.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_users" ON users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_users" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_users" ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_users" ON users FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "anon_select_subscribers" ON subscribers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_subscribers" ON subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_subscribers" ON subscribers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_subscribers" ON subscribers FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "anon_select_payment_history" ON payment_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_payment_history" ON payment_history FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_payment_history" ON payment_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_payment_history" ON payment_history FOR DELETE TO anon, authenticated USING (true);

-- 7. SEED DATA ------------------------------------------------------------

INSERT INTO users (username, password, role)
VALUES ('admin', '1', 'admin');

-- Optional example accounts (uncomment to use):
-- INSERT INTO users (username, password, role) VALUES ('collector1', '1', 'data_entry');
