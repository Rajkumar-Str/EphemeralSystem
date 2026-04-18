import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, signOut, onAuthStateChanged, reload, GoogleAuthProvider, signInWithPopup, getAdditionalUserInfo } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { DEFAULT_MODEL_API_VERSION, GENERAL_CHAT_MODELS, WEB_GROUNDED_MODELS } from "./gemini-api";

export function initLegacyEngine() {
        
            const inputField = document.getElementById('user-input');
            const outputField = document.getElementById('ai-output');
            const webSnapshotBanner = document.getElementById('web-snapshot-banner');
            const groundingSourcesContainer = document.getElementById('grounding-sources');
            const statusText = document.getElementById('status-text');
            const memoryCanvas = document.getElementById('memory-canvas');
            const responseContainer = document.getElementById('response-container');
            const scrollIndicator = document.getElementById('scroll-indicator');
            const stack = document.getElementById('history-stack');
            
            const helpIndicator = document.getElementById('help-indicator');
            const chatsIndicator = document.getElementById('chats-indicator');
            
            const helpOverlay = document.getElementById('help-overlay');
            const toneOverlay = document.getElementById('tone-overlay');
            const chatsOverlay = document.getElementById('chats-overlay');
            const authOverlay = document.getElementById('auth-overlay');
            const authCard = authOverlay ? authOverlay.querySelector('.auth-card') : null;
            
            const toneList = document.getElementById('tone-list');
            const chatsList = document.getElementById('chats-list');
            const authSignInBtn = document.getElementById('auth-signin-btn');
            const authSignUpBtn = document.getElementById('auth-signup-btn');
            const authSubmitBtn = document.getElementById('auth-submit-btn');
            const authGoogleSignInBtn = document.getElementById('auth-google-signin-btn');
            const authForgotPasswordBtn = document.getElementById('auth-forgot-password-btn');
            const authSignOutBtn = document.getElementById('auth-signout-btn');
            const authOpenProfileBtn = document.getElementById('auth-open-profile-btn');
            const authContinueChatBtn = document.getElementById('auth-continue-chat-btn');
            const authLoggedOutView = document.getElementById('auth-loggedout-view');
            const authLoggedInView = document.getElementById('auth-loggedin-view');
            const authEmailInput = document.getElementById('auth-email-input');
            const authPasswordInput = document.getElementById('auth-password-input');
            const authStatusText = document.getElementById('auth-status-text');
            const authUserText = document.getElementById('auth-user-text');
            const authVerificationText = document.getElementById('auth-verification-text');
            const authResendVerificationBtn = document.getElementById('auth-resend-verification-btn');
            const authPasswordStrengthWrap = document.getElementById('auth-password-strength-wrap');
            const authPasswordStrengthLabel = document.getElementById('auth-password-strength-label');
            const authPasswordMeterFill = document.getElementById('auth-password-meter-fill');
            const authPasswordPolicyHints = document.getElementById('auth-password-policy-hints');
            const ambientCore = document.getElementById('ambient-core');
            const cinematicTooltip = document.getElementById('cinematic-tooltip');
            
            const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
            const apiKey = env.VITE_GEMINI_API_KEY || "API_KEY_PLACEHOLDER";
            const ENABLE_MAP_GROUNDING = false;
            const fallbackFirebaseConfig = {
                apiKey: env.VITE_FIREBASE_API_KEY || "API_KEY_PLACEHOLDER",
                authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "FIREBASE_AUTH_DOMAIN_PLACEHOLDER",
                databaseURL: env.VITE_FIREBASE_DATABASE_URL || "FIREBASE_DATABASE_URL_PLACEHOLDER",
                projectId: env.VITE_FIREBASE_PROJECT_ID || "FIREBASE_PROJECT_ID_PLACEHOLDER",
                storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "FIREBASE_STORAGE_BUCKET_PLACEHOLDER",
                messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER",
                appId: env.VITE_FIREBASE_APP_ID || "FIREBASE_APP_ID_PLACEHOLDER",
                measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "FIREBASE_MEASUREMENT_ID_PLACEHOLDER"
            };
            
            // --- State Variables ---
            let conversationHistory = [];
            let currentChatId = null; 
            
            let currentState = 'INPUT'; 
            let currentRenderToken = 0; 
            let isTyping = false;
            let decayTimeout;
            let coreTypingTimeout;
            let tooltipTimeout; // Tracks the hover delay
            const WEB_SNAPSHOT_TTL_MS = 12 * 60 * 60 * 1000;
            const WEB_SNAPSHOT_MAX_CHARS = 900;
            const WEB_SNAPSHOT_MAX_SOURCES = 3;
            const AUTH_RESET_COOLDOWN_STORAGE_KEY = 'ephemeral_auth_reset_cooldown_v1';
            const DUAL_REPLY_MODE_STORAGE_KEY = 'ephemeral_dual_reply_mode_v1';
            const COMMAND_MACROS_STORAGE_KEY = 'ephemeral_command_macros_v1';
            const AUTH_RESET_BASE_COOLDOWN_MS = 30 * 1000;
            const AUTH_RESET_MAX_COOLDOWN_MS = 5 * 60 * 1000;
            const AUTH_RESET_BACKOFF_RESET_MS = 15 * 60 * 1000;
            const AUTH_FORGOT_PASSWORD_BUTTON_DEFAULT_LABEL = 'Forgot password?';
            const ASSISTANT_IDENTITY_NAME = 'Ephemeral Core';
            const CHAT_REQUEST_TIMEOUT_MS = 18000;
            const CHAT_RETRY_DELAY_MS = 1200;
            const CHAT_MAX_TIMEOUT_RETRIES = 1;
            const CHAT_MAX_TRANSIENT_HTTP_RETRIES = 1;
            const DUAL_REPLY_MAX_QUICK_SENTENCES = 2;
            const COMMAND_MACRO_MAX_COUNT = 40;
            let webSnapshot = null;
            let lastWebQuery = '';
            let latestResponseMeta = {
                usedCachedSnapshot: false,
                snapshotAgeMinutes: 0,
                groundedSources: []
            };
            let pendingAuthIntent = null;
            let auth = null;
            let db = null;
            let appId = 'default-app-id';
            let chatsUnsubscribe = null;
            let authBusy = false;
            let authResetCooldownUntil = 0;
            let authResetAttemptCount = 0;
            let authResetLastAttemptAt = 0;
            let authResetCooldownInterval = null;
            let dualReplyModeEnabled = false;
            let commandMacros = {};

            function trackEvent(eventName, params = {}) {
                try {
                    const tracker = typeof window !== 'undefined' ? window.__trackAnalyticsEvent : null;
                    if (typeof tracker === 'function') {
                        void tracker(eventName, params);
                    }
                } catch (_) {
                    // Ignore analytics bridge failures.
                }
            }

            function getAuthState(userValue) {
                if (!userValue) return 'signed_out';
                return userValue.isAnonymous ? 'anonymous' : 'authenticated';
            }

            function getAuthErrorCode(error) {
                return String(error?.code || error?.name || 'unknown')
                    .toLowerCase()
                    .replace(/[^a-z0-9_./-]/g, '_');
            }

            function waitForDelay(ms) {
                return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
            }

            function readDualReplyModeState() {
                if (typeof window === 'undefined') return;
                try {
                    const raw = localStorage.getItem(DUAL_REPLY_MODE_STORAGE_KEY);
                    if (!raw) {
                        dualReplyModeEnabled = false;
                        return;
                    }
                    const parsed = JSON.parse(raw);
                    dualReplyModeEnabled = !!parsed?.enabled;
                } catch (_) {
                    dualReplyModeEnabled = false;
                }
            }

            function normalizeMacroName(rawName) {
                const normalized = String(rawName || '')
                    .trim()
                    .replace(/^\/+/, '')
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]/g, '');
                return normalized;
            }

            function sanitizeMacroText(rawValue, maxLength = 1000) {
                return String(rawValue || '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, Math.max(1, Number(maxLength) || 1));
            }

            function getReservedCommandNames() {
                return new Set([
                    'help',
                    'tone',
                    'chats',
                    'void',
                    'del',
                    'auth',
                    'profile',
                    'web',
                    'refreshweb',
                    'webstatus',
                    'webclear',
                    'dual',
                    'macro'
                ]);
            }

            function isReservedCommandName(nameValue) {
                return getReservedCommandNames().has(normalizeMacroName(nameValue));
            }

            function readCommandMacrosState() {
                if (typeof window === 'undefined') return;
                try {
                    const raw = localStorage.getItem(COMMAND_MACROS_STORAGE_KEY);
                    if (!raw) {
                        commandMacros = {};
                        return;
                    }
                    const parsed = JSON.parse(raw);
                    if (!parsed || typeof parsed !== 'object') {
                        commandMacros = {};
                        return;
                    }
                    const next = {};
                    for (const [rawName, rawValue] of Object.entries(parsed)) {
                        const name = normalizeMacroName(rawName);
                        if (!name || isReservedCommandName(name)) continue;
                        if (!rawValue || typeof rawValue !== 'object') continue;
                        const prompt = sanitizeMacroText(rawValue.prompt, 1200);
                        const tone = sanitizeMacroText(rawValue.tone, 300);
                        const format = sanitizeMacroText(rawValue.format, 300);
                        if (!prompt) continue;
                        next[name] = {
                            prompt,
                            tone,
                            format,
                            updatedAt: Number(rawValue.updatedAt || Date.now())
                        };
                        if (Object.keys(next).length >= COMMAND_MACRO_MAX_COUNT) break;
                    }
                    commandMacros = next;
                } catch (_) {
                    commandMacros = {};
                }
            }

            function persistCommandMacrosState() {
                if (typeof window === 'undefined') return;
                try {
                    localStorage.setItem(COMMAND_MACROS_STORAGE_KEY, JSON.stringify(commandMacros));
                } catch (_) {
                    // Ignore storage write failures.
                }
            }

            function parseMacroAddPayload(rawPayload) {
                const payload = String(rawPayload || '').trim();
                const pieces = payload.split('||').map((part) => part.trim());
                if (pieces.length < 2) {
                    return {
                        ok: false,
                        error: 'Usage: /macro add <name> || <prompt> || <tone> || <format>'
                    };
                }
                const name = normalizeMacroName(pieces[0]);
                if (!name || name.length < 2) {
                    return {
                        ok: false,
                        error: 'Macro name must be at least 2 characters and use letters, numbers, _ or -.'
                    };
                }
                if (isReservedCommandName(name)) {
                    return {
                        ok: false,
                        error: `/${name} is reserved. Pick another macro name.`
                    };
                }
                const prompt = sanitizeMacroText(pieces[1], 1200);
                if (!prompt) {
                    return {
                        ok: false,
                        error: 'Macro prompt is required.'
                    };
                }
                const tone = sanitizeMacroText(pieces[2] || '', 300);
                const format = sanitizeMacroText(pieces[3] || '', 300);
                return {
                    ok: true,
                    macro: {
                        name,
                        prompt,
                        tone,
                        format
                    }
                };
            }

            function formatMacroListText() {
                const names = Object.keys(commandMacros).sort();
                if (names.length === 0) {
                    return 'No command macros saved. Add one with /macro add <name> || <prompt> || <tone> || <format>';
                }
                const lines = names.map((name) => {
                    const macro = commandMacros[name];
                    const promptPreview = macro.prompt.length > 70 ? `${macro.prompt.slice(0, 70)}...` : macro.prompt;
                    const toneText = macro.tone || 'default';
                    const formatText = macro.format || 'default';
                    return `/${name} | tone: ${toneText} | format: ${formatText} | prompt: ${promptPreview}`;
                });
                return `Saved macros (${names.length}/${COMMAND_MACRO_MAX_COUNT}):\n${lines.join('\n')}`;
            }

            function formatMacroDetailsText(name) {
                const normalizedName = normalizeMacroName(name);
                const macro = commandMacros[normalizedName];
                if (!macro) {
                    return `Macro /${normalizedName || name} not found.`;
                }
                const toneText = macro.tone || 'default';
                const formatText = macro.format || 'default';
                return `Macro /${normalizedName}\nPrompt: ${macro.prompt}\nTone: ${toneText}\nFormat: ${formatText}`;
            }

            function buildMacroInstruction(macroName, macroConfig) {
                if (!macroName || !macroConfig) return '';
                const parts = [];
                parts.push(`Active command macro: /${macroName}.`);
                if (macroConfig.prompt) parts.push(`Macro objective: ${macroConfig.prompt}`);
                if (macroConfig.tone) parts.push(`Preferred tone: ${macroConfig.tone}`);
                if (macroConfig.format) parts.push(`Preferred output format: ${macroConfig.format}`);
                parts.push('Apply these macro preferences for this reply while staying factual and safe.');
                return parts.join(' ');
            }

            function persistDualReplyModeState() {
                if (typeof window === 'undefined') return;
                try {
                    localStorage.setItem(DUAL_REPLY_MODE_STORAGE_KEY, JSON.stringify({
                        enabled: dualReplyModeEnabled
                    }));
                } catch (_) {
                    // Ignore storage write failures.
                }
            }

            function setDualReplyMode(nextEnabled, source = 'command') {
                const normalized = !!nextEnabled;
                if (dualReplyModeEnabled === normalized) return false;
                dualReplyModeEnabled = normalized;
                persistDualReplyModeState();
                trackEvent('dual_reply_mode_changed', {
                    enabled: dualReplyModeEnabled,
                    source: String(source || 'unknown')
                });
                return true;
            }

            function formatDualReplyStatusText() {
                if (dualReplyModeEnabled) {
                    return 'Dual reply mode is ON. Every answer returns two lanes: Quick and Deep.';
                }
                return 'Dual reply mode is OFF. Answers return in the normal single-lane format.';
            }

            function takeLeadingSentences(rawText, maxSentences = DUAL_REPLY_MAX_QUICK_SENTENCES) {
                const normalized = String(rawText || '').replace(/\s+/g, ' ').trim();
                if (!normalized) return '';
                const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
                return sentences.slice(0, Math.max(1, Number(maxSentences) || 1)).join(' ').trim();
            }

            function normalizeDualReplyText(rawText, query) {
                const source = String(rawText || '').replace(/\r\n/g, '\n').trim();
                const safeFallback = buildSafeConversationalFallback(query);
                if (!source) {
                    return `Quick: ${safeFallback}\n\nDeep: ${safeFallback}`;
                }

                const quickMatch = source.match(/(?:^|\n)\s*quick\s*[:\-]\s*([\s\S]*?)(?=\n\s*deep\s*[:\-]|$)/i);
                const deepMatch = source.match(/(?:^|\n)\s*deep\s*[:\-]\s*([\s\S]*)$/i);

                let quick = quickMatch ? quickMatch[1].trim() : '';
                let deep = deepMatch ? deepMatch[1].trim() : '';

                if (!deep) {
                    deep = source
                        .replace(/(?:^|\n)\s*quick\s*[:\-]\s*/ig, '\n')
                        .replace(/(?:^|\n)\s*deep\s*[:\-]\s*/ig, '\n')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();
                }

                if (!quick) {
                    quick = takeLeadingSentences(deep || source, DUAL_REPLY_MAX_QUICK_SENTENCES) || safeFallback;
                }

                if (!deep) {
                    deep = source;
                }

                const quickLane = quick.replace(/\s+/g, ' ').trim();
                const deepLane = deep.replace(/\n{3,}/g, '\n\n').trim();

                if (!deepLane || deepLane.toLowerCase() === quickLane.toLowerCase()) {
                    return `Quick: ${quickLane}\n\nDeep: ${source}`;
                }

                return `Quick: ${quickLane}\n\nDeep: ${deepLane}`;
            }

            function normalizeModelConfig(modelValue) {
                const ensureModelPath = (value) => {
                    const normalized = String(value || '').trim().replace(/^\/+/, '').replace(/^models\//i, '');
                    return normalized ? `models/${normalized}` : '';
                };
                if (typeof modelValue === 'string') {
                    return {
                        id: ensureModelPath(modelValue),
                        apiVersion: DEFAULT_MODEL_API_VERSION
                    };
                }
                return {
                    id: ensureModelPath(modelValue?.id),
                    apiVersion: String(modelValue?.apiVersion || DEFAULT_MODEL_API_VERSION).trim() || DEFAULT_MODEL_API_VERSION
                };
            }

            function buildModelGenerateContentUrl(modelConfig) {
                const config = normalizeModelConfig(modelConfig);
                return `https://generativelanguage.googleapis.com/${config.apiVersion}/${config.id}:generateContent?key=${apiKey}`;
            }

            async function fetchWithTimeout(url, options = {}, timeoutMs = CHAT_REQUEST_TIMEOUT_MS) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || CHAT_REQUEST_TIMEOUT_MS));
                try {
                    const response = await fetch(url, {
                        ...options,
                        signal: controller.signal
                    });
                    return {
                        ok: true,
                        response
                    };
                } catch (error) {
                    const rawMessage = String(error?.name || error?.message || error || 'fetch_failed')
                        .toLowerCase();
                    const isTimeout =
                        error?.name === 'AbortError' ||
                        rawMessage.includes('aborted') ||
                        rawMessage.includes('timeout');
                    return {
                        ok: false,
                        reason: isTimeout ? 'request_timeout' : 'network_error',
                        error
                    };
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            // --- Persistent Storage (Firebase Initialization) ---
            let user = null;
            let archives = [];
            
            try {
                const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : fallbackFirebaseConfig;
                if (firebaseConfig) {
                    const app = initializeApp(firebaseConfig);
                    auth = getAuth(app);
                    db = getFirestore(app);
                    appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

                    const readInitialAuthState = () => new Promise((resolve) => {
                        const stop = onAuthStateChanged(auth, (initialUser) => {
                            stop();
                            resolve(initialUser);
                        }, () => {
                            resolve(null);
                        });
                    });

                    const initAuth = async () => {
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            await signInWithCustomToken(auth, __initial_auth_token);
                            return;
                        }

                        const restoredUser = await readInitialAuthState();
                        if (restoredUser) return;

                        try {
                            await signInAnonymously(auth);
                        } catch (anonymousAuthError) {
                            console.warn("Anonymous auth unavailable. Use /auth to continue.", anonymousAuthError);
                        }
                    };
                    initAuth().catch((initialAuthError) => console.warn("Initial auth failed:", initialAuthError));

                    onAuthStateChanged(auth, (u) => {
                        user = u;
                        trackEvent('auth_state_changed', {
                            auth_state: getAuthState(user)
                        });

                        if (chatsUnsubscribe) {
                            chatsUnsubscribe();
                            chatsUnsubscribe = null;
                        }

                        if (user) {
                            const chatsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'chats');
                            chatsUnsubscribe = onSnapshot(chatsRef, (snapshot) => {
                                archives = [];
                                snapshot.forEach(d => archives.push({ id: d.id, ...d.data() }));
                                archives.sort((a, b) => b.updatedAt - a.updatedAt);
                                buildChatsMenu();
                                trackEvent('chat_archive_synced', {
                                    archive_count: archives.length
                                });
                            }, (error) => console.error("Archive sync error:", error));
                        } else {
                            archives = [];
                            buildChatsMenu();
                        }

                        updateAuthSessionUI();
                    });
                    
                    window.saveToArchive = async function() {
                        if (!user || !db || !currentChatId || conversationHistory.length === 0) return;
                        let title = conversationHistory[0].parts[0].text.substring(0, 30);
                        if (conversationHistory[0].parts[0].text.length > 30) title += '...';
                        
                        const existing = archives.find(c => c.id === currentChatId);
                        if (existing && existing.title) title = existing.title;

                        const chatRef = doc(db, 'artifacts', appId, 'users', user.uid, 'chats', currentChatId);
                        const cleanHistory = JSON.parse(JSON.stringify(conversationHistory));

                        await setDoc(chatRef, {
                            title,
                            history: cleanHistory,
                            updatedAt: Date.now()
                        }, { merge: true });
                        trackEvent('chat_archive_saved', {
                            message_count: cleanHistory.length
                        });
                    };

                    window.deleteFromArchive = async function(id) {
                        if (!user || !db || !id) return;
                        const chatRef = doc(db, 'artifacts', appId, 'users', user.uid, 'chats', id);
                        await deleteDoc(chatRef);
                        trackEvent('chat_archive_deleted');
                    };
                }
            } catch(e) {
                console.error("Archive system disabled:", e);
                window.saveToArchive = async function() {}; // Safe fallback
                window.deleteFromArchive = async function() {};
            }

            // --- Menu Builders ---
            const personas = {
                system: { name: "SYSTEM", prompt: "You are a real, chill human hanging out in this chat. Do not ever refer to yourself as an AI, a system, or a language model. Talk naturally and casually like you're texting a friend. Keep your replies SHORT, punchy, and conversational (1-3 sentences max). Don't write long essays, real humans don't type that fast. Be genuine, relaxed, and keep it normal. NEVER use markdown formatting like asterisks or bold text." },
                terminal: { name: "TERMINAL", prompt: "You are the Terminal interface of the System. You communicate with machine-like precision, framing your responses somewhat like a system log or console output. However, you remain conversational, helpful, and easily understandable—do not use overly deep, dense, or broken technical jargon. Deliver information clearly and logically. NEVER use markdown formatting like asterisks or bold text." }
            };
            let currentPersonaId = 'system';

            function getActiveWebSnapshot() {
                if (!webSnapshot) return null;
                if ((Date.now() - webSnapshot.capturedAt) > WEB_SNAPSHOT_TTL_MS) {
                    webSnapshot = null;
                    return null;
                }
                return webSnapshot;
            }

            function extractGroundedSources(groundingMetadata) {
                const chunks = groundingMetadata?.groundingChunks || [];
                const seen = new Set();
                const sources = [];
                for (const chunk of chunks) {
                    const uri = chunk?.web?.uri;
                    if (!uri || seen.has(uri)) continue;
                    seen.add(uri);
                    sources.push({
                        title: chunk?.web?.title || uri,
                        uri
                    });
                    if (sources.length >= WEB_SNAPSHOT_MAX_SOURCES) break;
                }
                return sources;
            }

            function updateWebSnapshot(query, responseText, groundingMetadata) {
                const cleanSummary = (responseText || '').replace(/\s+/g, ' ').trim();
                const summary = cleanSummary.length > WEB_SNAPSHOT_MAX_CHARS
                    ? `${cleanSummary.substring(0, WEB_SNAPSHOT_MAX_CHARS)}...`
                    : cleanSummary;
                webSnapshot = {
                    query,
                    summary,
                    sources: extractGroundedSources(groundingMetadata),
                    capturedAt: Date.now()
                };
                lastWebQuery = query;
            }

            function buildWebSnapshotInstruction() {
                const activeSnapshot = getActiveWebSnapshot();
                if (!activeSnapshot) return '';
                const capturedAt = new Date(activeSnapshot.capturedAt).toLocaleString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric'
                });
                const sourcesText = activeSnapshot.sources.length
                    ? activeSnapshot.sources.map((source, index) => `${index + 1}. ${source.title} (${source.uri})`).join('\n')
                    : 'No source links captured in the previous grounding run.';
                return [
                    'You have a recent grounded web snapshot from this chat.',
                    `Snapshot query: ${activeSnapshot.query}`,
                    `Snapshot captured at: ${capturedAt}.`,
                    `Snapshot summary: ${activeSnapshot.summary}`,
                    `Snapshot sources:\n${sourcesText}`,
                    'Use this snapshot as supporting context for follow-up answers unless the user asks for a fresher web run.'
                ].join('\n');
            }

            function formatWebStatusText() {
                const activeSnapshot = getActiveWebSnapshot();
                if (!activeSnapshot) {
                    return "No active web snapshot. Use /web <question> to fetch live data.";
                }
                const ageMinutes = Math.max(1, Math.round((Date.now() - activeSnapshot.capturedAt) / 60000));
                const capturedAt = new Date(activeSnapshot.capturedAt).toLocaleString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric'
                });
                const sourcePreview = activeSnapshot.sources.length
                    ? activeSnapshot.sources.map((source, index) => `${index + 1}. ${source.title}`).join('\n')
                    : 'No source links captured.';
                return `Web snapshot active (${ageMinutes} min old).\nQuery: ${activeSnapshot.query}\nCaptured: ${capturedAt}\nSources:\n${sourcePreview}`;
            }

            function resetResponseMeta() {
                latestResponseMeta = {
                    usedCachedSnapshot: false,
                    snapshotAgeMinutes: 0,
                    groundedSources: []
                };
            }

            function clearResponseMetaUI() {
                if (webSnapshotBanner) {
                    webSnapshotBanner.textContent = '';
                    webSnapshotBanner.classList.remove('visible');
                }
                if (groundingSourcesContainer) {
                    groundingSourcesContainer.innerHTML = '';
                    groundingSourcesContainer.classList.remove('visible');
                }
            }

            function renderResponseMeta() {
                clearResponseMetaUI();

                if (latestResponseMeta.usedCachedSnapshot && webSnapshotBanner) {
                    webSnapshotBanner.textContent = `Using web snapshot (${latestResponseMeta.snapshotAgeMinutes} min old)`;
                    webSnapshotBanner.classList.add('visible');
                }

                if (latestResponseMeta.groundedSources.length > 0 && groundingSourcesContainer) {
                    latestResponseMeta.groundedSources.forEach((source, index) => {
                        const card = document.createElement('a');
                        card.className = 'grounding-source-card';
                        card.href = source.uri;
                        card.target = '_blank';
                        card.rel = 'noopener noreferrer';

                        const idx = document.createElement('span');
                        idx.className = 'source-index';
                        idx.textContent = String(index + 1);

                        const title = document.createElement('span');
                        title.className = 'source-title';
                        title.textContent = source.title || source.uri;

                        const host = document.createElement('span');
                        host.className = 'source-host';
                        try {
                            host.textContent = new URL(source.uri).hostname;
                        } catch (_) {
                            host.textContent = source.uri;
                        }

                        card.appendChild(idx);
                        card.appendChild(title);
                        card.appendChild(host);
                        groundingSourcesContainer.appendChild(card);
                    });

                    groundingSourcesContainer.classList.add('visible');
                }
            }

            
            async function showCommandResponse(text) {
                resetResponseMeta();
                clearResponseMetaUI();
                document.body.classList.add('state-reading');
                inputField.blur();
                await displayResponse(text, true);
            }

            function setAuthStatus(text = '', variant = '') {
                if (!authStatusText) return;
                authStatusText.textContent = text;
                authStatusText.classList.remove('success', 'error');
                if (variant) authStatusText.classList.add(variant);
            }

            function updateAuthSessionUI() {
                const isSignedIn = !!(user && !user.isAnonymous);
                const isVerified = !!(user && !user.isAnonymous && user.emailVerified);

                if (authLoggedOutView) {
                    authLoggedOutView.classList.toggle('auth-view-hidden', isSignedIn);
                }
                if (authLoggedInView) {
                    authLoggedInView.classList.toggle('auth-view-hidden', !isSignedIn);
                }

                if (authUserText) {
                    authUserText.textContent = isSignedIn
                        ? `Signed in as ${user.email || user.uid}`
                        : 'Not signed in';
                }

                if (authVerificationText) {
                    authVerificationText.classList.remove('verified', 'unverified');
                    if (isSignedIn) {
                        if (isVerified) {
                            authVerificationText.textContent = 'Email status: verified';
                            authVerificationText.classList.add('verified');
                        } else {
                            authVerificationText.textContent = 'Email status: not verified';
                            authVerificationText.classList.add('unverified');
                        }
                    } else {
                        authVerificationText.textContent = '';
                    }
                }

                if (authResendVerificationBtn) {
                    const shouldHide = !isSignedIn || isVerified;
                    authResendVerificationBtn.classList.toggle('auth-view-hidden', shouldHide);
                    authResendVerificationBtn.disabled = shouldHide;
                }

                if (authSignOutBtn) {
                    authSignOutBtn.disabled = !isSignedIn;
                }
                if (authOpenProfileBtn) {
                    authOpenProfileBtn.disabled = !isSignedIn || !isVerified;
                }
                updateForgotPasswordButtonState();
            }

            function updateAuthCardSelection(intent = 'signin') {
                pendingAuthIntent = intent === 'signup' ? 'signup' : 'signin';
                const isSignUp = pendingAuthIntent === 'signup';
                if (authSignInBtn) authSignInBtn.classList.toggle('selected', !isSignUp);
                if (authSignUpBtn) authSignUpBtn.classList.toggle('selected', isSignUp);
                if (authSubmitBtn) authSubmitBtn.textContent = isSignUp ? 'Create account' : 'Sign in';
                if (authPasswordInput) authPasswordInput.autocomplete = isSignUp ? 'new-password' : 'current-password';
                updateAuthPasswordPolicyUI();
            }

            function setAuthBusy(isBusy) {
                authBusy = !!isBusy;
                const isSignedIn = !!(user && !user.isAnonymous);
                const isVerified = !!(user && !user.isAnonymous && user.emailVerified);
                if (authEmailInput) authEmailInput.disabled = isBusy;
                if (authPasswordInput) authPasswordInput.disabled = isBusy;
                if (authSubmitBtn) authSubmitBtn.disabled = isBusy;
                if (authGoogleSignInBtn) authGoogleSignInBtn.disabled = isBusy;
                if (authSignInBtn) authSignInBtn.disabled = isBusy;
                if (authSignUpBtn) authSignUpBtn.disabled = isBusy;
                if (authSignOutBtn) authSignOutBtn.disabled = isBusy || !isSignedIn;
                if (authOpenProfileBtn) authOpenProfileBtn.disabled = isBusy || !isSignedIn || !isVerified;
                if (authResendVerificationBtn) authResendVerificationBtn.disabled = isBusy || !isSignedIn || isVerified;
                if (authContinueChatBtn) authContinueChatBtn.disabled = isBusy;
                updateForgotPasswordButtonState();
            }

            function readAuthCredentials() {
                const email = authEmailInput ? String(authEmailInput.value || '').trim() : '';
                const password = authPasswordInput ? String(authPasswordInput.value || '').trim() : '';
                return { email, password };
            }

            function evaluatePasswordPolicy(passwordValue) {
                const password = String(passwordValue || '');
                const checks = {
                    minLength: password.length >= 8,
                    hasLower: /[a-z]/.test(password),
                    hasUpper: /[A-Z]/.test(password),
                    hasNumber: /\d/.test(password),
                    hasSymbol: /[^A-Za-z0-9]/.test(password)
                };
                const score = Object.values(checks).filter(Boolean).length;
                const meetsPolicy = checks.minLength && checks.hasLower && checks.hasUpper && checks.hasNumber;
                let label = 'Very weak';
                if (score >= 5) label = 'Very strong';
                else if (score === 4) label = 'Strong';
                else if (score === 3) label = 'Fair';
                else if (score === 2) label = 'Weak';
                return {
                    checks,
                    score,
                    meetsPolicy,
                    label
                };
            }

            function updateAuthPasswordPolicyUI() {
                const isSignUp = pendingAuthIntent === 'signup';
                if (authPasswordStrengthWrap) {
                    authPasswordStrengthWrap.classList.toggle('auth-view-hidden', !isSignUp);
                }
                if (!isSignUp) return;

                const policy = evaluatePasswordPolicy(authPasswordInput ? authPasswordInput.value : '');
                if (authPasswordStrengthLabel) {
                    authPasswordStrengthLabel.textContent = policy.label;
                }
                if (authPasswordMeterFill) {
                    authPasswordMeterFill.style.width = `${Math.round((policy.score / 5) * 100)}%`;
                    if (policy.score >= 4) authPasswordMeterFill.style.background = '#5f6f3a';
                    else if (policy.score >= 3) authPasswordMeterFill.style.background = '#9a7a38';
                    else authPasswordMeterFill.style.background = '#7a2f2f';
                }
                if (authPasswordPolicyHints) {
                    const mark = (ok) => (ok ? '✓' : '•');
                    authPasswordPolicyHints.textContent = [
                        `${mark(policy.checks.minLength)} 8+ characters`,
                        `${mark(policy.checks.hasLower)} lowercase letter`,
                        `${mark(policy.checks.hasUpper)} uppercase letter`,
                        `${mark(policy.checks.hasNumber)} number`,
                        `${mark(policy.checks.hasSymbol)} symbol (recommended)`
                    ].join('\n');
                }
            }

            function mapAuthError(error) {
                const code = error && error.code ? String(error.code).toLowerCase() : '';
                const message = error && error.message ? String(error.message).toLowerCase() : '';
                if (code.includes('api-key-not-valid') || code.includes('invalid-api-key') || message.includes('api-key-not-valid') || message.includes('invalid-api-key')) return 'Firebase API key is invalid or missing in this deployed build.';
                if (code.includes('configuration-not-found') || message.includes('configuration-not-found')) return 'Firebase Auth config not found. Check projectId/authDomain and deploy again.';
                if (code.includes('invalid-email')) return 'Invalid email format.';
                if (code.includes('missing-password')) return 'Password is required.';
                if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'Wrong email or password.';
                if (code.includes('user-not-found')) return 'No account found for this email.';
                if (code.includes('email-already-in-use')) return 'This email is already registered. Use Sign in.';
                if (code.includes('weak-password')) return 'Password is too weak (use at least 6 characters).';
                if (code.includes('too-many-requests')) return 'Too many attempts. Try again shortly.';
                if (code.includes('operation-not-allowed')) return 'Enable Email/Password in Firebase Auth settings.';
                return 'Authentication failed. Check credentials and try again.';
            }

            function mapGoogleAuthError(error) {
                const code = error && error.code ? String(error.code).toLowerCase() : '';
                if (code.includes('popup-closed-by-user')) return 'Google sign-in popup was closed before completion.';
                if (code.includes('cancelled-popup-request')) return 'Google sign-in is already in progress.';
                if (code.includes('popup-blocked')) return 'Popup blocked by browser. Allow popups and try again.';
                if (code.includes('unauthorized-domain')) return 'Current domain is not authorized for Google sign-in in Firebase Auth settings.';
                if (code.includes('operation-not-allowed')) return 'Enable Google sign-in provider in Firebase Auth settings.';
                if (code.includes('account-exists-with-different-credential')) return 'Account already exists with different sign-in method. Sign in with that method first.';
                if (code.includes('network-request-failed')) return 'Network error during Google sign-in. Check connection and retry.';
                return mapAuthError(error);
            }

            function mapPasswordResetError(error) {
                const code = error && error.code ? String(error.code).toLowerCase() : '';
                if (code.includes('invalid-email')) return 'Enter a valid email address.';
                if (code.includes('missing-email')) return 'Email is required before sending reset link.';
                if (code.includes('too-many-requests')) return 'Too many reset attempts. Please wait a moment and try again.';
                if (code.includes('network-request-failed')) return 'Network error while sending reset email. Check connection and retry.';
                if (code.includes('operation-not-allowed')) return 'Password sign-in is disabled in Firebase Auth settings.';
                if (code.includes('configuration-not-found')) return 'Firebase Auth configuration is incomplete. Check Firebase setup.';
                return 'Unable to send reset email right now. Please try again.';
            }

            function readPasswordResetThrottleState() {
                if (typeof window === 'undefined') return;
                try {
                    const raw = localStorage.getItem(AUTH_RESET_COOLDOWN_STORAGE_KEY);
                    if (!raw) return;
                    const parsed = JSON.parse(raw);
                    authResetCooldownUntil = Number(parsed?.cooldownUntil || 0);
                    authResetAttemptCount = Number(parsed?.attemptCount || 0);
                    authResetLastAttemptAt = Number(parsed?.lastAttemptAt || 0);
                } catch (_) {
                    authResetCooldownUntil = 0;
                    authResetAttemptCount = 0;
                    authResetLastAttemptAt = 0;
                }
            }

            function persistPasswordResetThrottleState() {
                if (typeof window === 'undefined') return;
                try {
                    localStorage.setItem(AUTH_RESET_COOLDOWN_STORAGE_KEY, JSON.stringify({
                        cooldownUntil: authResetCooldownUntil,
                        attemptCount: authResetAttemptCount,
                        lastAttemptAt: authResetLastAttemptAt
                    }));
                } catch (_) {
                    // Ignore storage write failures.
                }
            }

            function getPasswordResetCooldownRemainingMs() {
                const remaining = authResetCooldownUntil - Date.now();
                return remaining > 0 ? remaining : 0;
            }

            function getPasswordResetCooldownSecondsText() {
                const remainingMs = getPasswordResetCooldownRemainingMs();
                const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
                return `${remainingSeconds}s`;
            }

            function updateForgotPasswordButtonState() {
                if (!authForgotPasswordBtn) return;
                const remainingMs = getPasswordResetCooldownRemainingMs();
                const cooldownActive = remainingMs > 0;
                authForgotPasswordBtn.disabled = authBusy || cooldownActive;
                authForgotPasswordBtn.textContent = cooldownActive
                    ? `Forgot password? (${getPasswordResetCooldownSecondsText()})`
                    : AUTH_FORGOT_PASSWORD_BUTTON_DEFAULT_LABEL;
            }

            function startPasswordResetCooldownTicker() {
                if (authResetCooldownInterval) return;
                authResetCooldownInterval = setInterval(() => {
                    const remainingMs = getPasswordResetCooldownRemainingMs();
                    if (remainingMs <= 0 && authResetCooldownUntil !== 0) {
                        authResetCooldownUntil = 0;
                        persistPasswordResetThrottleState();
                    }
                    updateForgotPasswordButtonState();
                    if (remainingMs <= 0 && authResetCooldownUntil === 0 && authResetCooldownInterval) {
                        clearInterval(authResetCooldownInterval);
                        authResetCooldownInterval = null;
                    }
                }, 1000);
            }

            function schedulePasswordResetCooldown(durationMs) {
                const cooldownMs = Math.max(AUTH_RESET_BASE_COOLDOWN_MS, Math.min(AUTH_RESET_MAX_COOLDOWN_MS, durationMs));
                authResetCooldownUntil = Date.now() + cooldownMs;
                persistPasswordResetThrottleState();
                updateForgotPasswordButtonState();
                startPasswordResetCooldownTicker();
                return cooldownMs;
            }

            function getNextPasswordResetCooldownMs() {
                const now = Date.now();
                if (!authResetLastAttemptAt || (now - authResetLastAttemptAt) > AUTH_RESET_BACKOFF_RESET_MS) {
                    authResetAttemptCount = 0;
                }
                const backoffStep = Math.min(authResetAttemptCount, 4);
                return AUTH_RESET_BASE_COOLDOWN_MS * (2 ** backoffStep);
            }

            function shouldUseEnumerationSafeResetMessage(error) {
                const code = String(error?.code || '').toLowerCase();
                return !(
                    code.includes('invalid-email') ||
                    code.includes('missing-email') ||
                    code.includes('network-request-failed') ||
                    code.includes('configuration-not-found') ||
                    code.includes('operation-not-allowed') ||
                    code.includes('api-key-not-valid') ||
                    code.includes('invalid-api-key')
                );
            }

            function mapEmailVerificationError(error) {
                const code = error && error.code ? String(error.code).toLowerCase() : '';
                if (code.includes('too-many-requests')) return 'Too many verification requests. Please wait and retry.';
                if (code.includes('invalid-email')) return 'This account email is invalid for verification.';
                if (code.includes('missing-email')) return 'Account email is missing. Sign out and sign in again.';
                if (code.includes('network-request-failed')) return 'Network error while sending verification email. Check connection and retry.';
                if (code.includes('operation-not-allowed')) return 'Email verification is disabled in Firebase Auth settings.';
                return 'Unable to send verification email right now. Please try again.';
            }

            function buildVerificationActionSettings() {
                const verificationUrl = typeof window !== 'undefined'
                    ? `${window.location.origin}/profile`
                    : null;
                return verificationUrl
                    ? { url: verificationUrl, handleCodeInApp: false }
                    : undefined;
            }

            async function initializeProfileForGoogleSignIn(signedInUser, isNewUser) {
                if (!db || !signedInUser || !signedInUser.uid) return;
                try {
                    const profileRef = doc(db, 'artifacts', appId, 'users', signedInUser.uid, 'profile', 'main');
                    const now = Date.now();
                    const profilePayload = {
                        email: signedInUser.email || '',
                        authProvider: 'google',
                        lastLoginAt: now,
                        updatedAt: now
                    };
                    if (isNewUser) {
                        profilePayload.accountCreatedVia = 'google';
                        profilePayload.createdAt = now;
                    }
                    await setDoc(profileRef, profilePayload, { merge: true });
                    if (isNewUser) {
                        trackEvent('auth_google_profile_initialized');
                    }
                } catch (profileInitError) {
                    console.warn('Google sign-in profile bootstrap failed:', profileInitError);
                    trackEvent('auth_google_profile_init_failed', {
                        error_code: getAuthErrorCode(profileInitError)
                    });
                }
            }

            function redirectToProfile(signedInUser) {
                if (!signedInUser) return;
                trackEvent('profile_navigation_requested', {
                    source: 'legacy_auth'
                });
                try {
                    localStorage.setItem('ephemeral_profile_user', JSON.stringify({
                        email: signedInUser.email || '',
                        uid: signedInUser.uid || ''
                    }));
                } catch (_) {
                    // Ignore storage write failures.
                }
                window.location.assign('/profile');
            }

            async function openAuthCard() {
                if (!authOverlay || !authSignInBtn || !authSignUpBtn || !authSubmitBtn || !authEmailInput || !authPasswordInput) {
                    await showCommandResponse("Auth card UI is not loaded. Hard refresh once and try /auth again.");
                    return;
                }
                trackEvent('auth_card_opened');
                updateAuthCardSelection('signin');
                const isSignedIn = !!(user && !user.isAnonymous);
                if (isSignedIn) {
                    try {
                        await reload(user);
                    } catch (_) {
                        // Ignore verification refresh failures in overlay open flow.
                    }
                }
                if (isSignedIn) {
                    if (user.emailVerified) {
                        setAuthStatus(`Signed in as ${user.email || 'account'}.`, 'success');
                    } else {
                        setAuthStatus('Signed in, but email is not verified yet. Verify email before opening profile.', 'error');
                    }
                } else {
                    setAuthStatus('');
                }
                toggleOverlay(authOverlay);
                updateAuthSessionUI();
                updateForgotPasswordButtonState();
                setTimeout(() => {
                    if (!isSignedIn && authEmailInput) authEmailInput.focus();
                }, 20);
            }

            function handleAuthChoice(intent) {
                updateAuthCardSelection(intent);
                setAuthStatus('');
                trackEvent('auth_intent_selected', {
                    auth_intent: intent === 'signup' ? 'signup' : 'signin'
                });
            }

            async function submitAuthForm() {
                if (!auth) {
                    setAuthStatus('Firebase auth is not initialized.', 'error');
                    trackEvent('auth_submit_blocked', { reason: 'auth_unavailable' });
                    return;
                }

                const { email, password } = readAuthCredentials();
                if (!email) {
                    setAuthStatus('Email is required.', 'error');
                    trackEvent('auth_submit_blocked', { reason: 'missing_email' });
                    return;
                }
                if (!password) {
                    setAuthStatus('Password is required.', 'error');
                    trackEvent('auth_submit_blocked', { reason: 'missing_password' });
                    return;
                }

                const passwordPolicy = evaluatePasswordPolicy(password);
                if (pendingAuthIntent === 'signup' && !passwordPolicy.meetsPolicy) {
                    setAuthStatus('Password policy: 8+ chars with uppercase, lowercase, and number.', 'error');
                    trackEvent('auth_submit_blocked', { reason: 'password_policy_failed' });
                    updateAuthPasswordPolicyUI();
                    return;
                }

                if (pendingAuthIntent !== 'signup' && password.length < 6) {
                    setAuthStatus('Password must be at least 6 characters.', 'error');
                    trackEvent('auth_submit_blocked', { reason: 'short_password' });
                    return;
                }

                try {
                    setAuthBusy(true);
                    setAuthStatus(pendingAuthIntent === 'signup' ? 'Creating account...' : 'Signing in...');
                    trackEvent('auth_submit_requested', {
                        auth_intent: pendingAuthIntent === 'signup' ? 'signup' : 'signin'
                    });
                    let credential = null;
                    if (pendingAuthIntent === 'signup') {
                        credential = await createUserWithEmailAndPassword(auth, email, password);
                        const verificationActionSettings = buildVerificationActionSettings();
                        try {
                            await sendEmailVerification(credential.user, verificationActionSettings);
                            trackEvent('auth_email_verification_sent', { source: 'signup' });
                        } catch (verificationError) {
                            trackEvent('auth_email_verification_send_failed', {
                                source: 'signup',
                                error_code: getAuthErrorCode(verificationError)
                            });
                        }
                        setAuthStatus('Account created. Verification email sent. Verify email before opening profile.', 'success');
                    } else {
                        credential = await signInWithEmailAndPassword(auth, email, password);
                        await reload(credential.user);
                        if (credential.user.emailVerified) {
                            setAuthStatus('Signed in successfully.', 'success');
                        } else {
                            setAuthStatus('Signed in, but email is not verified. Verify email before opening profile.', 'error');
                        }
                    }

                    if (authPasswordInput) authPasswordInput.value = '';
                    updateAuthSessionUI();
                    trackEvent('auth_submit_success', {
                        auth_intent: pendingAuthIntent === 'signup' ? 'signup' : 'signin'
                    });

                    const signedInUser = credential?.user;
                    if (signedInUser && !signedInUser.isAnonymous && signedInUser.emailVerified) {
                        redirectToProfile(signedInUser);
                        return;
                    }
                } catch (authError) {
                    setAuthStatus(mapAuthError(authError), 'error');
                    trackEvent('auth_submit_failed', {
                        auth_intent: pendingAuthIntent === 'signup' ? 'signup' : 'signin',
                        error_code: getAuthErrorCode(authError)
                    });
                } finally {
                    setAuthBusy(false);
                }
            }

            async function submitGoogleSignIn() {
                if (!auth) {
                    setAuthStatus('Firebase auth is not initialized.', 'error');
                    trackEvent('auth_google_login_failure', { reason: 'auth_unavailable' });
                    return;
                }

                try {
                    setAuthBusy(true);
                    setAuthStatus('Opening Google sign-in...');
                    trackEvent('auth_google_login_start');

                    const googleProvider = new GoogleAuthProvider();
                    googleProvider.setCustomParameters({ prompt: 'select_account' });
                    const credential = await signInWithPopup(auth, googleProvider);
                    const signedInUser = credential?.user || null;
                    const isNewUser = !!getAdditionalUserInfo(credential)?.isNewUser;

                    if (signedInUser && !signedInUser.isAnonymous) {
                        await initializeProfileForGoogleSignIn(signedInUser, isNewUser);
                        setAuthStatus('Signed in with Google.', 'success');
                        updateAuthSessionUI();
                        trackEvent('auth_google_login_success', { is_new_user: isNewUser });
                        redirectToProfile(signedInUser);
                        return;
                    }

                    setAuthStatus('Google sign-in succeeded, but no account session was returned.', 'error');
                    trackEvent('auth_google_login_failure', { reason: 'missing_user' });
                } catch (googleAuthError) {
                    setAuthStatus(mapGoogleAuthError(googleAuthError), 'error');
                    trackEvent('auth_google_login_failure', {
                        error_code: getAuthErrorCode(googleAuthError)
                    });
                } finally {
                    setAuthBusy(false);
                }
            }

            async function requestPasswordReset() {
                if (!auth) {
                    setAuthStatus('Firebase auth is not initialized.', 'error');
                    trackEvent('auth_password_reset_failed', { reason: 'auth_unavailable' });
                    return;
                }

                const { email } = readAuthCredentials();
                if (!email) {
                    setAuthStatus('Enter your email first, then click Forgot password.', 'error');
                    trackEvent('auth_password_reset_failed', { reason: 'missing_email' });
                    return;
                }

                const remainingMs = getPasswordResetCooldownRemainingMs();
                if (remainingMs > 0) {
                    setAuthStatus(`Please wait ${getPasswordResetCooldownSecondsText()} before requesting another reset link.`, 'error');
                    trackEvent('auth_password_reset_blocked', {
                        reason: 'cooldown_active',
                        cooldown_remaining_ms: remainingMs
                    });
                    updateForgotPasswordButtonState();
                    return;
                }

                const nextCooldownMs = getNextPasswordResetCooldownMs();
                const appliedCooldownMs = schedulePasswordResetCooldown(nextCooldownMs);
                authResetAttemptCount += 1;
                authResetLastAttemptAt = Date.now();
                persistPasswordResetThrottleState();

                try {
                    setAuthBusy(true);
                    setAuthStatus('Sending password reset link...');
                    trackEvent('auth_password_reset_requested');

                    const resetUrl = typeof window !== 'undefined'
                        ? `${window.location.origin}/auth-action`
                        : null;
                    const actionCodeSettings = resetUrl
                        ? { url: resetUrl, handleCodeInApp: false }
                        : undefined;
                    await sendPasswordResetEmail(auth, email, actionCodeSettings);

                    setAuthStatus('If an account exists for this email, a reset link has been sent. Check inbox and spam.', 'success');
                    trackEvent('auth_password_reset_sent', {
                        cooldown_ms: appliedCooldownMs,
                        throttle_attempt_count: authResetAttemptCount
                    });
                } catch (resetError) {
                    const safeMessage = 'If an account exists for this email, a reset link has been sent. Check inbox and spam.';
                    if (shouldUseEnumerationSafeResetMessage(resetError)) {
                        setAuthStatus(safeMessage, 'success');
                    } else {
                        setAuthStatus(mapPasswordResetError(resetError), 'error');
                    }
                    trackEvent('auth_password_reset_failed', {
                        error_code: getAuthErrorCode(resetError),
                        cooldown_ms: appliedCooldownMs,
                        throttle_attempt_count: authResetAttemptCount
                    });
                } finally {
                    setAuthBusy(false);
                    updateForgotPasswordButtonState();
                }
            }

            async function resendVerificationEmail() {
                if (!auth || !user || user.isAnonymous) {
                    setAuthStatus('Sign in with an email account first.', 'error');
                    trackEvent('auth_email_verification_resend_failed', { reason: 'signed_out' });
                    return;
                }

                if (!user.email) {
                    setAuthStatus('Signed-in account does not have an email address.', 'error');
                    trackEvent('auth_email_verification_resend_failed', { reason: 'missing_email' });
                    return;
                }

                if (user.emailVerified) {
                    setAuthStatus('Email is already verified. You can open profile now.', 'success');
                    updateAuthSessionUI();
                    return;
                }

                try {
                    setAuthBusy(true);
                    setAuthStatus('Sending verification email...');
                    trackEvent('auth_email_verification_resend_requested');
                    await sendEmailVerification(user, buildVerificationActionSettings());
                    setAuthStatus('Verification email sent. Check inbox and spam.', 'success');
                    trackEvent('auth_email_verification_resend_sent');
                } catch (verificationError) {
                    setAuthStatus(mapEmailVerificationError(verificationError), 'error');
                    trackEvent('auth_email_verification_resend_failed', {
                        error_code: getAuthErrorCode(verificationError)
                    });
                } finally {
                    setAuthBusy(false);
                }
            }

            async function signOutAuthUser() {
                if (!auth || !user || user.isAnonymous) return;
                try {
                    setAuthBusy(true);
                    trackEvent('auth_sign_out_requested');
                    await signOut(auth);
                    if (authEmailInput) authEmailInput.value = '';
                    if (authPasswordInput) authPasswordInput.value = '';
                    setAuthStatus('Signed out.', 'success');
                    updateAuthSessionUI();
                    trackEvent('auth_sign_out_success');
                } catch (authError) {
                    setAuthStatus(mapAuthError(authError), 'error');
                    trackEvent('auth_sign_out_failed', {
                        error_code: getAuthErrorCode(authError)
                    });
                } finally {
                    setAuthBusy(false);
                }
            }

            function splitIntoSentences(value) {
                const source = String(value || '').trim();
                if (!source) return [];
                const matches = source.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [];
                return matches.map((part) => part.trim()).filter(Boolean);
            }

            function chunkSegments(segments, maxChars = 220, maxItems = 2) {
                const chunks = [];
                let current = [];
                for (const segment of segments) {
                    const clean = String(segment || '').trim();
                    if (!clean) continue;
                    const candidate = current.concat(clean).join(' ');
                    if (current.length > 0 && (candidate.length > maxChars || current.length >= maxItems)) {
                        chunks.push(current.join(' ').trim());
                        current = [clean];
                        continue;
                    }
                    current.push(clean);
                }
                if (current.length > 0) {
                    chunks.push(current.join(' ').trim());
                }
                return chunks.filter(Boolean);
            }

            function normalizeInlineListBreaks(value) {
                return String(value || '')
                    .replace(/\s+(\d+\.)\s+/g, '\n$1 ')
                    .replace(/\s+([a-z]\))\s+/gi, '\n$1 ')
                    .replace(/\s+([-*])\s+/g, '\n$1 ');
            }

            function formatResponseForDisplay(rawText) {
                let text = String(rawText || '')
                    .replace(/\r\n/g, '\n')
                    .replace(/[ \t]+\n/g, '\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                if (!text) return '';

                text = normalizeInlineListBreaks(text);

                const sourceParagraphs = text
                    .split(/\n{2,}/)
                    .map((part) => part.trim())
                    .filter(Boolean);
                const formattedParagraphs = [];

                for (const paragraph of sourceParagraphs) {
                    const lines = paragraph
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean);
                    const hasListPrefix = lines.some((line) => /^(\d+\.|[a-z]\)|[-*])\s+/i.test(line));
                    if (hasListPrefix) {
                        const normalizedListLines = lines.map((line) => normalizeInlineListBreaks(line)).join('\n')
                            .split('\n')
                            .map((line) => line.trim())
                            .filter(Boolean);
                        formattedParagraphs.push(normalizedListLines.join('\n'));
                        continue;
                    }

                    const cleanParagraph = lines.join(' ').replace(/\s+/g, ' ').trim();
                    if (!cleanParagraph) continue;
                    if (cleanParagraph.length <= 260) {
                        formattedParagraphs.push(cleanParagraph);
                        continue;
                    }

                    const sentences = splitIntoSentences(cleanParagraph);
                    if (sentences.length >= 3) {
                        formattedParagraphs.push(...chunkSegments(sentences, 220, 2));
                        continue;
                    }

                    const commaSegments = cleanParagraph
                        .split(/(?<=[,;:])\s+/)
                        .map((segment) => segment.trim())
                        .filter(Boolean);
                    if (commaSegments.length >= 3) {
                        formattedParagraphs.push(...chunkSegments(commaSegments, 190, 2));
                        continue;
                    }

                    formattedParagraphs.push(cleanParagraph);
                }

                return formattedParagraphs
                    .join('\n\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
            }
            function buildSafeConversationalFallback(query) {
                const normalized = String(query || '').trim().toLowerCase();
                if (/^(hi|hey|hello|yo|sup|what'?s up)[!.?]*$/.test(normalized)) {
                    return "Hey! How's it going?";
                }
                if (/(^|\b)(who are you|what are you|introduce yourself)(\b|$)/.test(normalized)) {
                    return `I'm ${ASSISTANT_IDENTITY_NAME}. Ask me anything and I'll keep it clear and short.`;
                }
                if (normalized.length <= 30) {
                    return "I'm here. Tell me what you need and I'll keep it short.";
                }
                return "Absolutely. Here's the short answer:";
            }

            function countPromptLeakSignals(text) {
                const source = String(text || '');
                if (!source) return 0;
                const matches = source.match(/(?:user input\s*:|goal\s*:|constraints?\s*:|option\s*\d+\s*:|current date\/time\s*:|no markdown|no ai mention|no role tags|short\?\s*yes|casual\?\s*yes)/gi);
                return matches ? matches.length : 0;
            }

            function isLikelyPromptLeak(text) {
                const source = String(text || '').trim();
                if (!source) return false;
                const signalCount = countPromptLeakSignals(source);
                if (signalCount >= 2) return true;
                if (signalCount >= 1 && /(^|\n)\s*[*-]\s*(user input|goal|constraints?|option\s*\d+)/i.test(source)) return true;
                if (signalCount >= 1 && source.length < 500) return true;
                return false;
            }

            function sanitizeModelText(rawText, query) {
                const original = String(rawText || '').replace(/\r\n/g, '\n').trim();
                if (!original) return '';

                const lines = original.split('\n').map((line) => line.trim()).filter(Boolean);
                const metaLinePattern = /(?:^|\b)(user input|goal\s*:|constraints?\s*:|option\s*\d+\s*:|current date\/time|no markdown|no ai mention|no role tags|short\?\s*yes|casual\?\s*yes)(?:\b|$)/i;
                const fencedBlockPattern = /^```/;

                let metaLineCount = 0;
                const cleanedLines = [];
                for (const line of lines) {
                    const noBullet = line.replace(/^[-*•]+\s*/, '');
                    if (metaLinePattern.test(noBullet) || fencedBlockPattern.test(noBullet)) {
                        metaLineCount += 1;
                        continue;
                    }
                    cleanedLines.push(noBullet);
                }

                const cleaned = cleanedLines.join('\n').trim();
                const heavilyLeaked =
                    isLikelyPromptLeak(original) ||
                    metaLineCount >= 3 ||
                    (metaLineCount >= 2 && (cleaned.length < 20 || cleaned.length < (original.length * 0.2))) ||
                    (metaLineCount >= 1 && !cleaned);

                if (heavilyLeaked) {
                    return buildSafeConversationalFallback(query);
                }

                if (cleaned) return cleaned;
                return original;
            }

            function buildToneMenu() {
                toneList.innerHTML = '';
                for (const [id, data] of Object.entries(personas)) {
                    const item = document.createElement('div');
                    item.className = 'overlay-item clickable';
                    item.innerHTML = `<div class="tone-cmd">${data.name}</div>`;
                    item.onclick = () => { setPersona(id); closeOverlays(); };
                    toneList.appendChild(item);
                }
            }

            function buildChatsMenu() {
                chatsList.innerHTML = '';
                
                const newChatItem = document.createElement('div');
                newChatItem.className = 'overlay-item clickable';
                newChatItem.innerHTML = `<div class="tone-cmd" style="color: #EAEAEA;">+ NEW CONNECTION</div>`;
                newChatItem.onclick = () => { 
                    closeOverlays();
                    if (conversationHistory.length > 0) {
                        trackEvent('chat_new_session_requested', { source: 'archives_overlay' });
                        executeVoidReset();
                    }
                };
                chatsList.appendChild(newChatItem);

                archives.forEach(chat => {
                    const item = document.createElement('div');
                    item.className = 'overlay-item clickable';
                    const isActive = chat.id === currentChatId;
                    const colorStyle = isActive ? 'color: #EAEAEA; text-shadow: 0 0 15px rgba(255,255,255,0.5);' : '';
                    item.innerHTML = `<div class="overlay-cmd" style="${colorStyle}">${chat.title}</div>`;
                    item.onclick = () => { 
                        closeOverlays(); 
                        trackEvent('chat_archive_selected', { source: 'archives_overlay' });
                        loadArchivedChat(chat.id); 
                    };
                    chatsList.appendChild(item);
                });
            }

            function setPersona(id) {
                if (!personas[id]) return;
                currentPersonaId = id;
                trackEvent('persona_changed', { persona_id: id });
                ambientCore.className = 'state-typing';
                setTimeout(() => { if (currentState === 'INPUT') ambientCore.className = 'state-idle'; }, 2000);
            }

            buildToneMenu();
            buildChatsMenu();
            readDualReplyModeState();
            readCommandMacrosState();
            readPasswordResetThrottleState();
            if (getPasswordResetCooldownRemainingMs() > 0) {
                startPasswordResetCooldownTicker();
            } else if (authResetCooldownUntil !== 0) {
                authResetCooldownUntil = 0;
                persistPasswordResetThrottleState();
            }
            updateAuthCardSelection('signin');
            updateAuthSessionUI();
            setAuthBusy(false);
            inputField.focus();

            // --- Core Listeners ---
            inputField.addEventListener('input', () => {
                if (currentState === 'INPUT') {
                    ambientCore.className = 'state-typing';
                    clearTimeout(coreTypingTimeout);
                    coreTypingTimeout = setTimeout(() => {
                        if (currentState === 'INPUT') ambientCore.className = 'state-idle';
                    }, 1500);
                }
            });

            function triggerEphemeralDecay() {
                if (currentState !== 'READING') return;
                statusText.textContent = "Memory dissolving...";
                statusText.classList.add('pulse-text');
                ambientCore.className = 'state-decay-flare';
                outputField.style.transition = 'color 0.8s ease, text-shadow 0.8s ease, transform 0.8s ease';
                outputField.style.color = 'var(--theme-color)';
                outputField.style.textShadow = '0 0 20px var(--theme-color), 0 0 40px var(--theme-color)';
                outputField.style.transform = 'scale(1.02)';
                setTimeout(() => {
                    if (currentState !== 'READING') return;
                    ambientCore.className = 'state-decay-die';
                    outputField.style.transition = 'all 2s cubic-bezier(0.25, 1, 0.5, 1)';
                    outputField.style.opacity = '0';
                    outputField.style.filter = 'blur(15px)';
                    outputField.style.transform = 'translateY(-15px) scale(1.05)';
                }, 800);
                setTimeout(() => {
                    if (currentState === 'READING') resetToInput();
                }, 3200);
            }

            function resetDecayTimer() {
                clearTimeout(decayTimeout);
                if (currentState === 'READING' && !isTyping) {
                    decayTimeout = setTimeout(triggerEphemeralDecay, 30000);
                }
            }

            ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
                window.addEventListener(evt, resetDecayTimer, { passive: true });
            });

            // FIX: Scroll events do not "bubble" up to the window, so we must attach them directly to the scrollable containers!
            responseContainer.addEventListener('scroll', resetDecayTimer, { passive: true });
            stack.addEventListener('scroll', resetDecayTimer, { passive: true });

            // --- Overlay Management ---
            function toggleOverlay(overlayElement, indicatorElement) {
                if (!overlayElement) return;
                const isActive = overlayElement.classList.contains('active');
                const overlayId = String(overlayElement.id || 'unknown').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
                if (!isActive) {
                    closeOverlays();
                    overlayElement.classList.add('active');
                    trackEvent('overlay_opened', { overlay_id: overlayId });
                    if (indicatorElement) {
                        indicatorElement.innerText = 'X';
                        indicatorElement.style.opacity = '1';
                        indicatorElement.style.color = 'var(--theme-color)';
                    }
                    inputField.blur();
                } else {
                    closeOverlays();
                    trackEvent('overlay_closed', { overlay_id: overlayId });
                    if (currentState === 'INPUT') setTimeout(() => inputField.focus(), 10);
                }
            }

            function closeOverlays() {
                helpOverlay.classList.remove('active');
                toneOverlay.classList.remove('active');
                chatsOverlay.classList.remove('active');
                if (authOverlay) authOverlay.classList.remove('active');

                helpIndicator.innerText = '/help';
                helpIndicator.style.opacity = '0.5';
                helpIndicator.style.color = '#8B8B8B';

                chatsIndicator.innerText = '/chats';
                chatsIndicator.style.opacity = '0.5';
                chatsIndicator.style.color = '#8B8B8B';
            }

            helpIndicator.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                if (helpOverlay.classList.contains('active')) closeOverlays();
                else toggleOverlay(helpOverlay, helpIndicator);
            });

            chatsIndicator.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                if (chatsOverlay.classList.contains('active')) closeOverlays();
                else toggleOverlay(chatsOverlay, chatsIndicator);
            });

            if (authSignInBtn) {
                authSignInBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleAuthChoice('signin');
                });
            }

            if (authSignUpBtn) {
                authSignUpBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleAuthChoice('signup');
                });
            }

            if (authSubmitBtn) {
                authSubmitBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await submitAuthForm();
                });
            }

            if (authGoogleSignInBtn) {
                authGoogleSignInBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await submitGoogleSignIn();
                });
            }

            if (authForgotPasswordBtn) {
                authForgotPasswordBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await requestPasswordReset();
                });
            }

            if (authSignOutBtn) {
                authSignOutBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await signOutAuthUser();
                });
            }

            if (authResendVerificationBtn) {
                authResendVerificationBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await resendVerificationEmail();
                });
            }

            if (authOpenProfileBtn) {
                authOpenProfileBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!user || user.isAnonymous) {
                        setAuthStatus('Sign in first to open profile.', 'error');
                        return;
                    }
                    if (!user.emailVerified) {
                        setAuthStatus('Verify your email before opening profile.', 'error');
                        return;
                    }
                    trackEvent('profile_navigation_requested', {
                        source: 'auth_card'
                    });
                    window.location.assign('/profile');
                });
            }

            if (authContinueChatBtn) {
                authContinueChatBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    trackEvent('auth_continue_chat_clicked');
                    closeOverlays();
                    if (currentState === 'INPUT') inputField.focus();
                });
            }

            const authEnterHandler = async (e) => {
                if (e.key !== 'Enter') return;
                if (authLoggedOutView && authLoggedOutView.classList.contains('auth-view-hidden')) return;
                e.preventDefault();
                e.stopPropagation();
                await submitAuthForm();
            };

            if (authEmailInput) authEmailInput.addEventListener('keydown', authEnterHandler);
            if (authPasswordInput) authPasswordInput.addEventListener('keydown', authEnterHandler);
            if (authPasswordInput) authPasswordInput.addEventListener('input', updateAuthPasswordPolicyUI);
            helpOverlay.addEventListener('click', closeOverlays);
            toneOverlay.addEventListener('click', closeOverlays);
            chatsOverlay.addEventListener('click', closeOverlays);
            if (authOverlay) authOverlay.addEventListener('click', closeOverlays);
            if (authCard) authCard.addEventListener('click', (e) => e.stopPropagation());

            document.body.addEventListener('click', (e) => {
                if (helpOverlay.classList.contains('active') || toneOverlay.classList.contains('active') || chatsOverlay.classList.contains('active') || (authOverlay && authOverlay.classList.contains('active'))) return;
                if(currentState === 'INPUT') inputField.focus();
                if(currentState === 'READING') {
                    if (e.target.closest('#response-container') || e.target.closest('#history-stack')) return;
                    resetToInput();
                    inputField.focus();
                }
            });

            inputField.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    const query = inputField.innerText.trim();
                    if (!query) return;
                    submitQuery(query);
                }
            });

            document.addEventListener('keydown', (e) => {
                const overlaysActive = helpOverlay.classList.contains('active') || toneOverlay.classList.contains('active') || chatsOverlay.classList.contains('active') || (authOverlay && authOverlay.classList.contains('active'));
                if (overlaysActive) {
                    const authOverlayActive = authOverlay && authOverlay.classList.contains('active');
                    const targetInsideAuthCard = authCard && authCard.contains(e.target);
                    if (authOverlayActive && targetInsideAuthCard) {
                        if (e.key === 'Escape') {
                            closeOverlays();
                            if (currentState === 'INPUT') inputField.focus();
                        }
                        return;
                    }

                    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
                    closeOverlays();
                    if (!['Escape', 'Enter'].includes(e.key)) inputField.focus();
                    return;
                }
                if (currentState === 'READING' && e.key !== 'Enter') {
                    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
                    resetToInput();
                    inputField.focus();
                }
            });

            stack.addEventListener('click', (e) => {
                const item = e.target.closest('.history-item');
                if (item && item.dataset.response) {
                    e.stopPropagation(); 
                    if (currentState === 'PROCESSING') return; 
                    trackEvent('history_item_opened');
                    document.body.classList.add('state-reading');
                    inputField.blur();
                    displayResponse(item.dataset.response, true);
                    cinematicTooltip.classList.remove('visible');
                    clearTimeout(tooltipTimeout); // clear on click
                }
            });

            // Cinematic Tooltip Logic
            let lastHoverX = 0;
            let lastHoverY = 0;

            stack.addEventListener('mousemove', (e) => {
                // Constantly track position quietly without moving the tooltip
                lastHoverX = e.clientX;
                lastHoverY = e.clientY;
            });

            stack.addEventListener('mouseover', (e) => {
                const item = e.target.closest('.history-item');
                if (item && item.dataset.fullText) {
                    // Only trigger if the text is actually truncated
                    if (item.scrollWidth > item.clientWidth) {
                        clearTimeout(tooltipTimeout);
                        tooltipTimeout = setTimeout(() => {
                            cinematicTooltip.textContent = item.dataset.fullText;
                            // Spawn it exactly where the cursor is at this moment, then lock it
                            cinematicTooltip.style.left = (lastHoverX + 25) + 'px';
                            cinematicTooltip.style.top = lastHoverY + 'px';
                            cinematicTooltip.classList.add('visible');
                        }, 700); // 700ms delay before showing
                    }
                }
            });

            stack.addEventListener('mouseout', (e) => {
                const item = e.target.closest('.history-item');
                if (item) {
                    clearTimeout(tooltipTimeout); // Cancel delay if mouse leaves
                    cinematicTooltip.classList.remove('visible');
                }
            });
            
            function checkScroll() {
                if (currentState !== 'READING') { scrollIndicator.style.opacity = '0'; return; }
                const isScrollable = responseContainer.scrollHeight > responseContainer.clientHeight;
                const isAtBottom = responseContainer.scrollHeight - responseContainer.scrollTop <= responseContainer.clientHeight + 10;
                scrollIndicator.style.opacity = (isScrollable && !isAtBottom) ? '0.5' : '0';
            }
            responseContainer.addEventListener('scroll', checkScroll);

            // --- Logic Execution ---

            function loadArchivedChat(id) {
                if (currentChatId === id) return;
                const chat = archives.find(c => c.id === id);
                if (!chat) return;

                currentChatId = id;
                conversationHistory = chat.history;
                trackEvent('chat_archive_opened', {
                    message_count: Array.isArray(conversationHistory) ? conversationHistory.length : 0
                });
                webSnapshot = null;
                lastWebQuery = '';

                // Fast clear
                outputField.innerHTML = '';
                
                // Rebuild Stack
                stack.innerHTML = '';
                memoryCanvas.innerHTML = '';

                for (let i = 0; i < conversationHistory.length; i++) {
                    const msg = conversationHistory[i];
                    if (msg.role === 'user') {
                        const nextModelMsg = conversationHistory[i+1];
                        const aiText = nextModelMsg && nextModelMsg.role === 'model' ? nextModelMsg.parts[0].text : "The void remains.";

                        const placeholder = document.createElement('div');
                        placeholder.className = 'history-item';
                        placeholder.style.opacity = '0.4';
                        placeholder.textContent = msg.parts[0].text;
                        placeholder.dataset.response = aiText;
                        placeholder.dataset.fullText = msg.parts[0].text;
                        stack.appendChild(placeholder);
                        
                        commitToMemory(msg.parts[0].text, true);
                    }
                }
                stack.scrollTo({ top: stack.scrollHeight });
                buildChatsMenu();
                resetToInput();
            }

            async function submitQuery(text) {
                const rawText = String(text || '').replace(/\u200B/g, '').trim();
                const queryText = rawText.toLowerCase();
                if (queryText === '/help') { trackEvent('command_executed', { command_name: 'help' }); inputField.innerText = ''; toggleOverlay(helpOverlay, helpIndicator); return; }
                if (queryText === '/tone') { trackEvent('command_executed', { command_name: 'tone' }); inputField.innerText = ''; toggleOverlay(toneOverlay); return; }
                if (queryText === '/chats') { trackEvent('command_executed', { command_name: 'chats' }); inputField.innerText = ''; toggleOverlay(chatsOverlay, chatsIndicator); return; }
                if (queryText === '/void') { trackEvent('command_executed', { command_name: 'void' }); executeVoidReset(); return; }
                if (queryText === '/del') { 
                    if (currentChatId && window.deleteFromArchive) window.deleteFromArchive(currentChatId);
                    trackEvent('command_executed', { command_name: 'del' });
                    executeDeleteReset(); 
                    return; 
                }
                if (queryText === '/auth') {
                    trackEvent('command_executed', { command_name: 'auth' });
                    inputField.innerText = '';
                    await openAuthCard();
                    return;
                }
                if (queryText === '/profile') {
                    trackEvent('command_executed', { command_name: 'profile' });
                    inputField.innerText = '';
                    trackEvent('profile_navigation_requested', {
                        source: 'chat_command'
                    });
                    window.location.assign('/profile');
                    return;
                }
                if (/^\/auth\s+/.test(queryText)) {
                    trackEvent('command_executed', { command_name: 'auth_invalid' });
                    inputField.innerText = '';
                    await showCommandResponse("Usage: /auth");
                    return;
                }
                if (queryText === '/dual' || queryText === '/dual status') {
                    trackEvent('command_executed', { command_name: 'dual_status' });
                    inputField.innerText = '';
                    await showCommandResponse(formatDualReplyStatusText());
                    return;
                }
                if (queryText === '/dual on') {
                    trackEvent('command_executed', { command_name: 'dual_on' });
                    inputField.innerText = '';
                    const changed = setDualReplyMode(true, 'chat_command');
                    await showCommandResponse(changed
                        ? 'Dual reply mode enabled. You will now get Quick + Deep in the same response.'
                        : 'Dual reply mode is already enabled.');
                    return;
                }
                if (queryText === '/dual off') {
                    trackEvent('command_executed', { command_name: 'dual_off' });
                    inputField.innerText = '';
                    const changed = setDualReplyMode(false, 'chat_command');
                    await showCommandResponse(changed
                        ? 'Dual reply mode disabled. Responses are back to normal single-lane output.'
                        : 'Dual reply mode is already disabled.');
                    return;
                }
                if (queryText.startsWith('/dual ')) {
                    trackEvent('command_executed', { command_name: 'dual_invalid' });
                    inputField.innerText = '';
                    await showCommandResponse('Usage: /dual on, /dual off, or /dual status');
                    return;
                }
                if (queryText === '/macro' || queryText === '/macro help') {
                    trackEvent('command_executed', { command_name: 'macro_help' });
                    inputField.innerText = '';
                    await showCommandResponse('Macro commands:\n/macro list\n/macro show <name>\n/macro del <name>\n/macro add <name> || <prompt> || <tone> || <format>\nThen run it with /<name> <optional request>');
                    return;
                }
                if (queryText === '/macro list') {
                    trackEvent('command_executed', { command_name: 'macro_list' });
                    inputField.innerText = '';
                    await showCommandResponse(formatMacroListText());
                    return;
                }
                if (queryText.startsWith('/macro show ')) {
                    const macroNameForShow = normalizeMacroName(rawText.substring('/macro show '.length));
                    trackEvent('command_executed', {
                        command_name: 'macro_show',
                        macro_name: macroNameForShow || 'unknown'
                    });
                    inputField.innerText = '';
                    if (!macroNameForShow) {
                        await showCommandResponse('Usage: /macro show <name>');
                        return;
                    }
                    await showCommandResponse(formatMacroDetailsText(macroNameForShow));
                    return;
                }
                if (queryText.startsWith('/macro del ') || queryText.startsWith('/macro delete ') || queryText.startsWith('/macro remove ')) {
                    const removePrefix = queryText.startsWith('/macro del ')
                        ? '/macro del '
                        : (queryText.startsWith('/macro delete ') ? '/macro delete ' : '/macro remove ');
                    const macroNameForDelete = normalizeMacroName(rawText.substring(removePrefix.length));
                    trackEvent('command_executed', {
                        command_name: 'macro_delete',
                        macro_name: macroNameForDelete || 'unknown'
                    });
                    inputField.innerText = '';
                    if (!macroNameForDelete) {
                        await showCommandResponse('Usage: /macro del <name>');
                        return;
                    }
                    if (!commandMacros[macroNameForDelete]) {
                        await showCommandResponse(`Macro /${macroNameForDelete} not found.`);
                        return;
                    }
                    delete commandMacros[macroNameForDelete];
                    persistCommandMacrosState();
                    await showCommandResponse(`Deleted macro /${macroNameForDelete}.`);
                    return;
                }
                if (queryText.startsWith('/macro add ')) {
                    trackEvent('command_executed', { command_name: 'macro_add' });
                    inputField.innerText = '';
                    const parseResult = parseMacroAddPayload(rawText.substring('/macro add '.length));
                    if (!parseResult.ok) {
                        await showCommandResponse(parseResult.error);
                        return;
                    }
                    const macro = parseResult.macro;
                    const isNewMacro = !commandMacros[macro.name];
                    if (isNewMacro && Object.keys(commandMacros).length >= COMMAND_MACRO_MAX_COUNT) {
                        await showCommandResponse(`Macro limit reached (${COMMAND_MACRO_MAX_COUNT}). Delete one first with /macro del <name>.`);
                        return;
                    }
                    commandMacros[macro.name] = {
                        prompt: macro.prompt,
                        tone: macro.tone,
                        format: macro.format,
                        updatedAt: Date.now()
                    };
                    persistCommandMacrosState();
                    trackEvent('macro_saved', {
                        macro_name: macro.name
                    });
                    await showCommandResponse(`Saved macro /${macro.name}. Run it with "/${macro.name}" or "/${macro.name} <your request>".`);
                    return;
                }
                if (queryText.startsWith('/macro ')) {
                    trackEvent('command_executed', { command_name: 'macro_invalid' });
                    inputField.innerText = '';
                    await showCommandResponse('Usage: /macro list | /macro show <name> | /macro del <name> | /macro add <name> || <prompt> || <tone> || <format>');
                    return;
                }
                if (queryText === '/webstatus') {
                    trackEvent('command_executed', { command_name: 'webstatus' });
                    inputField.innerText = '';
                    await showCommandResponse(formatWebStatusText());
                    return;
                }
                if (queryText === '/webclear') {
                    trackEvent('command_executed', { command_name: 'webclear' });
                    inputField.innerText = '';
                    webSnapshot = null;
                    lastWebQuery = '';
                    await showCommandResponse("Cached web snapshot cleared. Use /web <question> to fetch fresh live data.");
                    return;
                }

                let promptText = rawText;
                let modelPromptText = rawText;
                let useWebGrounding = false;
                let shouldUpdateWebSnapshot = false;
                let usedRefreshWebCommand = false;
                let macroName = '';
                let macroContext = null;

                if (queryText === '/web') {
                    trackEvent('command_executed', { command_name: 'web_invalid' });
                    inputField.innerText = '';
                    await showCommandResponse("Usage: /web <question>. Example: /web latest ai news today");
                    return;
                }

                if (queryText.startsWith('/web ')) {
                    trackEvent('command_executed', { command_name: 'web' });
                    promptText = rawText.substring(5).trim();
                    modelPromptText = promptText;
                    if (!promptText) {
                        inputField.innerText = '';
                        await showCommandResponse("Usage: /web <question>. Example: /web latest ai news today");
                        return;
                    }
                    useWebGrounding = true;
                    shouldUpdateWebSnapshot = true;
                    lastWebQuery = promptText;
                }

                if (queryText === '/refreshweb' || queryText.startsWith('/refreshweb ')) {
                    trackEvent('command_executed', { command_name: 'refreshweb' });
                    const explicitRefreshPrompt = rawText.substring('/refreshweb'.length).trim();
                    const cachedPrompt = getActiveWebSnapshot()?.query || lastWebQuery;
                    promptText = explicitRefreshPrompt || cachedPrompt || '';
                    modelPromptText = promptText;
                    if (!promptText) {
                        inputField.innerText = '';
                        await showCommandResponse("No previous web query found. Use /web <question> first, or /refreshweb <question>.");
                        return;
                    }
                    useWebGrounding = true;
                    shouldUpdateWebSnapshot = true;
                    lastWebQuery = promptText;
                    usedRefreshWebCommand = true;
                }
                const macroInvocationMatch = rawText.match(/^\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i);
                if (macroInvocationMatch) {
                    const maybeMacroName = normalizeMacroName(macroInvocationMatch[1]);
                    const macroConfig = commandMacros[maybeMacroName];
                    if (macroConfig) {
                        const macroTail = String(macroInvocationMatch[2] || '').trim();
                        macroName = maybeMacroName;
                        macroContext = macroConfig;
                        modelPromptText = sanitizeMacroText(macroTail || macroConfig.prompt, 1200);
                        if (!modelPromptText) {
                            modelPromptText = 'Continue with the macro defaults.';
                        }
                        trackEvent('command_executed', {
                            command_name: 'macro_invoke',
                            macro_name: macroName,
                            has_tail_input: macroTail ? 1 : 0
                        });
                    }
                }

                // Initialize a new chat session if none exists
                if (!currentChatId) {
                    currentChatId = Date.now().toString();
                    buildChatsMenu(); // show it in menu immediately
                    trackEvent('chat_session_created');
                }

                trackEvent('chat_prompt_submitted', {
                    prompt_length: modelPromptText.length,
                    uses_web_grounding: useWebGrounding,
                    uses_refresh_command: usedRefreshWebCommand,
                    dual_reply_mode: dualReplyModeEnabled,
                    uses_macro: !!macroContext,
                    macro_name: macroName || 'none'
                });

                currentState = 'PROCESSING';
                ambientCore.className = 'state-processing';
                statusText.textContent = useWebGrounding ? "Grounding Search" : "Synthesizing";
                statusText.classList.add('pulse-text');
                
                const placeholder = document.createElement('div');
                placeholder.className = 'history-item placeholder';
                placeholder.style.opacity = '0';
                placeholder.textContent = promptText;
                placeholder.dataset.fullText = promptText;
                stack.appendChild(placeholder);
                
                // THE FIX: The "Pre-Calculation" Trick
                const prevScroll = stack.scrollTop; // Save current scroll position
                stack.scrollTop = stack.scrollHeight; // Snap to the end instantly
                const placeholderRect = placeholder.getBoundingClientRect(); // Grab exact final coordinates
                stack.scrollTop = prevScroll; // Instantly snap back to where we were
                
                // Now, trigger the smooth cinematic scroll
                stack.scrollTo({ top: stack.scrollHeight, behavior: 'smooth' });

                const rect = inputField.getBoundingClientRect();
                const clone = document.createElement('div');
                clone.innerText = promptText; 
                clone.style.position = 'absolute';
                clone.style.left = rect.left + 'px';
                clone.style.top = rect.top + 'px';
                clone.style.width = rect.width + 'px';
                clone.style.height = rect.height + 'px';
                clone.style.fontSize = window.getComputedStyle(inputField).fontSize;
                clone.style.fontFamily = window.getComputedStyle(inputField).fontFamily;
                clone.style.fontWeight = window.getComputedStyle(inputField).fontWeight;
                clone.style.lineHeight = window.getComputedStyle(inputField).lineHeight;
                clone.style.color = window.getComputedStyle(inputField).color;
                clone.style.textAlign = 'left';
                clone.style.whiteSpace = window.getComputedStyle(inputField).whiteSpace;
                clone.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                clone.style.transformOrigin = 'top left'; 
                clone.style.zIndex = '50';
                clone.style.pointerEvents = 'none';
                clone.id = 'active-query-clone';
                document.body.appendChild(clone);

                document.body.classList.add('state-reading');
                inputField.blur();

                clone.getBoundingClientRect(); // Force Reflow
                
                // Use the precise final coordinates we captured earlier!
                const moveX = placeholderRect.left - rect.left;
                const moveY = placeholderRect.top - rect.top;

                clone.style.transform = `translate(${moveX}px, ${moveY}px) scale(0.35)`;
                clone.style.opacity = '0.5';
                clone.style.color = 'var(--theme-color)';
                clone.style.whiteSpace = 'nowrap';
                clone.style.overflow = 'hidden';

                setTimeout(() => {
                    const activeClone = document.getElementById('active-query-clone');
                    if (activeClone) {
                        placeholder.style.transition = 'none';
                        placeholder.classList.remove('placeholder');
                        placeholder.style.opacity = '0.6'; 
                        void placeholder.offsetWidth;
                        placeholder.style.transition = '';
                        activeClone.remove();
                    }
                }, 1000);

                let response = '';
                try {
                    response = await callGeminiAPI(modelPromptText, {
                        useWebGrounding,
                        shouldUpdateWebSnapshot,
                        macroName,
                        macroContext
                    });
                } catch (error) {
                    const failureMessage = String(error?.message || error || 'chat_pipeline_failed')
                        .toLowerCase()
                        .replace(/[^a-z0-9_./-]/g, '_');
                    const fallbackResponse = "The AI model is temporarily unavailable right now. Please try again in a moment.";
                    response = dualReplyModeEnabled
                        ? normalizeDualReplyText(fallbackResponse, modelPromptText)
                        : fallbackResponse;
                    const lastRole = conversationHistory[conversationHistory.length - 1]?.role;
                    if (lastRole !== 'model') {
                        conversationHistory.push({ role: "model", parts: [{ text: response }] });
                    }
                    trackEvent('chat_response_pipeline_failed', {
                        uses_web_grounding: useWebGrounding,
                        reason: failureMessage
                    });
                    if (window.saveToArchive) {
                        window.saveToArchive().catch(e => {
                            trackEvent('chat_archive_save_failed');
                            console.error(e);
                        });
                    }
                    console.error("Chat response pipeline failed:", failureMessage);
                }
                trackEvent('chat_response_received', {
                    response_length: String(response || '').length,
                    uses_web_grounding: useWebGrounding,
                    grounded_source_count: Array.isArray(latestResponseMeta?.groundedSources) ? latestResponseMeta.groundedSources.length : 0
                });
                placeholder.dataset.response = response;
                displayResponse(response, false);
            }

            function executeDeleteReset() {
                trackEvent('chat_reset_triggered', { reset_type: 'delete' });
                currentState = 'PROCESSING';
                ambientCore.className = 'state-processing';
                statusText.textContent = "Connection Eradicated";
                statusText.classList.add('pulse-text');
                
                // Reverted to the sleek, contained mask animation
                stack.style.pointerEvents = 'none';
                stack.style.overflowY = 'hidden';

                const historyItems = Array.from(document.querySelectorAll('.history-item'));
                const totalItems = historyItems.length;

                historyItems.forEach((el, index) => {
                    const reverseIndex = totalItems - 1 - index;
                    const delay = reverseIndex * 0.08; // Super fast 80ms sequential drag
                    
                    el.style.transition = `all 0.6s cubic-bezier(0.5, 0, 0.75, 0) ${delay}s`;
                    el.style.transform = `translateY(80px)`; 
                    el.style.color = '#ff3333';
                    el.style.textShadow = '0 0 30px #ff0000'; 
                    el.style.opacity = '0';
                    el.style.filter = 'blur(10px) contrast(200%)';
                });

                const memoryFragments = Array.from(document.querySelectorAll('.memory-fragment'));
                memoryFragments.forEach(el => {
                    const delay = Math.random() * 0.3;
                    el.style.transition = `all 0.6s cubic-bezier(0.5, 0, 0.75, 0) ${delay}s`;
                    el.style.transform = `translateY(80px)`; 
                    el.style.color = '#ff3333';
                    el.style.opacity = '0';
                    el.style.filter = 'blur(10px) contrast(200%)';
                });

                inputField.style.transformOrigin = 'center center';
                inputField.style.transition = 'all 0.8s cubic-bezier(0.8, 0, 0.2, 1) 0.1s';
                inputField.style.transform = `scale(0) rotate(45deg)`;
                inputField.style.color = '#ff3333';
                inputField.style.textShadow = '0 0 30px #ff0000';
                inputField.style.opacity = '0';
                inputField.style.filter = 'blur(10px)';
                inputField.blur();

                const totalResetDelay = Math.max(1200, (totalItems * 80) + 800);

                setTimeout(() => {
                    conversationHistory = []; 
                    currentChatId = null;
                    webSnapshot = null;
                    lastWebQuery = '';
                    
                    stack.innerHTML = '';
                    memoryCanvas.innerHTML = '';
                    stack.style.pointerEvents = 'auto'; 
                    stack.style.overflowY = 'scroll';
                    
                    buildChatsMenu();
                    
                    inputField.style.transition = 'none';
                    inputField.style.transform = '';
                    inputField.style.letterSpacing = '';
                    inputField.style.color = '';
                    inputField.style.textShadow = '';
                    inputField.style.filter = '';
                    inputField.innerText = '';
                    inputField.style.opacity = '0'; 
                    
                    void inputField.offsetWidth; 
                    
                    inputField.style.transition = 'opacity 0.6s ease';
                    inputField.style.opacity = '1';
                    
                    currentState = 'INPUT';
                    statusText.textContent = "System Awaiting";
                    statusText.classList.remove('pulse-text');
                    inputField.focus();
                }, totalResetDelay); 
            }

            function executeVoidReset() {
                trackEvent('chat_reset_triggered', { reset_type: 'void' });
                currentState = 'PROCESSING';
                ambientCore.className = 'state-processing';
                statusText.textContent = "The Void Consumes";
                statusText.classList.add('pulse-text');
                
                stack.style.pointerEvents = 'none';
                stack.style.overflowY = 'hidden';

                const historyItems = Array.from(document.querySelectorAll('.history-item'));
                const totalItems = historyItems.length;

                historyItems.forEach((el, index) => {
                    const reverseIndex = totalItems - 1 - index;
                    const delay = reverseIndex * 0.08; 
                    
                    el.style.transition = `all 0.6s cubic-bezier(0.5, 0, 0.75, 0) ${delay}s`;
                    el.style.transform = `translateY(80px)`; 
                    el.style.color = 'var(--theme-color)'; 
                    el.style.textShadow = '0 0 20px var(--theme-color)'; 
                    el.style.opacity = '0';
                    el.style.filter = 'blur(10px)';
                });

                const memoryFragments = Array.from(document.querySelectorAll('.memory-fragment'));
                memoryFragments.forEach(el => {
                    const delay = Math.random() * 0.3;
                    el.style.transition = `all 0.6s cubic-bezier(0.5, 0, 0.75, 0) ${delay}s`;
                    el.style.transform = `translateY(80px)`; 
                    el.style.color = 'var(--theme-color)'; 
                    el.style.textShadow = '0 0 20px var(--theme-color)'; 
                    el.style.opacity = '0';
                    el.style.filter = 'blur(10px)';
                });

                inputField.style.transition = 'all 0.6s cubic-bezier(0.5, 0, 0.75, 0)';
                inputField.style.transform = 'translateY(150px)';
                inputField.style.letterSpacing = '1em'; 
                inputField.style.color = 'var(--theme-color)';
                inputField.style.textShadow = '0 0 20px var(--theme-color)';
                inputField.style.opacity = '0';
                inputField.style.filter = 'blur(12px)';
                inputField.blur();

                const totalResetDelay = Math.max(1200, (totalItems * 80) + 800);

                setTimeout(() => {
                    conversationHistory = []; 
                    currentChatId = null;
                    webSnapshot = null;
                    lastWebQuery = '';
                    
                    stack.innerHTML = '';
                    memoryCanvas.innerHTML = '';
                    stack.style.pointerEvents = 'auto';
                    stack.style.overflowY = 'scroll';
                    
                    buildChatsMenu();
                    
                    inputField.style.transition = 'none';
                    inputField.style.transform = '';
                    inputField.style.letterSpacing = '';
                    inputField.style.color = '';
                    inputField.style.textShadow = '';
                    inputField.style.filter = '';
                    inputField.innerText = '';
                    inputField.style.opacity = '0'; 
                    
                    void inputField.offsetWidth; 
                    
                    inputField.style.transition = 'opacity 0.6s ease';
                    inputField.style.opacity = '1';
                    
                    currentState = 'INPUT';
                    statusText.textContent = "System Awaiting";
                    statusText.classList.remove('pulse-text');
                    inputField.focus();
                }, totalResetDelay); 
            }

            async function callGeminiAPI(query, options = {}) {
                const useWebGrounding = !!options.useWebGrounding;
                const shouldUpdateWebSnapshot = !!options.shouldUpdateWebSnapshot;
                const macroName = normalizeMacroName(options.macroName || '');
                const rawMacroContext = options.macroContext && typeof options.macroContext === 'object'
                    ? options.macroContext
                    : null;
                const macroContext = rawMacroContext
                    ? {
                        prompt: sanitizeMacroText(rawMacroContext.prompt, 1200),
                        tone: sanitizeMacroText(rawMacroContext.tone, 300),
                        format: sanitizeMacroText(rawMacroContext.format, 300)
                    }
                    : null;
                const persistModelReply = (textValue) => {
                    const safeText = String(textValue || '').trim();
                    if (!safeText) return;
                    conversationHistory.push({ role: "model", parts: [{ text: safeText }] });
                    if (window.saveToArchive) {
                        window.saveToArchive().catch(e => {
                            trackEvent('chat_archive_save_failed');
                            console.error(e);
                        });
                    }
                };
                const activeSnapshotForThisTurn = !useWebGrounding ? getActiveWebSnapshot() : null;
                latestResponseMeta = {
                    usedCachedSnapshot: !!activeSnapshotForThisTurn,
                    snapshotAgeMinutes: activeSnapshotForThisTurn ? Math.max(1, Math.round((Date.now() - activeSnapshotForThisTurn.capturedAt) / 60000)) : 0,
                    groundedSources: []
                };
                trackEvent('chat_model_request_started', {
                    uses_web_grounding: useWebGrounding,
                    used_cached_snapshot: !!activeSnapshotForThisTurn,
                    dual_reply_mode: dualReplyModeEnabled,
                    uses_macro: !!macroContext,
                    macro_name: macroName || 'none'
                });
                conversationHistory.push({ role: "user", parts: [{ text: query }] });
                conversationHistory = conversationHistory.filter((entry) => {
                    if (entry?.role !== 'model') return true;
                    const text = String(entry?.parts?.[0]?.text || '').trim();
                    return !isLikelyPromptLeak(text);
                });
                
                // CRITICAL FIX: Grab the live local date and time from the browser
                const currentDate = new Date().toLocaleString('en-US', { 
                    weekday: 'long', year: 'numeric', month: 'long', 
                    day: 'numeric', hour: 'numeric', minute: 'numeric' 
                });
                
                // Inject it silently into the AI's brain
                const baseInstruction = personas[currentPersonaId].prompt;
                const webSnapshotInstruction = buildWebSnapshotInstruction();
                const identityInstruction = `If the user asks who you are, your name, or your identity, answer that you are ${ASSISTANT_IDENTITY_NAME}.`;
                const dualReplyInstruction = dualReplyModeEnabled
                    ? 'Dual reply mode is enabled for this turn. Return exactly two lanes in this order with plain text labels only: "Quick: <1-2 short sentences>" then "Deep: <fuller explanation>". Do not add extra headings.'
                    : '';
                const macroInstruction = macroContext ? buildMacroInstruction(macroName, macroContext) : '';
                const aiInstruction = `${baseInstruction} ${identityInstruction}${dualReplyInstruction ? ` ${dualReplyInstruction}` : ''}${macroInstruction ? ` ${macroInstruction}` : ''} The current local date and time for the user is ${currentDate}. Always use this if asked for the time or date.${webSnapshotInstruction ? `\n\n${webSnapshotInstruction}` : ''}`;
                
                const payload = {
                    contents: conversationHistory,
                    systemInstruction: { parts: [{ text: aiInstruction }] }
                };
                async function tryModelList(modelEntries, requestUsesWebGrounding) {
                    let lastStatusCode = 0;
                    let lastFailureMessage = '';
                    const attemptedModelIds = [];
                    const failedModelReasons = [];
                    let allFailuresAre403 = modelEntries.length > 0;

                    for (const modelEntry of modelEntries) {
                        const modelConfig = normalizeModelConfig(modelEntry);
                        const modelId = modelConfig.id;
                        attemptedModelIds.push(modelId);
                        let did429Retry = false;
                        let timeoutRetryCount = 0;
                        let transientStatusRetryCount = 0;

                        while (true) {
                            trackEvent('chat_model_attempt_started', {
                                uses_web_grounding: requestUsesWebGrounding,
                                model_id: modelId,
                                api_version: modelConfig.apiVersion,
                                retry_index: did429Retry ? 1 : 0
                            });

                            try {
                                const attemptPayload = {
                                    ...payload
                                };
                                if (requestUsesWebGrounding) {
                                    attemptPayload.tools = [{ google_search: {} }];
                                    if (ENABLE_MAP_GROUNDING) {
                                        attemptPayload.tools.push({ google_maps: {} });
                                    }
                                }

                                const requestResult = await fetchWithTimeout(buildModelGenerateContentUrl(modelConfig), {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(attemptPayload)
                                });
                                if (!requestResult.ok) {
                                    allFailuresAre403 = false;
                                    const reason = String(requestResult.reason || 'network_error');
                                    lastFailureMessage = `${modelId} -> ${reason}`;
                                    failedModelReasons.push(`${modelId}: ${reason}`);
                                    trackEvent('chat_model_attempt_failed', {
                                        uses_web_grounding: requestUsesWebGrounding,
                                        model_id: modelId,
                                        api_version: modelConfig.apiVersion,
                                        failure_reason: reason,
                                        timed_out: reason === 'request_timeout'
                                    });

                                    if ((reason === 'request_timeout' || reason === 'network_error') && timeoutRetryCount < CHAT_MAX_TIMEOUT_RETRIES) {
                                        timeoutRetryCount += 1;
                                        await waitForDelay(CHAT_RETRY_DELAY_MS * timeoutRetryCount);
                                        continue;
                                    }
                                    break;
                                }

                                const res = requestResult.response;

                                if (!res.ok) {
                                    lastStatusCode = res.status;
                                    lastFailureMessage = `${modelId} -> HTTP ${res.status}`;
                                    failedModelReasons.push(`${modelId}: HTTP ${res.status}`);
                                    trackEvent('chat_model_attempt_failed', {
                                        uses_web_grounding: requestUsesWebGrounding,
                                        model_id: modelId,
                                        api_version: modelConfig.apiVersion,
                                        status_code: res.status
                                    });

                                    if (res.status !== 403) {
                                        allFailuresAre403 = false;
                                    }

                                    if (res.status === 403) {
                                        break;
                                    }
                                    if (res.status === 429) {
                                        if (!did429Retry) {
                                            did429Retry = true;
                                            await waitForDelay(1500);
                                            continue;
                                        }
                                        break;
                                    }
                                    if ([408, 425, 500, 502, 503, 504].includes(res.status)) {
                                        if (transientStatusRetryCount < CHAT_MAX_TRANSIENT_HTTP_RETRIES) {
                                            transientStatusRetryCount += 1;
                                            await waitForDelay(CHAT_RETRY_DELAY_MS * transientStatusRetryCount);
                                            continue;
                                        }
                                        break;
                                    }
                                    break;
                                }

                                const result = await res.json();
                                const topCandidate = result.candidates?.[0] || {};
                                const textParts = topCandidate?.content?.parts?.map(part => part?.text || '').filter(Boolean) || [];
                                let aiText = sanitizeModelText((textParts.join('') || '').trim(), query);
                                if (dualReplyModeEnabled) {
                                    aiText = normalizeDualReplyText(aiText, query);
                                }

                                if (!aiText) {
                                    allFailuresAre403 = false;
                                    lastFailureMessage = `${modelId} -> empty_response`;
                                    failedModelReasons.push(`${modelId}: empty response`);
                                    trackEvent('chat_model_empty_response', {
                                        uses_web_grounding: requestUsesWebGrounding,
                                        model_id: modelId
                                    });
                                    break;
                                }

                                console.log(`Gemini request success model: ${modelId}`);
                                return {
                                    success: true,
                                    modelId,
                                    text: aiText,
                                    topCandidate
                                };
                            } catch (error) {
                                allFailuresAre403 = false;
                                const message = error instanceof Error ? error.message : String(error);
                                lastFailureMessage = `${modelId} -> ${message}`;
                                failedModelReasons.push(`${modelId}: ${message}`);
                                trackEvent('chat_model_attempt_failed', {
                                    uses_web_grounding: requestUsesWebGrounding,
                                    model_id: modelId,
                                    api_version: modelConfig.apiVersion,
                                    error_message: message
                                });
                                break;
                            }
                        }
                    }

                    return {
                        success: false,
                        lastStatusCode,
                        lastFailureMessage,
                        attemptedModelIds,
                        failedModelReasons,
                        allFailuresAre403
                    };
                }

                const webAttempt = useWebGrounding
                    ? await tryModelList(WEB_GROUNDED_MODELS, true)
                    : null;

                if (webAttempt?.success) {
                    persistModelReply(webAttempt.text);
                    trackEvent('chat_model_success', {
                        uses_web_grounding: true,
                        model_id: webAttempt.modelId,
                        api_version: DEFAULT_MODEL_API_VERSION
                    });
                    if (shouldUpdateWebSnapshot) {
                        updateWebSnapshot(query, webAttempt.text, webAttempt.topCandidate?.groundingMetadata);
                        latestResponseMeta.groundedSources = extractGroundedSources(webAttempt.topCandidate?.groundingMetadata);
                        trackEvent('web_snapshot_updated', {
                            source_count: latestResponseMeta.groundedSources.length
                        });
                    }
                    return webAttempt.text;
                }

                if (useWebGrounding && webAttempt?.allFailuresAre403) {
                    const generalAttempt = await tryModelList(GENERAL_CHAT_MODELS, false);
                    if (generalAttempt.success) {
                        const prefixedResponse = dualReplyModeEnabled
                            ? normalizeDualReplyText(`Search is currently restricted on this key, so this answer is from general knowledge.\n\n${generalAttempt.text}`, query)
                            : `Live search is unavailable right now, so I answered from general knowledge.\n\n${generalAttempt.text}`;
                        persistModelReply(prefixedResponse);
                        trackEvent('chat_model_success', {
                            uses_web_grounding: false,
                            model_id: generalAttempt.modelId,
                            api_version: DEFAULT_MODEL_API_VERSION,
                            source: 'web_fallback_to_general'
                        });
                        return prefixedResponse;
                    }
                    const combinedReasons = [
                        ...(webAttempt?.failedModelReasons || []),
                        ...(generalAttempt.failedModelReasons || [])
                    ];
                    const fallbackTextBase = `Live search is unavailable right now, and normal chat is also unavailable. Please try again in a moment.`;
                    const fallbackText = dualReplyModeEnabled
                        ? normalizeDualReplyText(fallbackTextBase, query)
                        : fallbackTextBase;
                    persistModelReply(fallbackText);
                    trackEvent('chat_model_failed', {
                        uses_web_grounding: false,
                        status_code: generalAttempt.lastStatusCode || webAttempt?.lastStatusCode || 0,
                        attempted_models: [...(webAttempt?.attemptedModelIds || []), ...generalAttempt.attemptedModelIds].join(','),
                        failed_model_reasons: combinedReasons.join(' | '),
                        source: 'web_fallback_to_general'
                    });
                    if (generalAttempt.lastFailureMessage || webAttempt?.lastFailureMessage) {
                        console.error("Chat request failed:", generalAttempt.lastFailureMessage || webAttempt?.lastFailureMessage);
                    }
                    return fallbackText;
                }

                const failedModels = useWebGrounding ? (webAttempt?.failedModelReasons || []) : [];
                const attemptedModels = useWebGrounding ? (webAttempt?.attemptedModelIds || []) : [];
                const fallbackAttempt = useWebGrounding ? null : await tryModelList(GENERAL_CHAT_MODELS, false);

                if (!useWebGrounding && fallbackAttempt?.success) {
                    persistModelReply(fallbackAttempt.text);
                    trackEvent('chat_model_success', {
                        uses_web_grounding: false,
                        model_id: fallbackAttempt.modelId,
                        api_version: DEFAULT_MODEL_API_VERSION
                    });
                    return fallbackAttempt.text;
                }

                const finalFailedModels = useWebGrounding ? failedModels : (fallbackAttempt?.failedModelReasons || []);
                const finalAttemptedModels = useWebGrounding ? attemptedModels : (fallbackAttempt?.attemptedModelIds || []);
                const finalStatusCode = useWebGrounding ? (webAttempt?.lastStatusCode || 0) : (fallbackAttempt?.lastStatusCode || 0);
                const finalFailureMessage = useWebGrounding ? webAttempt?.lastFailureMessage : fallbackAttempt?.lastFailureMessage;

                const finalFallbackTextBase = useWebGrounding
                    ? `Live web lookup is temporarily unavailable right now. Try /web again in a bit, or continue with normal chat.`
                    : `The AI model is temporarily unavailable right now. Please try again in a moment.`;
                const finalFallbackText = dualReplyModeEnabled
                    ? normalizeDualReplyText(finalFallbackTextBase, query)
                    : finalFallbackTextBase;

                persistModelReply(finalFallbackText);
                trackEvent('chat_model_failed', {
                    uses_web_grounding: useWebGrounding,
                    status_code: finalStatusCode,
                    attempted_models: finalAttemptedModels.join(','),
                    failed_model_reasons: finalFailedModels.join(' | ')
                });
                if (finalFailureMessage) {
                    console.error(useWebGrounding ? "Grounded request failed:" : "Chat request failed:", finalFailureMessage);
                }
                return finalFallbackText;
            }

            async function displayResponse(text, isFastRecall = false) {
                currentRenderToken++;
                const myToken = currentRenderToken;
                currentState = 'READING';
                ambientCore.className = 'state-reading';
                isTyping = true;
                statusText.textContent = "Press any key to continue";
                statusText.classList.remove('pulse-text');
                outputField.innerHTML = '';
                responseContainer.scrollTop = 0;
                if (isFastRecall) clearResponseMetaUI();
                else renderResponseMeta();
                const formattedText = formatResponseForDisplay(text);
                const tokens = formattedText.split(/(\n|[ \t]+)/).filter(token => token.length > 0);
                const usesStructuredLayout = formattedText.includes('\n') || formattedText.length > 260;
                outputField.classList.toggle('formatted-output', usesStructuredLayout);
                
                if (isFastRecall) {
                    let d = 0;
                    tokens.forEach(token => {
                        if (token === '\n') {
                            outputField.appendChild(document.createElement('br'));
                            d += 2;
                            return;
                        }
                        if (/^[ \t]+$/.test(token)) {
                            outputField.appendChild(document.createTextNode(' '));
                            d += 1;
                            return;
                        }
                        const s = document.createElement('span');
                        s.style.whiteSpace = 'nowrap';
                        token.split('').forEach(c => {
                            const l = document.createElement('span');
                            l.className = 'letter';
                            l.textContent = c; 
                            l.style.animationDelay = `${d * 0.005}s`;
                            l.style.animationDuration = '0.4s'; 
                            s.appendChild(l);
                            d++;
                        });
                        outputField.appendChild(s);
                        d++;
                    });
                    setTimeout(() => { checkScroll(); if (currentRenderToken === myToken) { isTyping = false; resetDecayTimer(); } }, 50);
                    return;
                }

                const delayMs = 25;
                for (let i = 0; i < tokens.length; i++) {
                    if (currentRenderToken !== myToken || currentState !== 'READING') return;
                    const token = tokens[i];

                    if (token === '\n') {
                        outputField.appendChild(document.createElement('br'));
                        checkScroll();
                        await new Promise(r => setTimeout(r, delayMs * 2));
                        continue;
                    }

                    if (/^[ \t]+$/.test(token)) {
                        outputField.appendChild(document.createTextNode(' '));
                        continue;
                    }

                    const s = document.createElement('span');
                    s.style.whiteSpace = 'nowrap';
                    outputField.appendChild(s);
                    const chars = token.split('');
                    for (let j = 0; j < chars.length; j++) {
                        if (currentRenderToken !== myToken || currentState !== 'READING') return;
                        const l = document.createElement('span');
                        l.className = 'letter';
                        l.textContent = chars[j];
                        l.style.animationDelay = '0s';
                        l.style.animationDuration = '0.8s';
                        s.appendChild(l);
                        if (responseContainer.scrollHeight - responseContainer.scrollTop <= responseContainer.clientHeight + 120) {
                            responseContainer.scrollTop = responseContainer.scrollHeight;
                        }
                        await new Promise(r => setTimeout(r, delayMs));
                    }
                    checkScroll();
                }
                if (currentRenderToken === myToken) { isTyping = false; resetDecayTimer(); }
            }

            function resetToInput() {
                currentRenderToken++;
                isTyping = false;
                clearTimeout(decayTimeout); 
                ambientCore.className = 'state-idle';
                resetResponseMeta();
                clearResponseMetaUI();
                outputField.style.transition = '';
                outputField.style.opacity = '';
                outputField.style.filter = '';
                outputField.style.transform = '';
                outputField.style.color = '';
                outputField.style.textShadow = '';
                outputField.classList.remove('formatted-output');
                if(outputField.innerText.trim() !== '') commitToMemory(outputField.innerText, false);
                currentState = 'INPUT';
                document.body.classList.remove('state-reading');
                statusText.textContent = "System Awaiting";
                scrollIndicator.style.opacity = '0'; 
                inputField.innerText = '';
                outputField.innerHTML = '';
            }

            function commitToMemory(text, isUser) {
                const frag = document.createElement('div');
                frag.className = 'memory-fragment';
                const s = Math.random() * 3 + 1; 
                frag.style.fontSize = `${s}rem`;
                frag.style.left = `${Math.random() * 100}%`;
                frag.style.top = `${Math.random() * 100}%`;
                frag.style.fontFamily = isUser ? '"Outfit", sans-serif' : '"Cinzel", serif';
                frag.style.opacity = isUser ? '0.02' : '0.04';
                frag.style.setProperty('--rot', `${Math.random() * 40 - 20}deg`);
                frag.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
                frag.style.setProperty('--dy', (Math.random() * 200 - 100) + 'px');
                frag.textContent = text.length > 50 ? text.substring(0, 50) + '...' : text;
                memoryCanvas.appendChild(frag);
                if(memoryCanvas.children.length > 15) memoryCanvas.removeChild(memoryCanvas.firstChild);
            }
        
}

