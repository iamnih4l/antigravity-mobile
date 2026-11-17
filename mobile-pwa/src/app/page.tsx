'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AntigravityCompanionClient, DesktopStatus } from '@/lib/companion-client';
import { LiveDesktopWorkspace } from '@/components/LiveDesktopWorkspace';
import { ConnectionSettingsModal } from '@/components/ConnectionSettingsModal';

export default function Home() {
  const [isOnline, setIsOnline] = useState(false);
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [activeBaseUrl, setActiveBaseUrl] = useState<string>('');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);

  const clientRef = useRef<AntigravityCompanionClient | null>(null);

  const resolveInitialConnection = () => {
    let url = process.env.NEXT_PUBLIC_COMPANION_URL || '';
    let token: string | null = null;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const endpointParam = params.get('endpoint');
      const tokenParam = params.get('token');

      if (endpointParam) {
        url = endpointParam.trim().replace(/\/+$/, '');
        localStorage.setItem('agm_companion_url', url);
      } else {
        url = localStorage.getItem('agm_companion_url') || url;
      }

      if (tokenParam) {
        token = tokenParam.trim();
        localStorage.setItem('agm_token', token);
      } else {
        token = localStorage.getItem('agm_token');
      }

      // Clean sensitive token from URL bar after persisting locally
      if (endpointParam || tokenParam) {
        try {
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch {}
      }

      if (!url) {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          url = 'http://127.0.0.1:8787';
        }
      }
    }

    return { url, token };
  };

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      const { url, token } = resolveInitialConnection();
      clientRef.current = new AntigravityCompanionClient({
        baseUrl: url || 'http://127.0.0.1:8787',
        token: token || undefined,
        onStatusChange: (online) => setIsOnline(online),
      });
      setActiveBaseUrl(url || '');
      setAuthToken(token);
    }
    return clientRef.current;
  }, []);

  const refreshDesktopStatus = useCallback(async () => {
    const client = getClient();
    if (!client.baseUrl) return;
    try {
      const health = (await client.getHealth()) as any;
      setIsOnline(health.status === 'online');
      if (health.authRequired && !health.authenticated) {
        setIsUnauthorized(true);
        return;
      }
      setIsUnauthorized(false);
      const desk = await client.getDesktopStatus();
      setDesktopStatus(desk);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('unauthorized') || msg.includes('401')) {
        setIsOnline(true);
        setIsUnauthorized(true);
      } else {
        setIsOnline(false);
      }
    }
  }, [getClient]);

  const handleSaveConnection = async (
    rawUrl: string,
    newToken?: string
  ): Promise<{ ok: boolean; message?: string }> => {
    let cleanUrl = rawUrl.trim().replace(/\/+$/, '').replace(/\/api\/health$/, '');
    if (!cleanUrl) return { ok: false, message: 'URL cannot be empty.' };

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      cleanUrl.startsWith('http://') &&
      !cleanUrl.includes('localhost') &&
      !cleanUrl.includes('127.0.0.1')
    ) {
      return {
        ok: false,
        message: 'HTTPS web apps require an https:// tunnel URL (Cloudflare Tunnel).',
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const headers: Record<string, string> = {};
      if (newToken) headers.Authorization = `Bearer ${newToken}`;

      const res = await fetch(`${cleanUrl}/api/health`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { ok: false, message: `Server responded with HTTP ${res.status}` };
      }
      const data = await res.json();
      if (data.status === 'online') {
        if (data.authRequired && !data.authenticated) {
          return {
            ok: false,
            message: 'Session token invalid or missing. Scan the fresh QR code from "AG Mobile QR" in Antigravity IDE.',
          };
        }
        localStorage.setItem('agm_companion_url', cleanUrl);
        const client = getClient();
        client.setBaseUrl(cleanUrl);
        if (newToken !== undefined) {
          client.setToken(newToken || null);
          setAuthToken(newToken || null);
        }
        setActiveBaseUrl(cleanUrl);
        setIsOnline(true);
        setIsUnauthorized(false);
        refreshDesktopStatus();
        return { ok: true };
      }
      return { ok: false, message: 'Unexpected response from PC companion.' };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, message: 'Connection timed out (6s). Scan a fresh QR code from Antigravity IDE.' };
      }
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Network error',
      };
    }
  };

  useEffect(() => {
    const client = getClient();
    setActiveBaseUrl(client.baseUrl);
    setAuthToken(client.getToken());
    refreshDesktopStatus();

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshDesktopStatus();
    }, 8000);

    return () => {
      clearInterval(interval);
      client.disconnect();
    };
  }, [getClient, refreshDesktopStatus]);

  return (
    <>
      <LiveDesktopWorkspace
        baseUrl={activeBaseUrl}
        authToken={authToken}
        isOnline={isOnline}
        isUnauthorized={isUnauthorized}
        status={desktopStatus}
        onSendInput={(payload) => getClient().sendDesktopInput(payload)}
        onRefreshStatus={refreshDesktopStatus}
        onOpenConnectionModal={() => setIsConnectionModalOpen(true)}
      />

      <ConnectionSettingsModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        currentUrl={activeBaseUrl}
        currentToken={authToken}
        onSaveConnection={handleSaveConnection}
        isOnline={isOnline}
      />
    </>
  );
}
