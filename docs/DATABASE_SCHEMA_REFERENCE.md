# InterpreterAI — Database Schema Reference

> Database: PostgreSQL | ORM: Drizzle ORM | Migration: Startup `CREATE TABLE IF NOT EXISTS`

---

## Entity Relationship Overview

```
users (1) ──────────────────── (N) sessions
users (1) ──────────────────── (N) glossary_entries
users (1) ──────────────────── (N) referrals [as referrer]
users (1) ──────────────────── (1) referrals [as registered_user]
users (1) ──────────────────── (N) feedback
users (1) ──────────────────── (N) support_tickets
users (1) ──────────────────── (N) support_replies [as author]
users (1) ──────────────────── (N) login_events
users (1) ──────────────────── (N) error_logs
users (1) ──────────────────── (N) password_reset_tokens
support_tickets (1) ──────── (N) support_replies
```

---

## Table Definitions

### `users`
Central user account table. Stores credentials, plan info, usage counters, and Stripe identifiers.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Unique user ID |
| `username` | `text` | NOT NULL, UNIQUE | — | Display name / login identifier |
| `email` | `text` | UNIQUE | — | Email address (nullable for OAuth-only) |
| `password_hash` | `text` | NOT NULL | — | Argon2id password hash |
| `is_admin` | `boolean` | NOT NULL | `false` | Admin role flag |
| `is_active` | `boolean` | NOT NULL | `true` | Account suspension flag |
| `email_verified` | `boolean` | NOT NULL | `false` | Email verification status |
| `plan_type` | `text` | NOT NULL | `'trial'` | `trial` \| `pro` \| `enterprise` |
| `trial_started_at` | `timestamp` | NOT NULL | `now()` | Trial start date |
| `trial_ends_at` | `timestamp` | NOT NULL | — | Trial expiry date (start + 14 days) |
| `daily_limit_minutes` | `integer` | NOT NULL | `300` | Max minutes per day (5 hours) |
| `minutes_used_today` | `real` | NOT NULL | `0` | Today's usage counter (resets daily) |
| `total_minutes_used` | `real` | NOT NULL | `0` | Lifetime minutes used |
| `total_sessions` | `integer` | NOT NULL | `0` | Lifetime session count |
| `last_usage_reset_at` | `timestamp` | NOT NULL | `now()` | Last time daily counter was reset |
| `stripe_customer_id` | `text` | — | `null` | Stripe Customer ID |
| `stripe_subscription_id` | `text` | — | `null` | Active Stripe Subscription ID |
| `google_account_id` | `text` | UNIQUE | `null` | Google OAuth subject ID |
| `last_activity` | `timestamp` | — | `null` | Last API call timestamp |
| `two_factor_secret` | `text` | — | `null` | TOTP secret (encrypted) |
| `two_factor_enabled` | `boolean` | NOT NULL | `false` | 2FA enabled flag |
| `created_at` | `timestamp` | NOT NULL | `now()` | Account creation date |

---

### `password_reset_tokens`
Time-limited tokens for email-based password recovery.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Token ID |
| `user_id` | `integer` | NOT NULL, FK→users, CASCADE DELETE | — | Owner |
| `token` | `text` | NOT NULL, UNIQUE | — | Random hex token |
| `expires_at` | `timestamp` | NOT NULL | — | Expiry (typically 1 hour) |
| `used_at` | `timestamp` | — | `null` | When token was consumed |
| `created_at` | `timestamp` | NOT NULL | `now()` | Creation time |

---

### `sessions`
Records of each transcription/translation session. No content is stored.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Session ID |
| `user_id` | `integer` | NOT NULL, FK→users, CASCADE DELETE | — | Session owner |
| `started_at` | `timestamp` | NOT NULL | `now()` | Session start time |
| `ended_at` | `timestamp` | — | `null` | Session end time (null if active) |
| `duration_seconds` | `integer` | — | `null` | Calculated duration on stop |
| `last_activity_at` | `timestamp` | — | `null` | Last heartbeat (stale detection) |
| `lang_pair` | `text` | — | `null` | e.g., `"en-es"`, `"ar-fr"` |

---

### `glossary_entries`
User-defined term → translation pairs used as hints during transcription.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Entry ID |
| `user_id` | `integer` | NOT NULL, FK→users, CASCADE DELETE | — | Owner |
| `term` | `text` | NOT NULL | — | Source term |
| `translation` | `text` | NOT NULL | — | Target translation |
| `created_at` | `timestamp` | NOT NULL | `now()` | Creation time |

---

### `referrals`
Tracks the full referral funnel: link click → registration → first session.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Referral ID |
| `referrer_id` | `integer` | NOT NULL, FK→users, CASCADE DELETE | — | User who shared the link |
| `clicked_at` | `timestamp` | NOT NULL | `now()` | When the link was clicked |
| `registered_user_id` | `integer` | FK→users, SET NULL | `null` | New user who registered |
| `registered_at` | `timestamp` | — | `null` | When they registered |
| `has_started_session` | `boolean` | NOT NULL | `false` | Whether they started a session |
| `created_at` | `timestamp` | NOT NULL | `now()` | Record creation time |

**Notes:**
- One `referrals` row is created per link click (not per user)
- `registered_user_id` is null until the invitee completes signup
- `has_started_session` is set to `true` when the invitee calls `/api/transcription/session/start`

---

### `feedback`
User-submitted star ratings and optional comments.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Feedback ID |
| `user_id` | `integer` | NOT NULL, FK→users, CASCADE DELETE | — | Submitter |
| `rating` | `integer` | NOT NULL | — | 1–5 star rating |
| `comment` | `text` | — | `null` | Optional freeform comment |
| `created_at` | `timestamp` | NOT NULL | `now()` | Submission time |

---

### `support_tickets`
Inbound support requests from users.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Ticket ID |
| `user_id` | `integer` | FK→users, SET NULL | `null` | Submitter (null if anonymous) |
| `email` | `text` | NOT NULL | — | Contact email |
| `subject` | `text` | NOT NULL | — | Ticket subject |
| `message` | `text` | NOT NULL | — | Ticket body |
| `status` | `text` | NOT NULL | `'open'` | `open` \| `resolved` |
| `created_at` | `timestamp` | NOT NULL | `now()` | Submission time |
| `updated_at` | `timestamp` | NOT NULL | `now()` | Last update time |

---

### `support_replies`
Threaded reply messages on support tickets.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Reply ID |
| `ticket_id` | `integer` | NOT NULL, FK→support_tickets, CASCADE DELETE | — | Parent ticket |
| `author_id` | `integer` | FK→users, SET NULL | `null` | Reply author |
| `is_admin` | `boolean` | NOT NULL | `false` | Whether reply is from admin |
| `message` | `text` | NOT NULL | — | Reply body |
| `created_at` | `timestamp` | NOT NULL | `now()` | Reply time |

---

### `login_events`
Authentication audit log — every login attempt (success or failure).

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Event ID |
| `user_id` | `integer` | FK→users, SET NULL | `null` | User (null if account not found) |
| `email` | `text` | — | `null` | Attempted email |
| `ip_address` | `text` | — | `null` | Client IP |
| `user_agent` | `text` | — | `null` | Browser user agent |
| `success` | `boolean` | NOT NULL | — | Whether login succeeded |
| `failure_reason` | `text` | — | `null` | Reason for failure |
| `is_2fa` | `boolean` | NOT NULL | `false` | Whether 2FA step was involved |
| `created_at` | `timestamp` | NOT NULL | `now()` | Event time |

---

### `error_logs`
System-level error tracking for debugging and monitoring.

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| `id` | `serial` | PRIMARY KEY | auto | Log ID |
| `user_id` | `integer` | FK→users, SET NULL | `null` | User context (if authenticated) |
| `session_id` | `text` | — | `null` | Session context |
| `endpoint` | `text` | NOT NULL | — | API endpoint that errored |
| `method` | `text` | NOT NULL | `'GET'` | HTTP method |
| `status_code` | `integer` | NOT NULL | — | HTTP status code |
| `error_type` | `text` | NOT NULL | — | Error category |
| `error_message` | `text` | — | `null` | Error detail |
| `user_agent` | `text` | — | `null` | Client user agent |
| `ip_address` | `text` | — | `null` | Client IP |
| `created_at` | `timestamp` | NOT NULL | `now()` | Error time |

---

## Useful SQL Queries

### Active users today
```sql
SELECT COUNT(*) FROM users
WHERE minutes_used_today > 0 AND is_active = true;
```

### Active sessions (currently running)
```sql
SELECT s.id, u.username, s.lang_pair, s.started_at
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.ended_at IS NULL
ORDER BY s.started_at DESC;
```

### Referral funnel summary
```sql
SELECT
  COUNT(*) AS total_clicks,
  COUNT(registered_user_id) AS registrations,
  COUNT(*) FILTER (WHERE has_started_session) AS activations
FROM referrals;
```

### Top referrers
```sql
SELECT
  u.username,
  u.email,
  COUNT(*) AS clicks,
  COUNT(r.registered_user_id) AS registrations,
  COUNT(*) FILTER (WHERE r.has_started_session) AS activations
FROM referrals r
JOIN users u ON u.id = r.referrer_id
GROUP BY u.id, u.username, u.email
ORDER BY activations DESC;
```

### Failed login attempts in last 24h
```sql
SELECT email, ip_address, failure_reason, created_at
FROM login_events
WHERE success = false AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Estimated monthly cost per user
```sql
SELECT username, email,
  total_minutes_used,
  ROUND((total_minutes_used * 0.0027)::numeric, 4) AS estimated_cost_usd
FROM users
WHERE total_minutes_used > 0
ORDER BY total_minutes_used DESC;
```
