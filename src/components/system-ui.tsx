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
                        <div className="overlay-cmd" style={{textAlign: 'right'}}>/help</div>
                        <div className="overlay-desc">Reveal this index of directives.</div>
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
    </>
  );
}
