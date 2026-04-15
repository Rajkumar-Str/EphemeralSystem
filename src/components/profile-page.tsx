import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, trackAnalyticsEvent } from '../lib/firebase-config';

type ProfileState = 'loading' | 'ready' | 'guest';

type StoredProfile = {
  email?: string;
  uid?: string;
};

type ProfileDetails = {
  displayName: string;
  role: string;
  bio: string;
  location: string;
  timezone: string;
  website: string;
  github: string;
  interests: string;
  primaryGoal: string;
  responseStyle: string;
};

type ProfileField = keyof ProfileDetails;
type ConfirmedFields = Partial<Record<ProfileField, boolean>>;

const PROFILE_USER_KEY = 'ephemeral_profile_user';
const PROFILE_DETAILS_KEY = 'ephemeral_profile_details';
const PROFILE_CONFIRMED_FIELDS_KEY = 'ephemeral_profile_confirmed_fields';
const PROFILE_ARTIFACT_APP_ID = 'default-app-id';
const PROFILE_DOC_ID = 'main';

const confirmationRequiredFields: ProfileField[] = [
  'displayName',
  'role',
  'location',
  'timezone',
  'website',
  'github',
  'primaryGoal',
];
const autoCompletionFields: ProfileField[] = ['bio', 'interests'];

const defaultDetails: ProfileDetails = {
  displayName: '',
  role: '',
  bio: '',
  location: '',
  timezone: '',
  website: '',
  github: '',
  interests: '',
  primaryGoal: '',
  responseStyle: 'Concise',
};

function sanitizeProfileDetails(value: any): ProfileDetails {
  return {
    displayName: typeof value?.displayName === 'string' ? value.displayName : '',
    role: typeof value?.role === 'string' ? value.role : '',
    bio: typeof value?.bio === 'string' ? value.bio : '',
    location: typeof value?.location === 'string' ? value.location : '',
    timezone: typeof value?.timezone === 'string' ? value.timezone : '',
    website: typeof value?.website === 'string' ? value.website : '',
    github: typeof value?.github === 'string' ? value.github : '',
    interests: typeof value?.interests === 'string' ? value.interests : '',
    primaryGoal: typeof value?.primaryGoal === 'string' ? value.primaryGoal : '',
    responseStyle: typeof value?.responseStyle === 'string' ? value.responseStyle : 'Concise',
  };
}

function sanitizeConfirmedFields(value: any): ConfirmedFields {
  const confirmed: ConfirmedFields = {};

  confirmationRequiredFields.forEach((field) => {
    if (value?.[field] === true) {
      confirmed[field] = true;
    }
  });

  return confirmed;
}

function readStoredProfile(): StoredProfile {
  try {
    const raw = localStorage.getItem(PROFILE_USER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      email: typeof parsed?.email === 'string' ? parsed.email : '',
      uid: typeof parsed?.uid === 'string' ? parsed.uid : '',
    };
  } catch {
    return {};
  }
}

function readProfileDetails(): ProfileDetails {
  try {
    const raw = localStorage.getItem(PROFILE_DETAILS_KEY);
    if (!raw) return { ...defaultDetails };
    const parsed = JSON.parse(raw);
    return sanitizeProfileDetails(parsed);
  } catch {
    return { ...defaultDetails };
  }
}

function readConfirmedFields(): ConfirmedFields {
  try {
    const raw = localStorage.getItem(PROFILE_CONFIRMED_FIELDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return sanitizeConfirmedFields(parsed);
  } catch {
    return {};
  }
}

function getInitials(name: string, fallback: string): string {
  const cleanName = (name || '').trim();
  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U';
  }
  const cleanFallback = (fallback || '').trim();
  return cleanFallback ? cleanFallback[0].toUpperCase() : 'U';
}

function profileCompletion(details: ProfileDetails, confirmedFields: ConfirmedFields): number {
  const confirmedCount = confirmationRequiredFields.filter((field) => {
    const value = String(details[field] || '').trim();
    return !!confirmedFields[field] && value.length > 0;
  }).length;

  const textareaCount = autoCompletionFields.filter((field) => {
    const value = String(details[field] || '').trim();
    return value.length > 0;
  }).length;

  const totalFields = confirmationRequiredFields.length + autoCompletionFields.length;
  return Math.round(((confirmedCount + textareaCount) / totalFields) * 100);
}

function mapFirestoreSyncError(error: unknown, fallbackMessage: string): string {
  const code = String((error as { code?: string } | null)?.code || '').toLowerCase();
  if (code.includes('failed-precondition')) {
    return 'Firestore is not enabled yet for this project. Create Firestore Database in Firebase Console.';
  }
  if (code.includes('permission-denied')) {
    return 'Cloud sync is blocked by Firestore rules. Allow this user to read/write their own profile.';
  }
  if (code.includes('unavailable')) {
    return 'Cloud sync temporarily unavailable. Changes are saved on this device.';
  }
  return fallbackMessage;
}

function mapPasswordUpdateError(error: unknown): string {
  const code = String((error as { code?: string } | null)?.code || '').toLowerCase();
  if (code.includes('invalid-credential') || code.includes('wrong-password')) {
    return 'Current password is incorrect.';
  }
  if (code.includes('weak-password')) {
    return 'New password is too weak. Use at least 6 characters.';
  }
  if (code.includes('too-many-requests')) {
    return 'Too many attempts. Please wait and try again.';
  }
  if (code.includes('network-request-failed')) {
    return 'Network error while updating password. Check connection and retry.';
  }
  if (code.includes('requires-recent-login')) {
    return 'Session expired for security. Sign in again and retry.';
  }
  return 'Unable to update password right now. Please try again.';
}

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

export default function ProfilePage() {
  const editedFieldsRef = useRef<Set<ProfileField>>(new Set());
  const initialProfile = useMemo(() => {
    if (typeof window === 'undefined') return { email: '', uid: '' };
    return readStoredProfile();
  }, []);

  const initialDetails = useMemo(() => {
    if (typeof window === 'undefined') return { ...defaultDetails };
    return readProfileDetails();
  }, []);

  const initialConfirmed = useMemo(() => {
    if (typeof window === 'undefined') return {};
    return readConfirmedFields();
  }, []);

  const [status, setStatus] = useState<ProfileState>('loading');
  const [email, setEmail] = useState(initialProfile.email || '');
  const [uid, setUid] = useState(initialProfile.uid || '');
  const [details, setDetails] = useState<ProfileDetails>(initialDetails);
  const [confirmedFields, setConfirmedFields] = useState<ConfirmedFields>(initialConfirmed);
  const [activeField, setActiveField] = useState<ProfileField | null>(null);
  const [busy, setBusy] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStatusMessage, setPasswordStatusMessage] = useState('');
  const [passwordStatusType, setPasswordStatusType] = useState<'success' | 'error' | ''>('');
  const [isRemoteLoaded, setIsRemoteLoaded] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState('');
  const passwordsMatch =
    newPasswordInput.length > 0 &&
    confirmPasswordInput.length > 0 &&
    newPasswordInput === confirmPasswordInput;
  const passwordsMismatch =
    confirmPasswordInput.length > 0 &&
    newPasswordInput !== confirmPasswordInput;
  const canSubmitPasswordChange =
    !passwordBusy &&
    !busy &&
    currentPasswordInput.length > 0 &&
    newPasswordInput.length >= 6 &&
    confirmPasswordInput.length > 0 &&
    newPasswordInput === confirmPasswordInput;

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        setAuthUser(user);
        void trackAnalyticsEvent('profile_auth_state', { state: 'authenticated' });
        setStatus('loading');
        setEmail(user.email || 'No email available');
        setUid(user.uid || '');
        setCloudSyncError('');
        try {
          localStorage.setItem(
            PROFILE_USER_KEY,
            JSON.stringify({
              email: user.email || '',
              uid: user.uid || '',
            })
          );
        } catch {
          // Ignore storage failures silently.
        }
        const loadRemoteProfile = async () => {
          try {
            const primaryProfileRef = doc(
              db,
              'artifacts',
              PROFILE_ARTIFACT_APP_ID,
              'users',
              user.uid,
              'profile',
              PROFILE_DOC_ID
            );
            const legacyProfileRef = doc(db, 'profiles', user.uid);
            let snapshot = await getDoc(primaryProfileRef);
            if (!snapshot.exists()) {
              snapshot = await getDoc(legacyProfileRef);
            }
            if (!isMounted) return;
            if (snapshot.exists()) {
              const data = snapshot.data();
              const nextDetails = sanitizeProfileDetails(data?.details);
              const nextConfirmed = sanitizeConfirmedFields(data?.confirmedFields);
              setDetails(nextDetails);
              setConfirmedFields(nextConfirmed);
              try {
                localStorage.setItem(PROFILE_DETAILS_KEY, JSON.stringify(nextDetails));
                localStorage.setItem(PROFILE_CONFIRMED_FIELDS_KEY, JSON.stringify(nextConfirmed));
              } catch {
                // Ignore storage failures silently.
              }
            }
          } catch (error) {
            if (isMounted) {
              console.error('Failed to load profile from Firestore:', error);
              setCloudSyncError(
                mapFirestoreSyncError(error, 'Cloud sync unavailable right now. Using local profile data.')
              );
            }
          } finally {
            if (isMounted) {
              setIsRemoteLoaded(true);
              setStatus('ready');
            }
          }
        };
        void loadRemoteProfile();
      } else {
        setAuthUser(null);
        setCurrentPasswordInput('');
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        setPasswordStatusMessage('');
        setPasswordStatusType('');
        void trackAnalyticsEvent('profile_auth_state', { state: 'guest' });
        setStatus('guest');
        setIsRemoteLoaded(false);
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_DETAILS_KEY, JSON.stringify(details));
      localStorage.setItem(PROFILE_CONFIRMED_FIELDS_KEY, JSON.stringify(confirmedFields));
    } catch {
      // Ignore storage failures silently.
    }
  }, [details, confirmedFields]);

  useEffect(() => {
    if (status !== 'ready' || !uid || !isRemoteLoaded) return;

    const timeout = window.setTimeout(() => {
      const syncProfile = async () => {
        try {
          const profileRef = doc(
            db,
            'artifacts',
            PROFILE_ARTIFACT_APP_ID,
            'users',
            uid,
            'profile',
            PROFILE_DOC_ID
          );
          await setDoc(
            profileRef,
            {
              email,
              details,
              confirmedFields,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          setCloudSyncError('');
        } catch (error) {
          console.error('Failed to save profile to Firestore:', error);
          setCloudSyncError(
            mapFirestoreSyncError(error, 'Cloud sync unavailable right now. Changes are saved on this device.')
          );
        }
      };

      void syncProfile();
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [status, uid, isRemoteLoaded, email, details, confirmedFields]);

  const completion = useMemo(() => profileCompletion(details, confirmedFields), [details, confirmedFields]);
  const initials = useMemo(() => getInitials(details.displayName, email), [details.displayName, email]);

  const isFieldFilled = (field: ProfileField) => String(details[field] || '').trim().length > 0;
  const isFieldConfirmed = (field: ProfileField) => !!confirmedFields[field];

  const handleDetailChange = (field: ProfileField, value: string) => {
    if (!editedFieldsRef.current.has(field)) {
      editedFieldsRef.current.add(field);
      void trackAnalyticsEvent('profile_field_edited', { field_name: field });
    }
    setDetails((prev) => ({ ...prev, [field]: value }));
    setConfirmedFields((prev) => {
      if (!prev[field]) return prev;
      return { ...prev, [field]: false };
    });
  };

  const handleFieldFocus = (field: ProfileField) => {
    setActiveField(field);
    void trackAnalyticsEvent('profile_field_focus', { field_name: field });
  };

  const handleConfirmField = (field: ProfileField) => {
    if (!isFieldFilled(field)) return;
    void trackAnalyticsEvent('profile_field_confirmed', { field_name: field });
    setConfirmedFields((prev) => ({ ...prev, [field]: true }));
    setActiveField(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleBackToChat = () => {
    void trackAnalyticsEvent('profile_back_to_chat');
    window.location.assign('/');
  };

  const handleSignOut = async () => {
    try {
      setBusy(true);
      void trackAnalyticsEvent('profile_sign_out_requested');
      await signOut(auth);
      void trackAnalyticsEvent('profile_sign_out_success');
      try {
        localStorage.removeItem(PROFILE_USER_KEY);
      } catch {
        // Ignore storage failures silently.
      }
      window.location.assign('/');
    } catch (error) {
      void trackAnalyticsEvent('profile_sign_out_failed', {
        error_code: String((error as { code?: string } | null)?.code || 'unknown'),
      });
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordStatusMessage('');
    setPasswordStatusType('');

    if (!authUser || authUser.isAnonymous) {
      setPasswordStatusMessage('No signed-in account is available for password update.');
      setPasswordStatusType('error');
      return;
    }

    if (!authUser.email) {
      setPasswordStatusMessage('This account has no email/password sign-in method enabled.');
      setPasswordStatusType('error');
      return;
    }

    if (!currentPasswordInput) {
      setPasswordStatusMessage('Current password is required.');
      setPasswordStatusType('error');
      return;
    }

    if (newPasswordInput.length < 6) {
      setPasswordStatusMessage('New password must be at least 6 characters.');
      setPasswordStatusType('error');
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordStatusMessage('New password and confirm password do not match.');
      setPasswordStatusType('error');
      return;
    }

    try {
      setPasswordBusy(true);
      setPasswordStatusMessage('Updating password...');
      setPasswordStatusType('');
      void trackAnalyticsEvent('profile_password_change_requested');

      const credential = EmailAuthProvider.credential(authUser.email, currentPasswordInput);
      await reauthenticateWithCredential(authUser, credential);
      await updatePassword(authUser, newPasswordInput);

      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setPasswordStatusMessage('Password updated successfully.');
      setPasswordStatusType('success');
      void trackAnalyticsEvent('profile_password_change_success');
    } catch (error) {
      setPasswordStatusMessage(mapPasswordUpdateError(error));
      setPasswordStatusType('error');
      void trackAnalyticsEvent('profile_password_change_failed', {
        error_code: String((error as { code?: string } | null)?.code || 'unknown'),
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const renderConfirmButton = (field: ProfileField) => {
    const confirmed = isFieldConfirmed(field);
    const canConfirm = isFieldFilled(field);
    const visible = activeField === field;

    return (
      <button
        type="button"
        aria-label={`Confirm ${field}`}
        title={canConfirm ? 'Confirm field' : 'Enter value first'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleConfirmField(field)}
        disabled={!canConfirm}
        className={`absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-200 ${
          visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        } ${
          confirmed
            ? 'border-[#9a7a38] bg-[#2a1d09] text-[#f3d07a] shadow-[0_0_8px_rgba(184,134,11,0.45)]'
            : canConfirm
              ? 'border-[#6d5421] bg-[#120d05] text-[#d7b268] hover:border-[#9a7a38] hover:text-[#f3d07a]'
              : 'border-[#3a311f] bg-[#0f0c07] text-[#5f5646]'
        }`}
      >
        {'\u2713'}
      </button>
    );
  };

  return (
    <div className="profile-page-root min-h-screen bg-[#020101] text-[#EAEAEA] overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#9b8b67]">Ephemeral System</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-wide md:text-4xl">User Profile</h1>
            <p className="mt-1 text-sm text-[#b3b3b3]">Manage your account details and personal setup.</p>
          </div>
          <button
            type="button"
            onClick={handleBackToChat}
            className="rounded-lg border border-[#7f5f24] bg-[#1b1306] px-4 py-2 text-sm text-[#f0e1c3] hover:bg-[#2a1d09]"
          >
            Back To Chat
          </button>
        </div>

        {status === 'loading' && (
          <div className="rounded-xl border border-[#3f3320] bg-[#0f0c07] p-5 text-sm text-[#c5c5c5]">Loading profile...</div>
        )}

        {status === 'guest' && (
          <div className="rounded-xl border border-[#5f2e2e] bg-[#1a0d0d] p-5">
            <p className="text-sm text-[#efc7c7]">No signed-in account found. Use `/auth` in chat to sign in first.</p>
          </div>
        )}

        {status === 'ready' && (
          <>
            {cloudSyncError && (
              <div className="mb-4 rounded-xl border border-[#5f2e2e] bg-[#1a0d0d] p-4 text-sm text-[#efc7c7]">
                {cloudSyncError}
              </div>
            )}
            <div className="profile-ready-grid grid gap-5 lg:grid-cols-12">
            <div className="profile-left-stick space-y-5 lg:col-span-4">
              <div className="rounded-2xl border border-[#7f5f24] bg-[#090703] p-5 shadow-[0_0_35px_rgba(184,134,11,0.12)]">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#9a7a38] bg-[#1b1306] text-xl font-semibold text-[#f2dfba]">
                      {initials}
                    </div>
                    <div>
                      <p className="text-lg font-medium text-[#f2f2f2]">{details.displayName || 'Unnamed User'}</p>
                      <p className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">{details.role || 'No role set'}</p>
                    </div>
                  </div>
                  <div className="rounded-md border border-[#4b3a18] bg-[#100b04] px-3 py-2 text-right">
                    <p className="text-base font-semibold leading-none text-[#f0e0bf]">{completion}%</p>
                    <p className="mt-1 text-[0.6rem] uppercase tracking-[0.14em] text-[#9f9f9f]">Complete</p>
                  </div>
                </div>

                <div className="relative mb-4 h-2 w-full overflow-hidden rounded-full border border-[#2f2412] bg-[#17110a]">
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.05),rgba(255,255,255,0))]" />
                  <div
                    className="relative h-full rounded-full bg-[linear-gradient(90deg,#b8860b_0%,#e0b749_55%,#b8860b_100%)] shadow-[0_0_14px_rgba(184,134,11,0.55)] transition-all duration-700"
                    style={{ width: `${completion}%` }}
                  >
                    {completion > 0 && (
                      <span className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/3 rounded-full bg-[#f3d07a] shadow-[0_0_10px_rgba(243,208,122,0.95)]" />
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Email</p>
                    <p className="break-all text-sm text-[#e6e6e6]">{email}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">User ID</p>
                    <p className="break-all text-xs text-[#cfcfcf]">{uid || 'Unavailable'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#3f3320] bg-[#0f0c07] p-5 space-y-3">
                <p className="text-xs uppercase tracking-[0.14em] text-[#9f9f9f]">Security</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSignOut}
                  className="w-full rounded-lg border border-[#5f2e2e] bg-[#271010] px-4 py-2 text-sm text-[#f1c3c3] hover:bg-[#3a1515] disabled:opacity-60"
                >
                  {busy ? 'Signing Out...' : 'Sign Out'}
                </button>
              </div>
            </div>

            <div className="profile-right-scroll space-y-5 lg:col-span-8">
              <div className="rounded-2xl border border-[#3f3320] bg-[#090703] p-5 md:p-6">
                <h2 className="text-lg font-medium text-[#f2f2f2]">About You</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Display Name</label>
                    <div className="relative mt-1">
                      <input
                        value={details.displayName}
                        onChange={(e) => handleDetailChange('displayName', e.target.value)}
                        onFocus={() => handleFieldFocus('displayName')}
                        onBlur={() => setActiveField((prev) => (prev === 'displayName' ? null : prev))}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-11 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                        placeholder="How should we call you?"
                      />
                      {renderConfirmButton('displayName')}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Role</label>
                    <div className="relative mt-1">
                      <input
                        value={details.role}
                        onChange={(e) => handleDetailChange('role', e.target.value)}
                        onFocus={() => handleFieldFocus('role')}
                        onBlur={() => setActiveField((prev) => (prev === 'role' ? null : prev))}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-11 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                        placeholder="Student, founder, engineer..."
                      />
                      {renderConfirmButton('role')}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Bio</label>
                    <div className="relative mt-1">
                      <textarea
                        value={details.bio}
                        onChange={(e) => handleDetailChange('bio', e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-3 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                        placeholder="Tell a little about yourself..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#3f3320] bg-[#090703] p-5 md:p-6">
                <h2 className="text-lg font-medium text-[#f2f2f2]">Contact And Links</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Location</label>
                    <div className="relative mt-1">
                      <input
                        value={details.location}
                        onChange={(e) => handleDetailChange('location', e.target.value)}
                        onFocus={() => handleFieldFocus('location')}
                        onBlur={() => setActiveField((prev) => (prev === 'location' ? null : prev))}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-11 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                        placeholder="City, Country"
                      />
                      {renderConfirmButton('location')}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Timezone</label>
                    <div className="relative mt-1">
                      <input
                        value={details.timezone}
                        onChange={(e) => handleDetailChange('timezone', e.target.value)}
                        onFocus={() => handleFieldFocus('timezone')}
                        onBlur={() => setActiveField((prev) => (prev === 'timezone' ? null : prev))}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-11 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                        placeholder="UTC+05:30"
                      />
                      {renderConfirmButton('timezone')}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Website</label>
                    <div className="relative mt-1">
                      <input
                        value={details.website}
                        onChange={(e) => handleDetailChange('website', e.target.value)}
                        onFocus={() => handleFieldFocus('website')}
                        onBlur={() => setActiveField((prev) => (prev === 'website' ? null : prev))}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-11 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                        placeholder="https://..."
                      />
                      {renderConfirmButton('website')}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">GitHub</label>
                    <div className="relative mt-1">
                      <input
                        value={details.github}
                        onChange={(e) => handleDetailChange('github', e.target.value)}
                        onFocus={() => handleFieldFocus('github')}
                        onBlur={() => setActiveField((prev) => (prev === 'github' ? null : prev))}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-11 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                        placeholder="github.com/username"
                      />
                      {renderConfirmButton('github')}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#3f3320] bg-[#090703] p-5 md:p-6">
                <h2 className="text-lg font-medium text-[#f2f2f2]">AI Preferences</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Primary Goal</label>
                    <div className="relative mt-1">
                      <input
                        value={details.primaryGoal}
                        onChange={(e) => handleDetailChange('primaryGoal', e.target.value)}
                        onFocus={() => handleFieldFocus('primaryGoal')}
                        onBlur={() => setActiveField((prev) => (prev === 'primaryGoal' ? null : prev))}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-11 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                        placeholder="What should the AI help with most?"
                      />
                      {renderConfirmButton('primaryGoal')}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Response Style</label>
                    <div className="relative mt-1">
                      <select
                        value={details.responseStyle}
                        onChange={(e) => handleDetailChange('responseStyle', e.target.value)}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-3 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                      >
                        <option value="Concise">Concise</option>
                        <option value="Balanced">Balanced</option>
                        <option value="Detailed">Detailed</option>
                      </select>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Interests</label>
                    <div className="relative mt-1">
                      <textarea
                        value={details.interests}
                        onChange={(e) => handleDetailChange('interests', e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-3 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                        placeholder="AI, coding, startups, design..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#3f3320] bg-[#090703] p-5 md:p-6">
                <h2 className="text-lg font-medium text-[#f2f2f2]">Reset Password</h2>
                <p className="mt-1 text-sm text-[#b3b3b3]">
                  Re-authenticate with your current password, then set a new one.
                </p>

                <form id="profile-change-password-form" className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handlePasswordChange}>
                  <div className="md:col-span-2">
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]" htmlFor="profile-current-password">
                      Current Password
                    </label>
                    <div className="relative mt-1">
                      <input
                        id="profile-current-password"
                        type={showCurrentPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={currentPasswordInput}
                        onChange={(e) => setCurrentPasswordInput(e.target.value)}
                        className="w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 pr-12 text-sm text-[#ececec] outline-none transition-colors focus:border-[#9a7a38]"
                      />
                      <VisibilityToggleButton
                        shown={showCurrentPassword}
                        onToggle={() => setShowCurrentPassword((prev) => !prev)}
                        label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]" htmlFor="profile-new-password">
                      New Password
                    </label>
                    <div className="relative mt-1">
                      <input
                        id="profile-new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={newPasswordInput}
                        onChange={(e) => setNewPasswordInput(e.target.value)}
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
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]" htmlFor="profile-confirm-password">
                      Confirm New Password
                    </label>
                    <div className="relative mt-1">
                      <input
                        id="profile-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPasswordInput}
                        onChange={(e) => setConfirmPasswordInput(e.target.value)}
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
                    disabled={!canSubmitPasswordChange}
                    className="md:col-span-2 w-full rounded-lg border border-[#7f5f24] bg-[#1b1306] px-4 py-2 text-sm text-[#f0e1c3] hover:bg-[#2a1d09] disabled:opacity-60"
                  >
                    {passwordBusy ? 'Updating Password...' : 'Update Password'}
                  </button>
                </form>

                {passwordStatusMessage && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                      passwordStatusType === 'success'
                        ? 'border-[#5d4a1e] bg-[#1c1508] text-[#ecd7a2]'
                        : 'border-[#5f2e2e] bg-[#1a0d0d] text-[#efc7c7]'
                    }`}
                  >
                    {passwordStatusMessage}
                  </div>
                )}

                <p className="mt-3 text-xs text-[#8f8f8f]">
                  Forgot current password? Use <span className="text-[#d1b16f]">Forgot password?</span> in the auth card.
                </p>
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}




