import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics, isSupported, logEvent, type Analytics } from 'firebase/analytics';

const MAX_EVENT_NAME_LENGTH = 40;
const MAX_PARAM_KEY_LENGTH = 40;
const MAX_PARAM_VALUE_LENGTH = 120;
const MAX_ANALYTICS_PARAMS = 25;

const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'auth_key',
  'credential',
  'email',
  'phone',
  'uid',
  'user_id',
  'query',
  'prompt',
  'message',
  'content',
  'text',
  'input',
];

const SENSITIVE_VALUE_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/, // Google API key style tokens.
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, // JWT-like.
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // Email.
];

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "API_KEY_PLACEHOLDER",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "FIREBASE_AUTH_DOMAIN_PLACEHOLDER",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "FIREBASE_DATABASE_URL_PLACEHOLDER",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "FIREBASE_PROJECT_ID_PLACEHOLDER",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "FIREBASE_STORAGE_BUCKET_PLACEHOLDER",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "FIREBASE_APP_ID_PLACEHOLDER",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "FIREBASE_MEASUREMENT_ID_PLACEHOLDER"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

let analyticsPromise: Promise<Analytics | null> | null = null;

function normalizeToken(value: string, fallback: string, maxLength: number): string {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const finalValue = normalized || fallback;
  return finalValue.length > maxLength ? finalValue.slice(0, maxLength) : finalValue;
}

function sanitizeEventName(eventName: string): string {
  const normalized = normalizeToken(eventName, 'event_unknown', MAX_EVENT_NAME_LENGTH);
  if (/^[a-z]/.test(normalized)) return normalized;

  const prefixed = `evt_${normalized}`;
  return prefixed.length > MAX_EVENT_NAME_LENGTH
    ? prefixed.slice(0, MAX_EVENT_NAME_LENGTH)
    : prefixed;
}

function sanitizeParamKey(key: string): string {
  return normalizeToken(key, '', MAX_PARAM_KEY_LENGTH);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => key.includes(fragment));
}

function isSensitiveStringValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function sanitizeParamValue(value: unknown): string | number | boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const compact = value.replace(/\s+/g, ' ').trim();
    if (!compact) return null;
    if (isSensitiveStringValue(compact)) return '[redacted]';
    return compact.length > MAX_PARAM_VALUE_LENGTH
      ? compact.slice(0, MAX_PARAM_VALUE_LENGTH)
      : compact;
  }
  return null;
}

function sanitizeAnalyticsParams(params: Record<string, unknown>): Record<string, string | number | boolean> {
  const safeParams: Record<string, string | number | boolean> = {};
  let paramCount = 0;

  for (const [rawKey, rawValue] of Object.entries(params || {})) {
    if (paramCount >= MAX_ANALYTICS_PARAMS) break;

    const key = sanitizeParamKey(rawKey);
    if (!key || isSensitiveKey(key)) continue;

    const safeValue = sanitizeParamValue(rawValue);
    if (safeValue === null) continue;

    safeParams[key] = safeValue;
    paramCount += 1;
  }

  return safeParams;
}

function hasValidMeasurementId(): boolean {
  return Boolean(
    firebaseConfig.measurementId &&
    firebaseConfig.measurementId !== 'FIREBASE_MEASUREMENT_ID_PLACEHOLDER'
  );
}

export const getAnalyticsInstance = async (): Promise<Analytics | null> => {
  if (typeof window === 'undefined') return null;
  if (!hasValidMeasurementId()) return null;

  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      try {
        const supported = await isSupported();
        if (!supported) return null;
        return getAnalytics(app);
      } catch (error) {
        console.warn('Firebase Analytics unavailable:', error);
        return null;
      }
    })();
  }

  return analyticsPromise;
};

export const trackAnalyticsEvent = async (
  eventName: string,
  params: Record<string, unknown> = {}
): Promise<void> => {
  try {
    const analytics = await getAnalyticsInstance();
    if (!analytics) return;
    const safeEventName = sanitizeEventName(eventName);
    const safeParams = sanitizeAnalyticsParams(params);
    logEvent(analytics, safeEventName, safeParams);
  } catch (error) {
    console.warn('Analytics event logging failed:', error);
  }
};

export const initAuth = async (customToken?: string) => {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.warn('Auth persistence setup failed. Continuing with default persistence.', error);
  }

  if (auth.currentUser) return auth.currentUser;
  if (customToken) return signInWithCustomToken(auth, customToken);
  return signInAnonymously(auth);
};
