import React, { useEffect, useRef, useState } from 'react';
import SystemCore from '../components/system-core';
import SystemUI from '../components/system-ui';
import MemoryCanvas from '../components/memory-canvas';
import ChatStage from '../components/chat-stage';
import ProfilePage from '../components/profile-page';
import { initLegacyEngine } from '../lib/legacy-engine';

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export default function Page() {
  const initialized = useRef(false);
  const [pathname, setPathname] = useState(() => {
    if (typeof window === 'undefined') return '/';
    return normalizePathname(window.location.pathname || '/');
  });

  const isProfileRoute = pathname === '/profile';

  useEffect(() => {
    const handleRouteChange = () => {
      setPathname(normalizePathname(window.location.pathname || '/'));
    };

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  useEffect(() => {
    if (isProfileRoute) return;
    if (!initialized.current) {
      initialized.current = true;
      initLegacyEngine();
    }
  }, [isProfileRoute]);

  if (isProfileRoute) {
    return <ProfilePage />;
  }

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