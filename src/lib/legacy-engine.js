import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export function initLegacyEngine() {
        
            const inputField = document.getElementById('user-input');
            const outputField = document.getElementById('ai-output');
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
            
            const toneList = document.getElementById('tone-list');
            const chatsList = document.getElementById('chats-list');
            const ambientCore = document.getElementById('ambient-core');
            const cinematicTooltip = document.getElementById('cinematic-tooltip');
            
            const apiKey = "API_KEY_PLACEHOLDER"; 
            const fallbackFirebaseConfig = {
                apiKey: "API_KEY_PLACEHOLDER",
                authDomain: "FIREBASE_AUTH_DOMAIN_PLACEHOLDER",
                databaseURL: "FIREBASE_DATABASE_URL_PLACEHOLDER",
                projectId: "FIREBASE_PROJECT_ID_PLACEHOLDER",
                storageBucket: "FIREBASE_STORAGE_BUCKET_PLACEHOLDER",
                messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER",
                appId: "FIREBASE_APP_ID_PLACEHOLDER",
                measurementId: "FIREBASE_MEASUREMENT_ID_PLACEHOLDER"
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

            // --- Persistent Storage (Firebase Initialization) ---
            let user = null;
            let archives = [];
            
            try {
                const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : fallbackFirebaseConfig;
                if (firebaseConfig) {
                    const app = initializeApp(firebaseConfig);
                    const auth = getAuth(app);
                    const db = getFirestore(app);
                    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

                    const initAuth = async () => {
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            await signInWithCustomToken(auth, __initial_auth_token);
                        } else {
                            await signInAnonymously(auth);
                        }
                    };
                    initAuth();

                    onAuthStateChanged(auth, (u) => {
                        user = u;
                        if (user) {
                            const chatsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'chats');
                            onSnapshot(chatsRef, (snapshot) => {
                                archives = [];
                                snapshot.forEach(d => archives.push({ id: d.id, ...d.data() }));
                                archives.sort((a, b) => b.updatedAt - a.updatedAt);
                                buildChatsMenu();
                            }, (error) => console.error("Archive sync error:", error));
                        }
                    });
                    
                    window.saveToArchive = async function() {
                        if (!user || !currentChatId || conversationHistory.length === 0) return;
                        let title = conversationHistory[0].parts[0].text.substring(0, 30);
                        if (conversationHistory[0].parts[0].text.length > 30) title += '...';
                        
                        const existing = archives.find(c => c.id === currentChatId);
                        if (existing && existing.title) title = existing.title;

                        const chatRef = doc(db, 'artifacts', appId, 'users', user.uid, 'chats', currentChatId);
                        const cleanHistory = JSON.parse(JSON.stringify(conversationHistory));

                        await setDoc(chatRef, {
                            title: title,
                            history: cleanHistory,
                            updatedAt: Date.now()
                        }, { merge: true });
                    };

                    window.deleteFromArchive = async function(id) {
                        if (!user || !id) return;
                        const chatRef = doc(db, 'artifacts', appId, 'users', user.uid, 'chats', id);
                        await deleteDoc(chatRef);
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
                    if (conversationHistory.length > 0) executeVoidReset(); 
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
                        loadArchivedChat(chat.id); 
                    };
                    chatsList.appendChild(item);
                });
            }

            function setPersona(id) {
                if (!personas[id]) return;
                currentPersonaId = id;
                ambientCore.className = 'state-typing';
                setTimeout(() => { if (currentState === 'INPUT') ambientCore.className = 'state-idle'; }, 2000);
            }

            buildToneMenu();
            buildChatsMenu();
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
                const isActive = overlayElement.classList.contains('active');
                if (!isActive) {
                    closeOverlays();
                    overlayElement.classList.add('active');
                    if (indicatorElement) {
                        indicatorElement.innerText = 'X';
                        indicatorElement.style.opacity = '1';
                        indicatorElement.style.color = 'var(--theme-color)';
                    }
                    inputField.blur();
                } else {
                    closeOverlays();
                    if (currentState === 'INPUT') setTimeout(() => inputField.focus(), 10);
                }
            }

            function closeOverlays() {
                helpOverlay.classList.remove('active');
                toneOverlay.classList.remove('active');
                chatsOverlay.classList.remove('active');

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

            helpOverlay.addEventListener('click', closeOverlays);
            toneOverlay.addEventListener('click', closeOverlays);
            chatsOverlay.addEventListener('click', closeOverlays);

            document.body.addEventListener('click', (e) => {
                if (helpOverlay.classList.contains('active') || toneOverlay.classList.contains('active') || chatsOverlay.classList.contains('active')) return;
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
                const overlaysActive = helpOverlay.classList.contains('active') || toneOverlay.classList.contains('active') || chatsOverlay.classList.contains('active');
                if (overlaysActive) {
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
                const queryText = text.trim().toLowerCase();
                if (queryText === '/help') { inputField.innerText = ''; toggleOverlay(helpOverlay, helpIndicator); return; }
                if (queryText === '/tone') { inputField.innerText = ''; toggleOverlay(toneOverlay); return; }
                if (queryText === '/chats') { inputField.innerText = ''; toggleOverlay(chatsOverlay, chatsIndicator); return; }
                if (queryText === '/void') { executeVoidReset(); return; }
                if (queryText === '/del') { 
                    if (currentChatId && window.deleteFromArchive) window.deleteFromArchive(currentChatId);
                    executeDeleteReset(); 
                    return; 
                }

                // Initialize a new chat session if none exists
                if (!currentChatId) {
                    currentChatId = Date.now().toString();
                    buildChatsMenu(); // show it in menu immediately
                }

                currentState = 'PROCESSING';
                ambientCore.className = 'state-processing';
                statusText.textContent = "Synthesizing";
                statusText.classList.add('pulse-text');
                
                const placeholder = document.createElement('div');
                placeholder.className = 'history-item placeholder';
                placeholder.style.opacity = '0';
                placeholder.textContent = text;
                placeholder.dataset.fullText = text;
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
                clone.innerText = inputField.innerText; 
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

                const response = await callGeminiAPI(text);
                placeholder.dataset.response = response;
                displayResponse(response, false);
            }

            function executeDeleteReset() {
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

            async function callGeminiAPI(query) {
                conversationHistory.push({ role: "user", parts: [{ text: query }] });
                
                // CRITICAL FIX: Grab the live local date and time from the browser
                const currentDate = new Date().toLocaleString('en-US', { 
                    weekday: 'long', year: 'numeric', month: 'long', 
                    day: 'numeric', hour: 'numeric', minute: 'numeric' 
                });
                
                // Inject it silently into the AI's brain
                const baseInstruction = personas[currentPersonaId].prompt;
                const aiInstruction = `${baseInstruction} The current local date and time for the user is ${currentDate}. Always use this if asked for the time or date.`;
                
                const payload = {
                    contents: conversationHistory,
                    systemInstruction: { parts: [{ text: aiInstruction }] }
                };
                
                let retries = 0;
                while (retries <= 5) {
                    try {
                        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (!res.ok) throw new Error();
                        const result = await res.json();
                        const aiText = result.candidates?.[0]?.content?.parts?.[0]?.text || "The void remains.";
                        conversationHistory.push({ role: "model", parts: [{ text: aiText }] });
                        
                        // Fire off the background save to Archives
                        if (window.saveToArchive) {
                            window.saveToArchive().catch(e => console.error(e));
                        }
                        
                        return aiText;
                    } catch (e) { 
                        await new Promise(r => setTimeout(r, [1000, 2000, 4000, 8000, 16000][retries++])); 
                    }
                }
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
                const words = text.split(' ');
                
                if (isFastRecall) {
                    let d = 0;
                    words.forEach(w => {
                        const s = document.createElement('span');
                        s.style.whiteSpace = 'nowrap';
                        w.split('').forEach(c => {
                            const l = document.createElement('span');
                            l.className = 'letter';
                            l.textContent = c; 
                            l.style.animationDelay = `${d * 0.005}s`;
                            l.style.animationDuration = '0.4s'; 
                            s.appendChild(l); d++;
                        });
                        outputField.appendChild(s);
                        outputField.appendChild(document.createTextNode(' ')); d++;
                    });
                    setTimeout(() => { checkScroll(); if (currentRenderToken === myToken) { isTyping = false; resetDecayTimer(); } }, 50);
                    return;
                }
                const delayMs = 25; 
                for (let i = 0; i < words.length; i++) {
                    if (currentRenderToken !== myToken || currentState !== 'READING') return;
                    const word = words[i];
                    const s = document.createElement('span');
                    s.style.whiteSpace = 'nowrap'; outputField.appendChild(s);
                    const chars = word.split('');
                    for (let j = 0; j < chars.length; j++) {
                        if (currentRenderToken !== myToken || currentState !== 'READING') return;
                        const l = document.createElement('span');
                        l.className = 'letter'; l.textContent = chars[j]; 
                        l.style.animationDelay = '0s'; l.style.animationDuration = '0.8s'; 
                        s.appendChild(l);
                        if (responseContainer.scrollHeight - responseContainer.scrollTop <= responseContainer.clientHeight + 120) { responseContainer.scrollTop = responseContainer.scrollHeight; }
                        await new Promise(r => setTimeout(r, delayMs));
                    }
                    outputField.appendChild(document.createTextNode(' '));
                    await new Promise(r => setTimeout(r, delayMs));
                    checkScroll();
                }
                if (currentRenderToken === myToken) { isTyping = false; resetDecayTimer(); }
            }

            function resetToInput() {
                currentRenderToken++;
                isTyping = false;
                clearTimeout(decayTimeout); 
                ambientCore.className = 'state-idle';
                outputField.style.transition = '';
                outputField.style.opacity = '';
                outputField.style.filter = '';
                outputField.style.transform = '';
                outputField.style.color = '';
                outputField.style.textShadow = '';
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
