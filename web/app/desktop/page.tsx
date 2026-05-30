'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import RemoteCanvas from '@/components/RemoteCanvas';
import TopBar from '@/components/TopBar';
import SettingsPanel from '@/components/SettingsPanel';
import KeyboardShortcutBar from '@/components/KeyboardShortcutBar';
import MobileToolbar from '@/components/MobileToolbar';
import MobileKeyboardButton from '@/components/MobileKeyboardButton';
import ReconnectOverlay from '@/components/ReconnectOverlay';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useFrameRenderer } from '@/hooks/useFrameRenderer';
import { useKeyboardHandler } from '@/hooks/useKeyboardHandler';
import { useSettings } from '@/hooks/useSettings';
import { DEFAULT_RELAY_URL, STORAGE_KEYS } from '@/lib/constants';
import { BinaryFrame } from '@/lib/frame-protocol';
import { ScaleMode } from '@/lib/settings-store';
import { ViewState } from '@/lib/view-transform';

export default function DesktopPage() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewStateRef = useRef<ViewState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    containerWidth: 0,
    containerHeight: 0,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSettings, setMobileSettings] = useState(false);
  const [token, setToken] = useState('');
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [remoteSize, setRemoteSize] = useState({ width: 0, height: 0 });
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { settings, loaded, updateSection } = useSettings();

  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const storedRelay = localStorage.getItem(STORAGE_KEYS.RELAY_URL);
    if (!storedToken) {
      router.replace('/');
      return;
    }
    setToken(storedToken);
    setRelayUrl(storedRelay || DEFAULT_RELAY_URL);
  }, [router]);

  const renderFrameRef = useRef<(f: BinaryFrame) => void>(() => {});

  const { status, latency, agentOnline, connect, disconnect, sendCommand, reconnectAttempt } =
    useWebSocket({
      url: relayUrl,
      token,
      autoReconnect: settings.advanced.autoReconnect,
      maxReconnectAttempts: settings.advanced.reconnectAttempts,
      onBinaryFrame: (frame) => {
        setRemoteSize({ width: frame.width, height: frame.height });
        renderFrameRef.current(frame);
      },
    });

  const { fps, frameCount, dimensions, hasReceivedFrame, renderFrame, takeScreenshot, initializeDisplayCanvas } =
    useFrameRenderer(canvasRef, settings, status === 'connected');
  renderFrameRef.current = renderFrame;

  const { sendKeyCombo } = useKeyboardHandler({
    settings,
    sendCommand,
    enabled: status === 'connected',
  });

  useEffect(() => {
    if (token && relayUrl && loaded) {
      connect();
    }
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, relayUrl, loaded]);

  useEffect(() => {
    if (!settings.advanced.clipboardSync) return;

    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (text) sendCommand('type_text', { text, mode: settings.keyboard.mode });
    };

    const syncClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) sendCommand('type_text', { text, mode: settings.keyboard.mode });
      } catch {
        // permission denied
      }
    };

    document.addEventListener('paste', handlePaste);
    const interval = setInterval(syncClipboard, 3000);
    return () => {
      document.removeEventListener('paste', handlePaste);
      clearInterval(interval);
    };
  }, [settings.advanced.clipboardSync, settings.keyboard.mode, sendCommand]);

  useEffect(() => {
    if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    const timeout = settings.advanced.sessionTimeout;
    if (timeout > 0 && status === 'connected') {
      sessionTimerRef.current = setTimeout(
        () => {
          disconnect();
          router.push('/');
        },
        timeout * 60 * 1000,
      );
    }
    return () => {
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
    };
  }, [settings.advanced.sessionTimeout, status, disconnect, router]);

  const cycleScaleMode = useCallback(() => {
    const modes: ScaleMode[] = ['fit', 'original', 'stretch'];
    const idx = modes.indexOf(settings.display.scaleMode);
    updateSection('display', { scaleMode: modes[(idx + 1) % modes.length] });
  }, [settings.display.scaleMode, updateSection]);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    router.push('/');
  }, [disconnect, router]);

  const width = remoteSize.width || dimensions.width;
  const height = remoteSize.height || dimensions.height;

  if (!loaded || !token) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed top-0 left-0 m-0 p-0 w-[100vw] h-[100dvh] overflow-hidden bg-[#0A0A0F]"
    >
      <RemoteCanvas
        canvasRef={canvasRef}
        containerRef={canvasContainerRef}
        viewStateRef={viewStateRef}
        settings={settings}
        remoteWidth={width}
        remoteHeight={height}
        sendCommand={sendCommand}
        showStats={settings.display.showStatsOverlay}
        fps={fps}
        frameCount={frameCount}
        latency={latency}
        connected={status === 'connected'}
        hasReceivedFrame={hasReceivedFrame}
        onCanvasMount={initializeDisplayCanvas}
      />

      <div className="hidden md:block relative z-10">
        <TopBar
          status={status}
          latency={latency}
          fps={fps}
          frameCount={frameCount}
          agentOnline={agentOnline}
          onFullscreen={handleFullscreen}
          onFitToggle={cycleScaleMode}
          scaleMode={settings.display.scaleMode}
          onScreenshot={takeScreenshot}
          onCtrlAltDel={() => sendCommand('ctrl_alt_del')}
          onLockScreen={() => sendCommand('lock_screen')}
          onSettings={() => setSettingsOpen(true)}
          onDisconnect={handleDisconnect}
        />
      </div>

      {settings.keyboard.showSpecialKeysToolbar && (
        <div className="hidden md:block relative z-10 border-b border-white/5">
          <KeyboardShortcutBar onShortcut={sendKeyCombo} visible />
        </div>
      )}

      <MobileKeyboardButton sendCommand={sendCommand} keyboardMode={settings.keyboard.mode} />

      <MobileToolbar
        onSettings={() => setMobileSettings(true)}
        onCtrlAltDel={() => sendCommand('ctrl_alt_del')}
        onDisconnect={handleDisconnect}
        touchMode={settings.mouse.touchMode}
        onTouchModeToggle={() =>
          updateSection('mouse', {
            touchMode: settings.mouse.touchMode === 'move' ? 'pan' : 'move',
          })
        }
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={updateSection}
      />

      <SettingsPanel
        open={mobileSettings}
        onClose={() => setMobileSettings(false)}
        settings={settings}
        onUpdate={updateSection}
        mobile
      />

      <ReconnectOverlay
        visible={status === 'reconnecting'}
        attempt={reconnectAttempt}
        maxAttempts={settings.advanced.reconnectAttempts}
      />
    </div>
  );
}
