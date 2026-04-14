import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase-config';

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

const PROFILE_USER_KEY = 'ephemeral_profile_user';
const PROFILE_DETAILS_KEY = 'ephemeral_profile_details';

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
    return {
      displayName: typeof parsed?.displayName === 'string' ? parsed.displayName : '',
      role: typeof parsed?.role === 'string' ? parsed.role : '',
      bio: typeof parsed?.bio === 'string' ? parsed.bio : '',
      location: typeof parsed?.location === 'string' ? parsed.location : '',
      timezone: typeof parsed?.timezone === 'string' ? parsed.timezone : '',
      website: typeof parsed?.website === 'string' ? parsed.website : '',
      github: typeof parsed?.github === 'string' ? parsed.github : '',
      interests: typeof parsed?.interests === 'string' ? parsed.interests : '',
      primaryGoal: typeof parsed?.primaryGoal === 'string' ? parsed.primaryGoal : '',
      responseStyle: typeof parsed?.responseStyle === 'string' ? parsed.responseStyle : 'Concise',
    };
  } catch {
    return { ...defaultDetails };
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

function profileCompletion(details: ProfileDetails): number {
  const fields = [
    details.displayName,
    details.role,
    details.bio,
    details.location,
    details.timezone,
    details.website,
    details.github,
    details.interests,
    details.primaryGoal,
    details.responseStyle,
  ];
  const filled = fields.filter((value) => String(value || '').trim().length > 0).length;
  return Math.round((filled / fields.length) * 100);
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

  const [status, setStatus] = useState<ProfileState>('loading');
  const [email, setEmail] = useState(initialProfile.email || '');
  const [uid, setUid] = useState(initialProfile.uid || '');
  const [details, setDetails] = useState<ProfileDetails>(initialDetails);
  const [busy, setBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        setStatus('ready');
        setEmail(user.email || 'No email available');
        setUid(user.uid || '');
        try {
          localStorage.setItem(PROFILE_USER_KEY, JSON.stringify({
            email: user.email || '',
            uid: user.uid || '',
          }));
        } catch {
          // Ignore storage failures silently.
        }
      } else {
        setStatus('guest');
      }
    });

    return () => unsubscribe();
  }, []);

  const completion = useMemo(() => profileCompletion(details), [details]);
  const initials = useMemo(() => getInitials(details.displayName, email), [details.displayName, email]);

  const handleDetailChange = (field: keyof ProfileDetails, value: string) => {
    setDetails((prev) => ({ ...prev, [field]: value }));
    setSaveMessage('');
  };

  const handleSaveProfile = () => {
    try {
      localStorage.setItem(PROFILE_DETAILS_KEY, JSON.stringify(details));
      setSaveMessage('Profile saved locally.');
    } catch {
      setSaveMessage('Could not save profile in this browser.');
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

  return (
    <div className="min-h-screen bg-[#020101] text-[#EAEAEA] overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#9b8b67]">Ephemeral System</p>
            <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-wide">User Profile</h1>
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
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="lg:col-span-4 space-y-5">
              <div className="rounded-2xl border border-[#7f5f24] bg-[#090703] p-5 shadow-[0_0_35px_rgba(184,134,11,0.12)]">
                <div className="mb-4 flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full border border-[#9a7a38] bg-[#1b1306] flex items-center justify-center text-xl font-semibold text-[#f2dfba]">
                    {initials}
                  </div>
                  <div>
                    <p className="text-lg font-medium text-[#f2f2f2]">{details.displayName || 'Unnamed User'}</p>
                    <p className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">{details.role || 'No role set'}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Email</p>
                    <p className="text-sm text-[#e6e6e6] break-all">{email}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">User ID</p>
                    <p className="text-xs text-[#cfcfcf] break-all">{uid || 'Unavailable'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#3f3320] bg-[#0f0c07] p-5">
                <p className="text-xs uppercase tracking-[0.14em] text-[#9f9f9f]">Profile Completion</p>
                <p className="mt-2 text-3xl font-semibold text-[#f0e0bf]">{completion}%</p>
                <div className="mt-3 h-2 w-full rounded-full bg-[#1c1710]">
                  <div
                    className="h-2 rounded-full bg-[#b8860b] transition-all"
                    style={{ width: `${completion}%` }}
                  />
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

            <div className="lg:col-span-8 space-y-5">
              <div className="rounded-2xl border border-[#3f3320] bg-[#090703] p-5 md:p-6">
                <h2 className="text-lg font-medium text-[#f2f2f2]">About You</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Display Name</label>
                    <input
                      value={details.displayName}
                      onChange={(e) => handleDetailChange('displayName', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                      placeholder="How should we call you?"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Role</label>
                    <input
                      value={details.role}
                      onChange={(e) => handleDetailChange('role', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                      placeholder="Student, founder, engineer..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Bio</label>
                    <textarea
                      value={details.bio}
                      onChange={(e) => handleDetailChange('bio', e.target.value)}
                      rows={4}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                      placeholder="Tell a little about yourself..."
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#3f3320] bg-[#090703] p-5 md:p-6">
                <h2 className="text-lg font-medium text-[#f2f2f2]">Contact And Links</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Location</label>
                    <input
                      value={details.location}
                      onChange={(e) => handleDetailChange('location', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                      placeholder="City, Country"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Timezone</label>
                    <input
                      value={details.timezone}
                      onChange={(e) => handleDetailChange('timezone', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                      placeholder="UTC+05:30"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Website</label>
                    <input
                      value={details.website}
                      onChange={(e) => handleDetailChange('website', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">GitHub</label>
                    <input
                      value={details.github}
                      onChange={(e) => handleDetailChange('github', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                      placeholder="github.com/username"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#3f3320] bg-[#090703] p-5 md:p-6">
                <h2 className="text-lg font-medium text-[#f2f2f2]">AI Preferences</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Primary Goal</label>
                    <input
                      value={details.primaryGoal}
                      onChange={(e) => handleDetailChange('primaryGoal', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                      placeholder="What should the AI help with most?"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Response Style</label>
                    <select
                      value={details.responseStyle}
                      onChange={(e) => handleDetailChange('responseStyle', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                    >
                      <option value="Concise">Concise</option>
                      <option value="Balanced">Balanced</option>
                      <option value="Detailed">Detailed</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs uppercase tracking-[0.12em] text-[#8f8f8f]">Interests</label>
                    <textarea
                      value={details.interests}
                      onChange={(e) => handleDetailChange('interests', e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-[#3f3320] bg-[#0f0c07] px-3 py-2 text-sm text-[#ececec] outline-none focus:border-[#9a7a38]"
                      placeholder="AI, coding, startups, design..."
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="rounded-lg border border-[#7f5f24] bg-[#1b1306] px-4 py-2 text-sm text-[#f0e1c3] hover:bg-[#2a1d09]"
                  >
                    Save Profile
                  </button>
                  {saveMessage && <p className="text-sm text-[#d2c094]">{saveMessage}</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}