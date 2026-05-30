'use client';

import { RemoteSettings } from '@/lib/settings-store';

interface TopBarProps {
  status: string;
  latency: number;
  fps: number;
  frameCount: number;
  agentOnline: boolean;
  onFullscreen: () => void;
  onFitToggle: () => void;
  scaleMode: RemoteSettings['display']['scaleMode'];
  onScreenshot: () => void;
  onCtrlAltDel: () => void;
  onLockScreen: () => void;
  onSettings: () => void;
  onDisconnect: () => void;
}

export default function TopBar({
  status,
  latency,
  fps,
  frameCount,
  agentOnline,
  onFullscreen,
  onFitToggle,
  scaleMode,
  onScreenshot,
  onCtrlAltDel,
  onLockScreen,
  onSettings,
  onDisconnect,
}: TopBarProps) {
  const statusColor =
    status === 'connected' && agentOnline
      ? 'bg-emerald-500'
      : status === 'reconnecting'
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <header className="h-12 glass flex items-center px-3 gap-3 shrink-0 z-20">
      <div className="flex items-center gap-2 min-w-[140px]">
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span className="text-sm capitalize">{agentOnline ? status : 'agent offline'}</span>
        <span className="text-xs text-zinc-500 font-mono">{latency}ms</span>
        <span className="text-xs text-zinc-500 font-mono">{fps} FPS</span>
        <span className="text-xs text-zinc-500 font-mono">#{frameCount}</span>
      </div>

      <div className="flex-1 flex items-center justify-center gap-1">
        <ToolbarButton onClick={onFullscreen} title="Fullscreen">⛶</ToolbarButton>
        <ToolbarButton onClick={onFitToggle} title="Scale mode">
          {scaleMode === 'fit' ? 'Fit' : scaleMode === 'original' ? '1:1' : 'Stretch'}
        </ToolbarButton>
        <ToolbarButton onClick={onScreenshot} title="Screenshot">📷</ToolbarButton>
        <ToolbarButton onClick={onCtrlAltDel} title="Ctrl+Alt+Del">⌨</ToolbarButton>
        <ToolbarButton onClick={onLockScreen} title="Lock screen">🔒</ToolbarButton>
      </div>

      <div className="flex items-center gap-1">
        <ToolbarButton onClick={onSettings} title="Settings">⚙</ToolbarButton>
        <ToolbarButton onClick={onDisconnect} title="Disconnect">✕</ToolbarButton>
      </div>
    </header>
  );
}

function ToolbarButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2.5 py-1 text-sm rounded hover:bg-white/10 transition-colors"
    >
      {children}
    </button>
  );
}
