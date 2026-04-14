import React from 'react';

export default function ChatStage() {
  return (
    <>
        <div id="stage">
            <div id="input-container">
                <div id="user-input" contentEditable="true" spellCheck="false"></div>
            </div>
            <div id="response-container">
                <div id="ai-output" className="ai-text"></div>
            </div>
            <div id="scroll-indicator">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
        </div>
        <div id="status-text">System Awaiting</div>
    </>
  );
}
