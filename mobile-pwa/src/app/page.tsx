'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AntigravityCompanionClient, DesktopStatus } from '@/lib/companion-client';
import { LiveDesktopWorkspace } from '@/components/LiveDesktopWorkspace';
import { ConnectionSettingsModal } from '@/components/ConnectionSettingsModal';

export default function Home() {
  const [isOnline, setIsOnline] = useState(false);
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [activeBaseUrl, setActiveBaseUrl] = useState<string>('');
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);

  const clientRef = useRef<AntigravityCompanionClient | null>(null);

  const resolveInitialUrl = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const endpointParam = params.get('endpoint');
      if (endpointParam) {
        const clean = endpointParam.trim().replace(/\/+$/, '');
        localStorage.setItem('agm_companion_url', clean);
        return clean;
      }
      const stored = localStorage.getItem('agm_companion_url');
      if (stored) return stored;
      if (process.env.NEXT_PUBLIC_COMPANION_URL) return process.env.NEXT_PUBLIC_COMPANION_URL;
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://127.0.0.1:8787';
      }
    }
    return process.env.NEXT_PUBLIC_COMPANION_URL || 'http://127.0.0.1:8787';
  };

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      const initialUrl = resolveInitialUrl();
      clientRef.current = new AntigravityCompanionClient({
        baseUrl: initialUrl,
        onStatusChange: (online) => setIsOnline(online),
      });
      setActiveBaseUrl(clientRef.current.baseUrl);
    }
    return clientRef.current;
  }, []);

  const refreshDesktopStatus = useCallback(async () => {
    try {
      const client = getClient();
      const [health, desk] = await Promise.all([
        client.getHealth(),
        client.getDesktopStatus(),
      ]);
      setIsOnline(health.status === 'online');
      setDesktopStatus(desk);
    } catch {
      setIsOnline(false);
    }
  }, [getClient]);

  const handleSaveCompanionUrl = async (rawUrl: string): Promise<{ ok: boolean; message?: string }> => {
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
      const res = await fetch(`${cleanUrl}/api/health`, { method: 'GET', signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        return { ok: false, message: `Server responded with HTTP ${res.status}` };
      }
      const data = await res.json();
      if (data.status === 'online') {
        localStorage.setItem('agm_companion_url', cleanUrl);
        getClient().setBaseUrl(cleanUrl);
        setActiveBaseUrl(cleanUrl);
        setIsOnline(true);
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
        isOnline={isOnline}
        status={desktopStatus}
        onSendInput={(payload) => getClient().sendDesktopInput(payload)}
        onRefreshStatus={refreshDesktopStatus}
        onOpenConnectionModal={() => setIsConnectionModalOpen(true)}
      />

      <ConnectionSettingsModal
        isOpen={isConnectionModalOpen}
        onClose={() => setIsConnectionModalOpen(false)}
        currentUrl={activeBaseUrl}
        onSaveUrl={handleSaveCompanionUrl}
        isOnline={isOnline}
      />
    </>
  );
}
