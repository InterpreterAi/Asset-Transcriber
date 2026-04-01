# InterpreterAI — Operator Manual

> A practical guide for running and maintaining InterpreterAI without an AI developer.

---

## Table of Contents

1. [How to Deploy](#1-how-to-deploy)
2. [How to Monitor Usage](#2-how-to-monitor-usage)
3. [How to Reset the Admin Password](#3-how-to-reset-the-admin-password)
4. [How to Manage Users](#4-how-to-manage-users)
5. [How to Monitor Live Sessions](#5-how-to-monitor-live-sessions)
6. [How to Handle API Cost Spikes](#6-how-to-handle-api-cost-spikes)
7. [How to Handle Support Tickets](#7-how-to-handle-support-tickets)
8. [Common Issues & Fixes](#8-common-issues--fixes)
9. [Backup & Recovery](#9-backup--recovery)

---

## 1. How to Deploy

### Initial Deployment on Replit

1. Open the project on Replit.
2. Ensure all required **environment variables** (Secrets) are set in the Replit Secrets panel:
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `ADMIN_PASSWORD`
   - `SONIOX_API_KEY`
   - `OPENAI_API_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (for Google login)
   - `RESEND_API_KEY` (for password reset emails)
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (for admin notifications)
3. Click the **Deploy** button in Replit (top-right).
4. Replit builds and publishes the app to a `.replit.app` domain.
5. The app is live. Users can sign up, log in, and use the workspace.

### What Happens on Server Startup
Every time the server starts (deploy, restart, or crash recovery):
1. Database tables are created if they don't exist (safe, idempotent)
2. Any stale/orphaned sessions are automatically closed
3. Stripe products are synced from your Stripe account
4. If `ADMIN_PASSWORD` is set, the admin account password is reset to that value

### Updating the App
If code changes have been made:
1. In Replit, click **Deploy** again
2. The new version replaces the old one with zero data loss
3. Active user sessions are preserved (session data is in PostgreSQL)

---

## 2. How to Monitor Usage

### Via the Admin Dashboard

1. Log in to the app with your admin account
2. Navigate to `/admin`
3. The **Overview** tab shows:
   - Total active users today (DAU)
   - Total minutes used today across all users
   - Estimated API cost today and all-time
   - Monthly Recurring Revenue (MRR) from Stripe subscriptions
   - Number of currently active sessions

### Via the Monitor Tab
- Click the **Monitor** tab in the admin sidebar
- See all currently running transcription sessions in real-time
- Each card shows: user, language pair, duration, mic/tab audio type
- You can click a session to see its live snapshot (transcript in progress)

### Key Metrics to Watch Daily
| Metric | Where | Warning Sign |
|--------|-------|-------------|
| API cost today | Overview tab | Unusually high = check for runaway sessions |
| Active sessions | Monitor tab | Sessions stuck for hours = stale session |
| Failed logins | Errors tab | Spike = possible brute-force attack |
| Support tickets | Support tab | Unread open tickets |

---

## 3. How to Reset the Admin Password

### Method 1: Environment Variable (Recommended)
1. Go to the Replit project → **Secrets** panel
2. Set or update the `ADMIN_PASSWORD` secret to your new desired password
3. Restart the API server workflow (or redeploy)
4. On startup, the admin password is automatically reset to the new value
5. Log in with the new password at `/login`

### Method 2: Direct Database Update (Emergency)
If you cannot access Replit but have database access:
```sql
-- Replace 'new_hashed_password' with an Argon2id hash of your new password
UPDATE users SET password_hash = 'new_hashed_password' WHERE is_admin = true;
```
Note: You need to generate an Argon2id hash using a tool like the `argon2` CLI or an online hasher.

---

## 4. How to Manage Users

All user management is done from the **Users** tab in the admin dashboard (`/admin`).

### View All Users
- The Users tab shows a searchable list of all registered accounts
- Columns: Name, Email, Plan, Status, Usage today, Sessions, Last active

### Edit a User
1. Click any user row to open the edit drawer
2. You can change:
   - **Email** and **Username**
   - **Plan type** (`trial`, `pro`, `enterprise`)
   - **Daily limit** (minutes per day)
   - **Active status** (toggle off to suspend the account)
   - **Admin status**
3. Click **Save Changes**

### Suspend a User
1. Open the user's edit drawer
2. Toggle **Active** to Off
3. Save — the user will be immediately blocked from logging in or using the workspace

### Reset a User's Daily Usage
If a user hits their daily limit and you want to give them more time today:
1. Open the user's edit drawer
2. Click **Reset Usage** button
3. Their `minutesUsedToday` counter resets to 0

### Delete a User
1. Open the user's edit drawer
2. Click the **Delete** button (red, at the bottom)
3. Confirm the dialog
4. All their sessions, glossary entries, and data are permanently removed

### Create a User Manually
1. Click the **+** (plus) button at the top of the Users tab
2. Fill in email and password
3. The account is created immediately (14-day trial by default)

### Extend a Trial
1. Open the user's edit drawer
2. Change plan type to `pro` or `enterprise`
3. This bypasses the trial expiry check

---

## 5. How to Monitor Live Sessions

### Via the Monitor Tab
1. Go to `/admin` → **Monitor** tab
2. All currently active sessions appear as cards, showing:
   - User name and email
   - Language pair (e.g., English → Spanish)
   - Session duration
   - Audio type (Microphone / Tab Audio)
3. Click a session card to see the live transcript snapshot (if the user has pushed one)

### Force-End a Session
If a session appears stuck (running for hours with no activity):
1. Click the session card to open it
2. Click **Terminate Session**
3. The session is immediately marked as ended in the database
4. The user's active session token is invalidated

### Stale Session Detection
Sessions are automatically closed on server startup if `last_activity_at` is older than 2 hours with no `ended_at`. If you see many stale sessions, restart the API server to trigger cleanup.

---

## 6. How to Handle API Cost Spikes

### Diagnosing a Cost Spike
1. Go to **Admin → Overview** — check "Estimated API cost today"
2. Go to **Admin → Monitor** — look for sessions running unusually long
3. Go to **Admin → Users** — sort by "Usage Today" to find the heaviest users

### Immediate Actions

**If one user is consuming excessive resources:**
1. Open their user drawer
2. Lower their **Daily Limit** (e.g., from 300 min to 60 min)
3. Click Reset Usage if you want to give them a fresh start with the new limit

**If a session appears stuck:**
1. Go to Monitor tab
2. Terminate the stuck session manually

**If abuse is suspected:**
1. Suspend the user account (toggle Active off)
2. Review their session history and login events in the Errors tab

### Preventive Measures
- Set `ADMIN_ALLOWED_IPS` to restrict admin access to your IP only
- Regularly review the Overview tab's cost estimate
- Set conservative daily limits for trial accounts (default is 300 minutes — 5 hours)
- Configure Telegram notifications so you're alerted on new user registrations

### Stripe Cost Control
- All users must have an active subscription after the 14-day trial
- Trial accounts where `trialEndsAt` has passed are blocked from using transcription
- Visit Stripe Dashboard to review subscription revenue vs. API costs

---

## 7. How to Handle Support Tickets

### View Open Tickets
1. Go to `/admin` → **Support** tab
2. Open tickets appear at the top (sorted by recency)
3. Click any ticket to read the full message and reply history

### Reply to a Ticket
1. Click the ticket to open the thread view
2. Type your reply in the text box
3. Click **Send Reply**
4. The reply is saved and visible to the user in the Support panel

### Close a Ticket
1. Open the ticket
2. Click **Mark Resolved**
3. Status changes to `resolved` — it moves to the bottom of the list

### Telegram Notifications
If `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured, you will receive a Telegram message whenever:
- A new user signs up
- A new support ticket is submitted
- Other admin events occur

---

## 8. Common Issues & Fixes

### Users can't log in
**Check:**
- Is the account active? (Users tab → confirm Active is On)
- Has the trial expired? (Users tab → check plan type)
- Is the database reachable? (check API server logs)

**Fix:** Toggle Active on, or extend their plan.

---

### "Session limit reached" error for a user
**Cause:** User hit their daily minute limit.  
**Fix:** Reset their usage in the admin user drawer, or increase their daily limit.

---

### Transcription not working / no words appearing
**Cause:** Soniox token expired, audio permissions denied, or microphone not selected.  
**Check:**
1. Verify `SONIOX_API_KEY` is set correctly in Replit Secrets
2. Check the API server logs for Soniox token errors
3. Ask the user to check microphone permissions in their browser

---

### Admin dashboard shows no data
**Cause:** Database connection issue or admin account not recognized.  
**Fix:**
1. Verify `DATABASE_URL` is correct in Replit Secrets
2. Restart the API server workflow
3. Check if `ADMIN_PASSWORD` is set and log in with the admin account

---

### Stripe webhooks not updating subscriptions
**Cause:** `STRIPE_WEBHOOK_SECRET` incorrect or webhook endpoint not registered.  
**Fix:**
1. In the Stripe Dashboard → Webhooks → verify the endpoint URL is `https://[your-domain]/api/stripe/webhook`
2. Copy the signing secret and update `STRIPE_WEBHOOK_SECRET` in Replit Secrets
3. Restart the API server

---

### Server not starting / crash loop
**Check:**
1. Open Replit → Workflows panel → view API Server logs
2. Common causes:
   - Missing required environment variable (error will mention the variable name)
   - Database connection failure (`DATABASE_URL` wrong or DB offline)
   - Port conflict (restart the workflow)

---

## 9. Backup & Recovery

### Database Backup
Replit-managed PostgreSQL includes automatic backups. To export manually:
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### Code Backup
The full source code is version-controlled in Replit. Key files to keep:
- All `artifacts/` directories (frontend + API server)
- All `lib/` directories (DB schema, API client)
- `pnpm-workspace.yaml`
- All environment variable names (not values)

### Rollback
Replit automatically creates checkpoints on significant changes. To roll back:
1. In Replit, click the **History** icon
2. Browse to a previous checkpoint
3. Click **Restore**

### Recovering Admin Access
If you are locked out of the admin account:
1. Set `ADMIN_PASSWORD` in Replit Secrets to a new password
2. Restart the API server
3. Log in with the admin username and the new password

---

*This manual covers day-to-day operations. For deeper technical changes, refer to `INTERPRETERAI_COMPLETE_DOCUMENTATION.md`.*
