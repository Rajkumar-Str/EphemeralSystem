import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
            const authSignOutBtn = document.getElementById('auth-signout-btn');
            const authOpenProfileBtn = document.getElementById('auth-open-profile-btn');
            const authContinueChatBtn = document.getElementById('auth-continue-chat-btn');
            const authLoggedOutView = document.getElementById('auth-loggedout-view');
            const authLoggedInView = document.getElementById('auth-loggedin-view');
            const authEmailInput = document.getElementById('auth-email-input');
            const authPasswordInput = document.getElementById('auth-password-input');
            const authStatusText = document.getElementById('auth-status-text');
            const authUserText = document.getElementById('auth-user-text');
            const ambientCore = document.getElementById('ambient-core');
            const cinematicTooltip = document.getElementById('cinematic-tooltip');
            
            const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
            const apiKey = env.VITE_GEMINI_API_KEY || "API_KEY_PLACEHOLDER";
            const NORMAL_CHAT_MODEL = "gemini-3.1-flash-lite-preview";
            const WEB_GROUNDED_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
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

                if (authSignOutBtn) {
                    authSignOutBtn.disabled = !isSignedIn;
                }
                if (authOpenProfileBtn) {
                    authOpenProfileBtn.disabled = !isSignedIn;
                }
            }

            function updateAuthCardSelection(intent = 'signin') {
                pendingAuthIntent = intent === 'signup' ? 'signup' : 'signin';
                const isSignUp = pendingAuthIntent === 'signup';
                if (authSignInBtn) authSignInBtn.classList.toggle('selected', !isSignUp);
                if (authSignUpBtn) authSignUpBtn.classList.toggle('selected', isSignUp);
                if (authSubmitBtn) authSubmitBtn.textContent = isSignUp ? 'Create account' : 'Sign in';
            }

            function setAuthBusy(isBusy) {
                const isSignedIn = !!(user && !user.isAnonymous);
                if (authEmailInput) authEmailInput.disabled = isBusy;
                if (authPasswordInput) authPasswordInput.disabled = isBusy;
                if (authSubmitBtn) authSubmitBtn.disabled = isBusy;
                if (authSignInBtn) authSignInBtn.disabled = isBusy;
                if (authSignUpBtn) authSignUpBtn.disabled = isBusy;
                if (authSignOutBtn) authSignOutBtn.disabled = isBusy || !isSignedIn;
                if (authOpenProfileBtn) authOpenProfileBtn.disabled = isBusy || !isSignedIn;
                if (authContinueChatBtn) authContinueChatBtn.disabled = isBusy;
            }

            function readAuthCredentials() {
                const email = authEmailInput ? String(authEmailInput.value || '').trim() : '';
                const password = authPasswordInput ? String(authPasswordInput.value || '').trim() : '';
                return { email, password };
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
                    setAuthStatus(`Signed in as ${user.email || 'account'}.`, 'success');
                } else {
                    setAuthStatus('');
                }
                toggleOverlay(authOverlay);
                updateAuthSessionUI();
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
                if (password.length < 6) {
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
                        setAuthStatus('Account created and signed in.', 'success');
                    } else {
                        credential = await signInWithEmailAndPassword(auth, email, password);
                        setAuthStatus('Signed in successfully.', 'success');
                    }

                    if (authPasswordInput) authPasswordInput.value = '';
                    updateAuthSessionUI();
                    trackEvent('auth_submit_success', {
                        auth_intent: pendingAuthIntent === 'signup' ? 'signup' : 'signin'
                    });

                    const signedInUser = credential?.user;
                    if (signedInUser && !signedInUser.isAnonymous) {
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

            function formatResponseForDisplay(rawText) {
                let text = String(rawText || '')
                    .replace(/\r\n/g, '\n')
                    .replace(/[ \t]+\n/g, '\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();

                // If the model returned a long block without line breaks, split by sentences.
                if (!text.includes('\n') && text.length > 220) {
                    text = text.replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1\n');
                }

                // Improve readability for inline numbered lists.
                text = text
                    .replace(/\s+(\d+\.)\s+/g, '\n$1 ')
                    .replace(/\s+([-*•])\s+/g, '\n$1 ');

                return text;
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

            if (authSignOutBtn) {
                authSignOutBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await signOutAuthUser();
                });
            }

            if (authOpenProfileBtn) {
                authOpenProfileBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
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
                let useWebGrounding = false;
                let shouldUpdateWebSnapshot = false;
                let usedRefreshWebCommand = false;

                if (queryText === '/web') {
                    trackEvent('command_executed', { command_name: 'web_invalid' });
                    inputField.innerText = '';
                    await showCommandResponse("Usage: /web <question>. Example: /web latest ai news today");
                    return;
                }

                if (queryText.startsWith('/web ')) {
                    trackEvent('command_executed', { command_name: 'web' });
                    promptText = rawText.substring(5).trim();
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

                // Initialize a new chat session if none exists
                if (!currentChatId) {
                    currentChatId = Date.now().toString();
                    buildChatsMenu(); // show it in menu immediately
                    trackEvent('chat_session_created');
                }

                trackEvent('chat_prompt_submitted', {
                    prompt_length: promptText.length,
                    uses_web_grounding: useWebGrounding,
                    uses_refresh_command: usedRefreshWebCommand
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

                const response = await callGeminiAPI(promptText, {
                    useWebGrounding,
                    shouldUpdateWebSnapshot
                });
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
                const candidateModels = useWebGrounding ? WEB_GROUNDED_MODELS : [NORMAL_CHAT_MODEL];
                const activeSnapshotForThisTurn = !useWebGrounding ? getActiveWebSnapshot() : null;
                latestResponseMeta = {
                    usedCachedSnapshot: !!activeSnapshotForThisTurn,
                    snapshotAgeMinutes: activeSnapshotForThisTurn ? Math.max(1, Math.round((Date.now() - activeSnapshotForThisTurn.capturedAt) / 60000)) : 0,
                    groundedSources: []
                };
                trackEvent('chat_model_request_started', {
                    uses_web_grounding: useWebGrounding,
                    used_cached_snapshot: !!activeSnapshotForThisTurn
                });
                conversationHistory.push({ role: "user", parts: [{ text: query }] });
                
                // CRITICAL FIX: Grab the live local date and time from the browser
                const currentDate = new Date().toLocaleString('en-US', { 
                    weekday: 'long', year: 'numeric', month: 'long', 
                    day: 'numeric', hour: 'numeric', minute: 'numeric' 
                });
                
                // Inject it silently into the AI's brain
                const baseInstruction = personas[currentPersonaId].prompt;
                const webSnapshotInstruction = buildWebSnapshotInstruction();
                const aiInstruction = `${baseInstruction} The current local date and time for the user is ${currentDate}. Always use this if asked for the time or date.${webSnapshotInstruction ? `\n\n${webSnapshotInstruction}` : ''}`;
                
                const payload = {
                    contents: conversationHistory,
                    systemInstruction: { parts: [{ text: aiInstruction }] }
                };
                if (useWebGrounding) {
                    // Keep map grounding explicitly disabled for now.
                    payload.tools = [{ google_search: {} }];
                    if (ENABLE_MAP_GROUNDING) {
                        payload.tools.push({ google_maps: {} });
                    }
                }

                let lastStatusCode = 0;
                let lastFailureMessage = '';
                const retryBackoffMs = [1000, 2000, 4000];
                
                for (const modelId of candidateModels) {
                    let retries = 0;
                    while (retries <= retryBackoffMs.length) {
                        try {
                            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            });
                            if (!res.ok) {
                                lastStatusCode = res.status;
                                lastFailureMessage = `${modelId} -> HTTP ${res.status}`;
                                if (res.status === 429 || res.status === 404 || res.status === 400 || res.status === 401 || res.status === 403) {
                                    break;
                                }
                                if ([408, 500, 502, 503, 504].includes(res.status) && retries < retryBackoffMs.length) {
                                    await new Promise(r => setTimeout(r, retryBackoffMs[retries++]));
                                    continue;
                                }
                                break;
                            }
                            const result = await res.json();
                            const topCandidate = result.candidates?.[0] || {};
                            const textParts = topCandidate?.content?.parts?.map(part => part?.text || '').filter(Boolean) || [];
                            const aiText = (textParts.join('') || '').trim();
                            if (!aiText) {
                                const emptyText = useWebGrounding
                                    ? "Grounded web request returned no readable text. Try /refreshweb or ask a narrower question."
                                    : "The model returned an empty answer. Please try again.";
                                conversationHistory.push({ role: "model", parts: [{ text: emptyText }] });
                                trackEvent('chat_model_empty_response', {
                                    uses_web_grounding: useWebGrounding,
                                    model_id: modelId
                                });
                                return emptyText;
                            }
                            conversationHistory.push({ role: "model", parts: [{ text: aiText }] });
                            trackEvent('chat_model_success', {
                                uses_web_grounding: useWebGrounding,
                                model_id: modelId
                            });
                            if (useWebGrounding && shouldUpdateWebSnapshot) {
                                updateWebSnapshot(query, aiText, topCandidate?.groundingMetadata);
                                latestResponseMeta.groundedSources = extractGroundedSources(topCandidate?.groundingMetadata);
                                trackEvent('web_snapshot_updated', {
                                    source_count: latestResponseMeta.groundedSources.length
                                });
                            }
                            
                            // Fire off the background save to Archives
                            if (window.saveToArchive) {
                                window.saveToArchive().catch(e => {
                                    trackEvent('chat_archive_save_failed');
                                    console.error(e);
                                });
                            }
                            
                            return aiText;
                        } catch (e) {
                            const message = e instanceof Error ? e.message : String(e);
                            lastFailureMessage = `${modelId} -> ${message}`;
                            const isNetworkError = /Failed to fetch|NetworkError|Load failed|fetch/i.test(message);
                            if (isNetworkError && retries < retryBackoffMs.length) {
                                await new Promise(r => setTimeout(r, retryBackoffMs[retries++]));
                                continue;
                            }
                            break;
                        }
                    }
                }
                
                if (useWebGrounding) {
                    const webFallbackText = lastStatusCode === 429
                        ? "Live web lookup hit Gemini 2.5 free-tier limits right now. Wait for quota reset, or continue with normal chat."
                        : lastStatusCode === 503
                            ? "Live web lookup is temporarily overloaded right now. Try /refreshweb again in a minute."
                            : lastStatusCode === 404
                                ? "Current grounded model is unavailable for this key/project. Switch to another supported grounded model."
                                : "Live web lookup is temporarily unavailable right now. Try /web again in a bit, or continue with normal chat.";
                    conversationHistory.push({ role: "model", parts: [{ text: webFallbackText }] });
                    trackEvent('chat_model_failed', {
                        uses_web_grounding: true,
                        status_code: lastStatusCode || 0
                    });
                    if (lastFailureMessage) console.error("Grounded request failed:", lastFailureMessage);
                    return webFallbackText;
                }

                const chatFallbackText = lastStatusCode === 429
                    ? "Chat model quota is exhausted right now. Wait for reset, then try again."
                    : lastStatusCode === 503
                        ? "Chat model is temporarily overloaded. Please try again in a minute."
                        : lastStatusCode === 404
                            ? "Configured chat model is unavailable for this key/project."
                            : "The AI model is temporarily unavailable right now. Please try again in a moment.";
                conversationHistory.push({ role: "model", parts: [{ text: chatFallbackText }] });
                trackEvent('chat_model_failed', {
                    uses_web_grounding: false,
                    status_code: lastStatusCode || 0
                });
                if (lastFailureMessage) console.error("Chat request failed:", lastFailureMessage);
                return chatFallbackText;
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
