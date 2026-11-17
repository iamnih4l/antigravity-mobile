'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  ShieldCheck,
  Smartphone,
  Copy,
  Check,
  RotateCw,
  KeyRound,
} from 'lucide-react';
import { QrPairingPayload, PairingResponse } from '@/lib/companion-client';
import { cn } from '@/lib/utils';

interface QrPairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFetchQr: () => Promise<QrPairingPayload>;
  onPairDevice: (pairingCode: string, deviceName: string) => Promise<PairingResponse>;
  currentToken: string | null;
}

export function QrPairingModal({
  isOpen,
  onClose,
  onFetchQr,
  onPairDevice,
  currentToken,
}: QrPairingModalProps) {
  const [qrData, setQrData] = useState<QrPairingPayload | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [deviceName, setDeviceName] = useState('Nihal iPhone 16 Pro');
  const [isPairing, setIsPairing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadQr = async () => {
    try {
      const data = await onFetchQr();
      setQrData(data);
      setManualCode(data.pairingCode);
    } catch (err: unknown) {
      setStatusMsg(`QR load error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadQr();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim() || isPairing) return;
    setIsPairing(true);
    setStatusMsg(null);
    try {
      const res = await onPairDevice(manualCode.trim(), deviceName.trim());
      setStatusMsg(`Device successfully paired! Token: ${res.token.slice(0, 12)}...`);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setStatusMsg(`Pairing failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPairing(false);
    }
  };

  const handleCopyCode = () => {
    if (!qrData?.pairingCode) return;
    navigator.clipboard?.writeText(qrData.pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-obsidian/85 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div
        className="w-full sm:max-w-md bg-carbon border border-hairline rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-modal-title"
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 id="qr-modal-title" className="font-display font-semibold text-sm sm:text-base text-white">
                Pair Smartphone Companion
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono">HMAC-SHA256 Token Session</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-surface min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusMsg && (
          <div
            className={cn(
              'p-2.5 rounded-lg text-xs font-mono border',
              statusMsg.includes('failed') || statusMsg.includes('error')
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            )}
          >
            {statusMsg}
          </div>
        )}

        {/* QR CODE DISPLAY */}
        <div className="flex flex-col items-center justify-center py-2 space-y-3">
          <div className="p-3 bg-white rounded-xl shadow-lg border border-zinc-300">
            {qrData?.qrDataUrl ? (
              <img
                src={qrData.qrDataUrl}
                alt="Scan QR code to pair device"
                className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
              />
            ) : (
              <div className="w-48 h-48 sm:w-56 sm:h-56 flex flex-col items-center justify-center text-zinc-700 font-mono text-xs text-center p-4">
                <RotateCw className="w-6 h-6 animate-spin text-indigo-600 mb-2" />
                <span>Generating HMAC QR...</span>
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-400 text-center max-w-xs">
            Scan with your iPhone or mobile browser on the same Tailscale network to pair instantly.
          </p>
        </div>

        {/* MANUAL PAIRING CODE FALLBACK */}
        <div className="hairline-card p-3.5 rounded-xl border border-hairline bg-surface/30 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-400 uppercase tracking-wider text-[10px]">
              One-Time Pairing Code
            </span>
            <button
              onClick={handleCopyCode}
              className="text-indigo-400 hover:underline flex items-center gap-1 text-[11px]"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div className="font-mono text-lg font-bold text-center text-indigo-300 tracking-wider bg-obsidian py-2 rounded border border-hairline">
            {qrData?.pairingCode || '------'}
          </div>
        </div>

        {/* DEVICE PAIRING SUBMIT FORM */}
        <form onSubmit={handlePair} className="space-y-3">
          <div>
            <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
              Device Name
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full bg-obsidian text-xs font-mono text-zinc-200 px-3 py-2 rounded-lg border border-hairline focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isPairing || !manualCode.trim()}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium text-white transition active:scale-98 shadow-md flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isPairing ? 'Exchanging HMAC Token...' : 'Authorize & Issue Bearer Token'}</span>
          </button>
        </form>

        {currentToken && (
          <div className="pt-2 border-t border-hairline text-center text-[10px] font-mono text-emerald-400">
            ✓ Active Bearer Session: {currentToken.slice(0, 16)}...
          </div>
        )}
      </div>
    </div>
  );
}

export default QrPairingModal;
