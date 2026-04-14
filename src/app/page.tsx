import React, { useEffect, useRef } from 'react';
import SystemCore from '../components/system-core';
import SystemUI from '../components/system-ui';
import MemoryCanvas from '../components/memory-canvas';
import ChatStage from '../components/chat-stage';
import { initLegacyEngine } from '../lib/legacy-engine';

export default function Page() {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initLegacyEngine();
    }
  }, []);

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-[#020101] text-[#EAEAEA]">
      <SystemCore />
      <MemoryCanvas />
      <SystemUI />
      <div id="cinematic-tooltip"></div>
      <ChatStage />
    </div>
  );
}
