import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase-config';

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

export default function ProfilePage() {
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
  const [isRemoteLoaded, setIsRemoteLoaded] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState('');

  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
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
            const profileRef = doc(db, 'profiles', user.uid);
            const snapshot = await getDoc(profileRef);
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
              setCloudSyncError('Cloud sync unavailable right now. Using local profile data.');
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
          await setDoc(
            doc(db, 'profiles', uid),
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
          setCloudSyncError('Cloud sync unavailable right now. Changes are saved on this device.');
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
    setDetails((prev) => ({ ...prev, [field]: value }));
    setConfirmedFields((prev) => {
      if (!prev[field]) return prev;
      return { ...prev, [field]: false };
    });
  };

  const handleConfirmField = (field: ProfileField) => {
    if (!isFieldFilled(field)) return;
    setConfirmedFields((prev) => ({ ...prev, [field]: true }));
    setActiveField(null);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleSignOut = async () => {
    try {
      setBusy(true);
      await signOut(auth);
      try {
        localStorage.removeItem(PROFILE_USER_KEY);
      } catch {
        // Ignore storage failures silently.
      }
      window.location.assign('/');
    } finally {
      setBusy(false);
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
        ✓
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
            onClick={() => window.location.assign('/')}
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
                        onFocus={() => setActiveField('displayName')}
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
                        onFocus={() => setActiveField('role')}
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
                        onFocus={() => setActiveField('location')}
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
                        onFocus={() => setActiveField('timezone')}
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
                        onFocus={() => setActiveField('website')}
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
                        onFocus={() => setActiveField('github')}
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
                        onFocus={() => setActiveField('primaryGoal')}
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
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}




