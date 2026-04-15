import React, { useEffect, useState } from 'react';
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth, trackAnalyticsEvent } from '../lib/firebase-config';

type AuthActionMode = '' | 'resetPassword' | 'verifyEmail';
type ResetState = 'checking' | 'ready' | 'invalid' | 'success' | 'verified';

function VisibilityToggleButton({
  shown,
  onToggle,
  label,
}: {
  shown: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-[#3f3320] bg-[#141008] p-1.5 text-[#cfb67b] hover:border-[#8d6a2d] hover:text-[#f0d79c]"
    >
      {shown ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M10.58 10.58a2 2 0 0 0 2.84 2.84"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M9.88 5.09A10.3 10.3 0 0 1 12 4.9c5.37 0 9.3 3.58 10.6 6.95a1 1 0 0 1 0 .7 12.82 12.82 0 0 1-4.23 5.45M6.17 6.18A12.92 12.92 0 0 0 1.4 11.85a1 1 0 0 0 0 .7c1.3 3.36 5.23 6.95 10.6 6.95a10.4 10.4 0 0 0 4.12-.82"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M1.4 12.2a1 1 0 0 1 0-.7C2.7 8.13 6.63 4.55 12 4.55s9.3 3.58 10.6 6.95a1 1 0 0 1 0 .7c-1.3 3.36-5.23 6.95-10.6 6.95S2.7 15.56 1.4 12.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )}
    </button>
  );
}

function mapVerifyError(error: unknown): string {
  const code = String((error as { code?: string } | null)?.code || '').toLowerCase();
  if (code.includes('expired-action-code')) return 'This reset link has expired. Request a new one from Forgot password.';
  if (code.includes('invalid-action-code')) return 'This reset link is invalid or already used.';
  if (code.includes('user-disabled')) return 'This account is disabled. Contact support for help.';
  if (code.includes('user-not-found')) return 'This account is no longer available. Request a new reset link if needed.';
  return 'Unable to verify reset link. Request a new one from Forgot password.';
}

function mapEmailVerificationActionError(error: unknown): string {
  const code = String((error as { code?: string } | null)?.code || '').toLowerCase();
  if (code.includes('expired-action-code')) return 'This verification link has expired. Request a new verification email.';
  if (code.includes('invalid-action-code')) return 'This verification link is invalid or already used.';
  if (code.includes('user-disabled')) return 'This account is disabled. Contact support for help.';
  if (code.includes('user-not-found')) return 'This account is no longer available.';
  return 'Unable to verify email right now. Request a new verification email.';
}

function mapConfirmError(error: unknown): string {
  const code = String((error as { code?: string } | null)?.code || '').toLowerCase();
  if (code.includes('weak-password')) return 'New password is too weak. Use at least 6 characters.';
  if (code.includes('expired-action-code')) return 'This reset link has expired. Request a new one.';
  if (code.includes('invalid-action-code')) return 'This reset link is invalid or already used.';
  if (code.includes('network-request-failed')) return 'Network error while updating password. Check connection and retry.';
  return 'Unable to update password right now. Please try again.';
}

function readActionDataFromUrl(): { mode: AuthActionMode; oobCode: string; continueUrl: string } {
  if (typeof window === 'undefined') return { mode: '', oobCode: '', continueUrl: '' };
  const params = new URLSearchParams(window.location.search);
  return {
    mode: String(params.get('mode') || '') as AuthActionMode,
    oobCode: String(params.get('oobCode') || ''),
    continueUrl: String(params.get('continueUrl') || ''),
  };
}

function normalizeContinuePath(rawContinueUrl: string, mode: AuthActionMode): string {
  const fallbackPath = mode === 'verifyEmail' ? '/profile' : '/';
  const raw = String(rawContinueUrl || '').trim();
  if (!raw || typeof window === 'undefined') return fallbackPath;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallbackPath;
    const normalizedPath = `${parsed.pathname}${parsed.search}${parsed.hash}` || fallbackPath;
    const normalizedPathname = parsed.pathname.replace(/\/+$/, '') || '/';

    // Prevent redirect loops to action pages after completion.
    if (normalizedPathname === '/auth-action') {
      return fallbackPath;
    }

    return normalizedPath;
  } catch {
    return fallbackPath;
  }
}

export default function PasswordResetPage() {
  const [actionMode, setActionMode] = useState<AuthActionMode>('');
  const [resetState, setResetState] = useState<ResetState>('checking');
  const [resetCode, setResetCode] = useState('');
  const [continuePath, setContinuePath] = useState('/');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Checking action link...');
  const [busy, setBusy] = useState(false);
  const passwordsMatch = newPassword.length > 0 && confirmNewPassword.length > 0 && newPassword === confirmNewPassword;
  const passwordsMismatch = confirmNewPassword.length > 0 && newPassword !== confirmNewPassword;
  const canSubmit =
    !busy &&
    newPassword.length >= 6 &&
    confirmNewPassword.length > 0 &&
    newPassword === confirmNewPassword;

  useEffect(() => {
    const { mode, oobCode, continueUrl } = readActionDataFromUrl();
    setActionMode(mode);
    setContinuePath(normalizeContinuePath(continueUrl, mode));

    if ((mode !== 'resetPassword' && mode !== 'verifyEmail') || !oobCode) {
      setResetState('invalid');
      setStatusMessage('Action link is incomplete or invalid. Request a fresh link from the app.');
      void trackAnalyticsEvent('auth_action_link_invalid', { reason: 'missing_code_or_mode' });
      return;
    }

    setResetCode(oobCode);
    void trackAnalyticsEvent('auth_action_link_received', { action_mode: mode });

    if (mode === 'verifyEmail') {
      const verifyEmailAction = async () => {
        try {
          await applyActionCode(auth, oobCode);
          setResetState('verified');
          setStatusMessage('Email verified successfully. Continue to your profile.');
          void trackAnalyticsEvent('auth_email_action_verified');
        } catch (error) {
          setResetState('invalid');
          setStatusMessage(mapEmailVerificationActionError(error));
          void trackAnalyticsEvent('auth_email_action_invalid', {
            error_code: String((error as { code?: string } | null)?.code || 'unknown'),
          });
        }
      };

      void verifyEmailAction();
      return;
    }

    const verifyResetCode = async () => {
      try {
        await verifyPasswordResetCode(auth, oobCode);
        setResetState('ready');
        setStatusMessage('Reset link verified. Enter your new password.');
        void trackAnalyticsEvent('reset_link_verified');
      } catch (error) {
        setResetState('invalid');
        setStatusMessage(mapVerifyError(error));
        void trackAnalyticsEvent('reset_link_invalid', {
          error_code: String((error as { code?: string } | null)?.code || 'unknown'),
        });
      }
    };

    void verifyResetCode();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (resetState !== 'ready' || !resetCode) return;

    const password = String(newPassword || '');
    const confirm = String(confirmNewPassword || '');

    if (password.length < 6) {
      setStatusMessage('New password must be at least 6 characters.');
      return;
    }

    if (password !== confirm) {
      setStatusMessage('Passwords do not match.');
      return;
    }

    try {
      setBusy(true);
      setStatusMessage('Updating password...');
      void trackAnalyticsEvent('reset_submit_requested');

      await confirmPasswordReset(auth, resetCode, password);

      setResetState('success');
      setStatusMessage('Password updated successfully. You can now sign in.');
      setNewPassword('');
      setConfirmNewPassword('');
      void trackAnalyticsEvent('reset_submit_success');
    } catch (error) {
      setStatusMessage(mapConfirmError(error));
      void trackAnalyticsEvent('reset_submit_failed', {
        error_code: String((error as { code?: string } | null)?.code || 'unknown'),
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePrimaryNavigation = () => {
    if (actionMode === 'verifyEmail' || resetState === 'success') {
      void trackAnalyticsEvent('auth_action_continue', { action_mode: actionMode || 'unknown' });
      window.location.assign(continuePath);
      return;
    }

    void trackAnalyticsEvent('reset_back_to_chat');
    window.location.assign('/');
  };

  const pageTitle = actionMode === 'verifyEmail' ? 'Verify Email' : 'Reset Password';
  const pageDescription = actionMode === 'verifyEmail'
    ? 'Use the email verification link to confirm your account access.'
    : 'Use the password reset link from your email to securely set a new password.';
  const primaryButtonText = actionMode === 'verifyEmail'
    ? 'Continue'
    : resetState === 'success'
      ? 'Continue'
      : 'Back To Chat';

  return (
    <div className="min-h-screen bg-[#020101] text-[#EAEAEA] px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[#4b3a18] bg-[#090703] p-6 shadow-[0_0_35px_rgba(184,134,11,0.14)]">
        <p className="text-xs uppercase tracking-[0.28em] text-[#9b8b67]">Ephemeral System</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-wide text-[#f2f2f2]">{pageTitle}</h1>
        <p className="mt-2 text-sm text-[#b8b8b8]">{pageDescription}</p>

        <div
          className={`mt-4 rounded-lg border p-3 text-sm ${
            resetState === 'invalid'
              ? 'border-[#5f2e2e] bg-[#1a0d0d] text-[#efc7c7]'
              : resetState === 'success'
                ? 'border-[#5d4a1e] bg-[#1c1508] text-[#ecd7a2]'
                : 'border-[#3f3320] bg-[#0f0c07] text-[#d4d4d4]'
          }`}
        >
          {statusMessage}
        </div>

        {resetState === 'ready' && (
          <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="new-password-input" className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">
                New Password
              </label>
              <div className="relative mt-1">
                <input
                  id="new-password-input"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-12 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                />
                <VisibilityToggleButton
                  shown={showNewPassword}
                  onToggle={() => setShowNewPassword((prev) => !prev)}
                  label={showNewPassword ? 'Hide new password' : 'Show new password'}
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm-new-password-input" className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">
                Confirm New Password
              </label>
              <div className="relative mt-1">
                <input
                  id="confirm-new-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className={`w-full rounded-lg border bg-[#0f0c07] px-3 py-2 pr-12 text-sm text-[#ececec] outline-none transition-colors ${
                    passwordsMismatch
                      ? 'border-[#7a2f2f] focus:border-[#b45050]'
                      : passwordsMatch
                        ? 'border-[#5f6f3a] focus:border-[#93ab52]'
                        : 'border-[#3f3320] focus:border-[#9a7a38]'
                  }`}
                />
                <VisibilityToggleButton
                  shown={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((prev) => !prev)}
                  label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                />
              </div>
              {passwordsMismatch && (
                <p className="mt-1 text-xs text-[#d99898]">Passwords do not match.</p>
              )}
              {passwordsMatch && (
                <p className="mt-1 text-xs text-[#bdda93]">Passwords match.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-lg border border-[#7f5f24] bg-[#1b1306] px-4 py-2 text-sm text-[#f0e1c3] hover:bg-[#2a1d09] disabled:opacity-60"
            >
              {busy ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={handlePrimaryNavigation}
          className="mt-4 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-4 py-2 text-sm text-[#d9d9d9] hover:border-[#7f5f24] hover:bg-[#1a1307]"
        >
          {primaryButtonText}
        </button>
      </div>
    </div>
  );
}
