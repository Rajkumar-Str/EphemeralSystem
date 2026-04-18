import React, { useEffect, useRef, useState } from 'react';
import SystemCore from '../components/system-core';
import SystemUI from '../components/system-ui';
import MemoryCanvas from '../components/memory-canvas';
import ChatStage from '../components/chat-stage';
import ProfilePage from '../components/profile-page';
import PasswordResetPage from '../components/password-reset-page';
import { initLegacyEngine } from '../lib/legacy-engine';
import { getAnalyticsInstance, trackAnalyticsEvent } from '../lib/firebase-config';

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function normalizeUiToken(value: string, fallback: string): string {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function extractClassToken(target: Element): string {
  const rawClassName = typeof (target as HTMLElement).className === 'string'
    ? (target as HTMLElement).className
    : '';
  const firstClass = rawClassName.split(/\s+/).find(Boolean) || '';
  return normalizeUiToken(firstClass, 'none');
}

function findTrackedElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest(
    'button, a, [role="button"], input[type="button"], input[type="submit"], .clickable, .sys-indicator'
  ) as HTMLElement | null;
}

export default function Page() {
  const initialized = useRef(false);
  const [pathname, setPathname] = useState(() => {
    if (typeof window === 'undefined') return '/';
    return normalizePathname(window.location.pathname || '/');
  });

  const isProfileRoute = pathname === '/profile';
  const isAuthActionRoute = pathname === '/auth-action';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRouteChange = () => {
      setPathname(normalizePathname(window.location.pathname || '/'));
    };

    const emitLocationChange = () => window.dispatchEvent(new Event('locationchange'));
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = ((...args: Parameters<History['pushState']>) => {
      originalPushState(...args);
      emitLocationChange();
    }) as History['pushState'];

    window.history.replaceState = ((...args: Parameters<History['replaceState']>) => {
      originalReplaceState(...args);
      emitLocationChange();
    }) as History['replaceState'];

    window.addEventListener('popstate', emitLocationChange);
    window.addEventListener('locationchange', handleRouteChange);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', emitLocationChange);
      window.removeEventListener('locationchange', handleRouteChange);
    };
  }, []);

  useEffect(() => {
    // Initialize Firebase Analytics once in the browser.
    void getAnalyticsInstance();
  }, []);

  useEffect(() => {
    const bridgeWindow = window as Window & {
      __trackAnalyticsEvent?: (eventName: string, params?: Record<string, unknown>) => Promise<void>;
    };
    bridgeWindow.__trackAnalyticsEvent = trackAnalyticsEvent;

    return () => {
      if (bridgeWindow.__trackAnalyticsEvent === trackAnalyticsEvent) {
        delete bridgeWindow.__trackAnalyticsEvent;
      }
    };
  }, []);

  useEffect(() => {
    // Track route changes for SPA navigation visibility in Analytics.
    void trackAnalyticsEvent('route_change', {
      route_path: pathname,
      route_type: isProfileRoute ? 'profile' : isAuthActionRoute ? 'auth_action' : 'chat',
    });
  }, [pathname, isProfileRoute, isAuthActionRoute]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const interactive = findTrackedElement(event.target);
      if (!interactive) return;

      void trackAnalyticsEvent('ui_click', {
        route_path: pathname,
        element_tag: normalizeUiToken(interactive.tagName, 'unknown'),
        element_id: normalizeUiToken(interactive.id || '', 'none'),
        element_class: extractClassToken(interactive),
      });
    };

    const handleSubmit = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      void trackAnalyticsEvent('form_submit', {
        route_path: pathname,
        form_id: normalizeUiToken(event.target.id || event.target.getAttribute('name') || '', 'none'),
      });
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('submit', handleSubmit, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('submit', handleSubmit, true);
    };
  }, [pathname]);

  useEffect(() => {
    if (isProfileRoute || isAuthActionRoute) return;
    if (!initialized.current) {
      initialized.current = true;
      initLegacyEngine();
    }
  }, [isProfileRoute, isAuthActionRoute]);

  if (isProfileRoute) {
    return <ProfilePage />;
  }

  if (isAuthActionRoute) {
    return <PasswordResetPage />;
  }

  return (
    <div className="app-shell w-screen h-screen relative overflow-hidden">
      <SystemCore />
      <MemoryCanvas />
      <SystemUI />
      <div id="cinematic-tooltip"></div>
      <ChatStage />
    </div>
  );
}
