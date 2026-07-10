# Referral Attribution QA Checklist

Use this checklist before release to confirm referral attribution survives short links, in-app browsers, and OAuth.

## Preconditions

- API and app are running with latest referral fixes.
- Test referrer account exists (example: `id=1`, `username=admin`).
- Fresh test browser profile (or clear cookies/session storage before each case).
- Canonical referral link format:
  - `https://app.interpreterai.org/invite?ref=<referrerUserId>&u=<referrerUsername>`
  - Example: `https://app.interpreterai.org/invite?ref=1&u=admin`

## Case 1: Direct Invite Link -> Email Signup

- Open canonical invite link in a normal browser tab.
- Confirm redirect path keeps params (`/invite` -> `/signup?ref=...&u=...`).
- Complete email signup.
- Expected result:
  - New user is created successfully.
  - Referral row is created and linked to referrer.
  - User-side referrals page reflects the new referred user.
  - Admin referrals analytics/timeline shows the join event.

## Case 2: Direct Invite Link -> Google Signup

- Open canonical invite link in a normal browser tab.
- Click `Continue with Google` on signup/login.
- Complete Google OAuth and land in workspace.
- Expected result:
  - OAuth signup/login succeeds.
  - Referral attribution is retained.
  - New user appears under referrer in user/admin referral views.

## Case 3: Shortened Link (LinkedIn/Instagram style) -> Email Signup

- Create short URL that resolves to canonical invite link.
- Open short URL and let it resolve.
- Confirm resulting flow still reaches `/invite?ref=...&u=...` and then `/signup?ref=...&u=...`.
- Complete email signup.
- Expected result:
  - Referral attribution remains intact (same checks as Case 1).

## Case 4: In-App Browser Block Screen -> Open in Safari/Chrome -> Email Signup

- Open invite link inside an in-app browser (LinkedIn/Instagram/Facebook).
- Confirm full-screen warning appears on signup/login page.
- Click `Open in Safari / Chrome`.
- Expected URL behavior:
  - Opens canonical `/invite?ref=...&u=...` (not plain `/signup`).
  - Redirects to `/signup?ref=...&u=...`.
- Complete email signup.
- Expected result:
  - Attribution remains intact in referral tables/pages.

## Case 5: In-App Browser Block Screen -> Open in Safari/Chrome -> Google Signup

- Repeat Case 4 flow, but choose `Continue with Google`.
- Complete OAuth.
- Expected result:
  - Attribution survives handoff and OAuth callback.
  - Referred user is linked correctly in user/admin referrals.

## Case 6: Cookie Fallback Recovery

- Start from `/invite?ref=...&u=...` to set referral cookie.
- Manually navigate to `/signup` without params (simulate param loss).
- Complete email signup.
- Expected result:
  - Signup still attributes to referrer via server cookie fallback.

## Case 7: Attribution Cookie Cleanup

- Complete a successful referred signup/login.
- Inspect browser cookies for `ia_ref`.
- Expected result:
  - `ia_ref` is cleared after successful account creation/login completion.

## Negative Cases

- Invalid ref format (`ref=abc`) should not create referral attribution.
- Self-referral should not be inserted.
- Unknown referrer ID should not create referral row.

## Pass Criteria

- All positive cases produce correct referral linkage in:
  - User referral dashboard (`/referrals`)
  - Admin referral analytics/timeline
- Negative cases do not create incorrect referral rows.
- No regression in normal login/signup without referral params.
