'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_RELAY_URL, STORAGE_KEYS } from '@/lib/constants';

function MonitorWifiIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="8" y="12" width="48" height="32" rx="4" stroke="url(#grad)" strokeWidth="2" fill="none" />
      <line x1="32" y1="44" x2="32" y2="50" stroke="url(#grad)" strokeWidth="2" />
      <line x1="24" y1="50" x2="40" y2="50" stroke="url(#grad)" strokeWidth="2" />
      <path
        d="M44 20 C48 24, 50 28, 50 32 M40 24 C42 26, 43 29, 43 32 M36 28 C37 29, 37 30, 37 32"
        stroke="#7C3AED"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="64" y2="64">
          <stop stopColor="#7C3AED" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!token.trim()) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    setLoading(true);
    localStorage.setItem(STORAGE_KEYS.TOKEN, token.trim());
    localStorage.setItem(STORAGE_KEYS.RELAY_URL, relayUrl.trim());

    try {
      const ws = new WebSocket(relayUrl.trim());
      const result = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 8000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'auth', role: 'client', token: token.trim() }));
        };
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          clearTimeout(timeout);
          if (msg.type === 'auth_ok') {
            ws.close();
            resolve(true);
          } else {
            ws.close();
            resolve(false);
          }
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      });

      if (result) {
        router.push('/desktop');
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch {
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div
        className={`gradient-border w-full max-w-md rounded-2xl ${shake ? 'animate-shake' : ''}`}
      >
        <div className="glass rounded-2xl p-8">
          <div className="flex flex-col items-center mb-8">
            <MonitorWifiIcon />
            <h1 className="text-3xl font-bold mt-4 bg-gradient-primary bg-clip-text text-transparent">
              RemoteDesk
            </h1>
            <p className="text-zinc-400 mt-2">Connect to your Mac</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Relay URL</label>
              <input
                type="text"
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50"
                placeholder="wss://your-relay.railway.app"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Access Token</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                  className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 pr-12 text-sm focus:outline-none focus:border-primary/50"
                  placeholder="Enter your secret token"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-sm"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-primary text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
