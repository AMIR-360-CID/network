# SubTrack — Subscription & Payment Tracking

React (Vite) + Tailwind CSS + Supabase.

## ⚠️ Security note (read first)

This app uses a **custom `users` table** instead of Supabase Auth, stores
**plaintext passwords**, and runs with **Row Level Security disabled** —
by explicit design, for maximum simplicity. That means:

- Anyone with your Supabase anon key can read/write every table directly
  (bypassing the app entirely), including the `users` table with its
  plaintext passwords.
- There is no session expiry, hashing, or rate-limiting on login.

This is fine for a trusted, internal tool (e.g. a small team collecting
dues) where the anon key isn't shared publicly. It is **not** appropriate
for a public-facing product. If this ever needs to be internet-facing for
strangers, switch to Supabase Auth + RLS policies and hash passwords
(e.g. with `bcrypt` in a Postgres function or an edge function).

## 1. Database setup

1. Open your Supabase project → SQL Editor.
2. Paste and run the entire contents of `supabase_schema.sql`.
3. This creates `users`, `subscribers`, `payment_history`, the auto-update
   trigger, the `undo_payment()` function, and seeds one admin account:
   - username: `admin`
   - password: `1`

## 2. Frontend setup

```bash
npm install
cp .env.example .env
# edit .env with your Supabase project URL + anon key
npm run dev
```

## 3. Telegram notifications (optional)

Open `src/utils/telegram.js` and replace:

```js
const YOUR_BOT_TOKEN = 'YOUR_BOT_TOKEN'
const YOUR_CHAT_ID = 'YOUR_CHAT_ID'
```

with your bot token (from [@BotFather](https://t.me/BotFather)) and your
chat ID. Until you do, the app logs a warning and skips the notification
instead of failing the payment.

## 4. Adding more users

There's no signup screen (by design). Add collectors/admins directly in
Supabase's Table Editor, in the `users` table:

| username | password | role |
|---|---|---|
| collector1 | 1 | collector |

## Features

- Custom username/password login (session in `localStorage`)
- Roles: `admin` (full access) vs `collector` (view, search, pay only)
- Dashboard: total collected today, fully paid, partial, unpaid, CSV export
- Add subscriber (admin only)
- Color-coded subscriber list (green/yellow/red) with search + status filter
- Payment modal with a "Pay Full" quick-fill button
- 5-minute undo window after each payment (calls `undo_payment()` in Postgres)
- Telegram webhook notification on payment
- Dark/light mode toggle
- English/Arabic toggle with full RTL layout switch
- All currency formatted in Iraqi Dinar (IQD / د.ع)
