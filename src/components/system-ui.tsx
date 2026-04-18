import React from 'react';

export default function SystemUI() {
  return (
    <>
        <div id="controls-container">
            <div id="chats-indicator" className="sys-indicator">/chats</div>
            <div id="help-indicator" className="sys-indicator">/help</div>
        </div>
        
        <div id="chats-overlay" className="system-overlay">
            <div className="overlay-content">
                <div className="overlay-title">SYSTEM ARCHIVES</div>
                <div className="overlay-list" id="chats-list"></div>
            </div>
        </div>

        <div id="help-overlay" className="system-overlay">
            <div className="overlay-content">
                <div className="overlay-title">SYSTEM DIRECTIVES</div>
                <div className="overlay-list">
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/chats</div>
                        <div className="overlay-desc">Access the archives of past sessions.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/tone</div>
                        <div className="overlay-desc">Shift the system's operational persona.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/dual</div>
                        <div className="overlay-desc">Check dual reply mode status (Quick + Deep lanes).</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/dual on | /dual off</div>
                        <div className="overlay-desc">Enable or disable two-lane responses in one turn.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/help</div>
                        <div className="overlay-desc">Reveal this index of directives.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/auth</div>
                        <div className="overlay-desc">Open account access card with Sign in and Sign up.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/profile</div>
                        <div className="overlay-desc">Jump directly to your full profile page.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/web</div>
                        <div className="overlay-desc">Fetch live web-grounded data for one query.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/refreshweb</div>
                        <div className="overlay-desc">Refresh the most recent grounded web query.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/webstatus</div>
                        <div className="overlay-desc">Inspect the current cached web snapshot.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/webclear</div>
                        <div className="overlay-desc">Erase cached web snapshot memory.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/void</div>
                        <div className="overlay-desc">Shatter reality and start a new session.</div>
                    </div>
                    <div className="overlay-item">
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/del</div>
                        <div className="overlay-desc">Eradicate the current session permanently.</div>
                    </div>
                </div>
            </div>
        </div>

        <div id="tone-overlay" className="system-overlay">
            <div className="overlay-content">
                <div className="overlay-title">SYSTEM PERSONA</div>
                <div className="overlay-list" id="tone-list"></div>
            </div>
        </div>

        <div id="auth-overlay" className="system-overlay">
            <div className="auth-card">
                <div className="auth-card-title">ACCOUNT ACCESS</div>
                <div className="auth-card-subtitle">Use email and password to save chats to your account.</div>

                <div id="auth-loggedout-view">
                    <div className="auth-card-actions">
                        <button id="auth-signin-btn" className="auth-card-btn selected" type="button">Sign in</button>
                        <button id="auth-signup-btn" className="auth-card-btn" type="button">Sign up</button>
                    </div>
                    <div className="auth-card-fields">
                        <label className="auth-field-label" htmlFor="auth-email-input">Email</label>
                        <input id="auth-email-input" className="auth-field-input" type="email" autoComplete="email" />
                        <label className="auth-field-label" htmlFor="auth-password-input">Password</label>
                        <input id="auth-password-input" className="auth-field-input" type="password" autoComplete="current-password" />
                        <div id="auth-password-strength-wrap" className="auth-password-strength auth-view-hidden">
                            <div className="auth-password-strength-row">
                                <span>Password strength</span>
                                <span id="auth-password-strength-label">Very weak</span>
                            </div>
                            <div className="auth-password-meter-track">
                                <div id="auth-password-meter-fill" className="auth-password-meter-fill"></div>
                            </div>
                            <div id="auth-password-policy-hints" className="auth-password-policy-hints"></div>
                        </div>
                        <button id="auth-forgot-password-btn" className="auth-link-btn" type="button">Forgot password?</button>
                    </div>
                    <div className="auth-card-cta-row">
                        <button id="auth-submit-btn" className="auth-card-btn auth-card-btn-primary" type="button">Sign in</button>
                        <button id="auth-google-signin-btn" className="auth-card-btn auth-card-btn-google" type="button">Google</button>
                    </div>
                </div>

                <div id="auth-loggedin-view" className="auth-view-hidden">
                    <div className="auth-loggedin-summary">
                        <p className="auth-loggedin-title">You are already signed in.</p>
                        <div id="auth-user-text" className="auth-user-text"></div>
                        <div id="auth-verification-text" className="auth-verification-text"></div>
                        <button id="auth-resend-verification-btn" className="auth-link-btn auth-link-btn-inline auth-view-hidden" type="button">
                            Resend verification email
                        </button>
                    </div>
                    <div className="auth-card-cta-row auth-card-cta-row-loggedin">
                        <button id="auth-open-profile-btn" className="auth-card-btn auth-card-btn-primary" type="button">Open profile</button>
                        <button id="auth-signout-btn" className="auth-card-btn auth-card-btn-ghost" type="button">Sign out</button>
                    </div>
                    <button id="auth-continue-chat-btn" className="auth-card-btn" type="button">Continue chat</button>
                </div>

                <div id="auth-status-text" className="auth-status-text"></div>
            </div>
        </div>
    </>
  );
}
