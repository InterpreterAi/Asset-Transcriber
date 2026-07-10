import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  email: string;
  hasPayPalSubscription: boolean;
  isGoogleAccount: boolean;
  twoFactorEnabled: boolean;
};

export function DeleteAccountSection({
  email,
  hasPayPalSubscription,
  isGoogleAccount,
  twoFactorEnabled,
}: Props) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFaEnabled, setTwoFaEnabled] = useState(twoFactorEnabled);

  useEffect(() => {
    void fetch("/api/auth/2fa/status", { credentials: "include" })
      .then(async (r) => (r.ok ? ((await r.json()) as { enabled?: boolean }) : null))
      .then((d) => {
        if (d && typeof d.enabled === "boolean") setTwoFaEnabled(d.enabled);
      })
      .catch(() => {});
  }, []);

  const resetForm = useCallback(() => {
    setPassword("");
    setTotpToken("");
    setConfirmEmail("");
    setError(null);
  }, []);

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (twoFaEnabled && totpToken.trim()) {
        body.totpToken = totpToken.trim();
      } else if (!isGoogleAccount && password) {
        body.password = password;
      } else if (twoFaEnabled && password && !isGoogleAccount) {
        body.password = password;
      }
      if (isGoogleAccount && !twoFaEnabled) {
        body.confirmEmail = confirmEmail.trim();
      }

      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not delete account. Please try again.");
        return;
      }

      queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
      setOpen(false);
      setLocation("/login?deleted=1");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    (twoFaEnabled
      ? totpToken.trim().length >= 6 || (!isGoogleAccount && password.length >= 1)
      : isGoogleAccount
        ? confirmEmail.trim().toLowerCase() === email.trim().toLowerCase()
        : password.length >= 1);

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-medium text-destructive">Delete account</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Close your account permanently. You will not be able to sign in again, and this email cannot be used for a new free trial.
            Your record may be kept internally for fraud prevention (same as a ban).
          </p>
          {hasPayPalSubscription && (
            <p className="text-sm text-muted-foreground mt-2">
              An active PayPal subscription will be cancelled automatically when you delete your account.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Data protection (LGPD / GDPR):{" "}
            <a href="/account" className="underline underline-offset-2">
              Account settings
            </a>
            {" · "}
            You may also email support from the workspace if you need help.
          </p>

          <AlertDialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) resetForm();
            }}
          >
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="mt-4" type="button">
                Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close your account permanently?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      Your account for <strong className="text-foreground">{email}</strong> will be closed.
                      You will not be able to log in again, and you cannot open a new free trial with this email.
                    </p>
                    {hasPayPalSubscription && (
                      <p>Your PayPal subscription will be cancelled so you are not charged again.</p>
                    )}
                    {twoFaEnabled ? (
                      <div className="space-y-2">
                        <Label htmlFor="delete-totp">Authenticator code</Label>
                        <Input
                          id="delete-totp"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={totpToken}
                          onChange={(e) => setTotpToken(e.target.value)}
                          placeholder="6-digit code"
                        />
                        {!isGoogleAccount && (
                          <>
                            <Label htmlFor="delete-password-2fa">Or your password</Label>
                            <Input
                              id="delete-password-2fa"
                              type="password"
                              autoComplete="current-password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                            />
                          </>
                        )}
                      </div>
                    ) : isGoogleAccount ? (
                      <div className="space-y-2">
                        <Label htmlFor="delete-confirm-email">
                          Type your email to confirm: <span className="font-mono">{email}</span>
                        </Label>
                        <Input
                          id="delete-confirm-email"
                          type="email"
                          autoComplete="email"
                          value={confirmEmail}
                          onChange={(e) => setConfirmEmail(e.target.value)}
                          placeholder={email}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="delete-password">Your password</Label>
                        <Input
                          id="delete-password"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                    )}
                    {error && <p className="text-destructive text-sm">{error}</p>}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!canSubmit}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDelete();
                  }}
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Yes, close my account"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
