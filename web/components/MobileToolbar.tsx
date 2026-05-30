'use client';

import { TouchInteractionMode } from '@/lib/view-transform';

interface MobileToolbarProps {
  onSettings: () => void;
  onCtrlAltDel: () => void;
  onDisconnect: () => void;
  touchMode: TouchInteractionMode;
  onTouchModeToggle: () => void;
}

export default function MobileToolbar({
  onSettings,
  onCtrlAltDel,
  onDisconnect,
  touchMode,
  onTouchModeToggle,
}: MobileToolbarProps) {
  const isPanMode = touchMode === 'pan';

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)] pointer-events-none">
      <div className="glass rounded-none border-x-0 border-b-0 flex items-center justify-around py-3 px-2 pointer-events-auto">
        <MobileButton icon="⚙" label="Settings" onClick={onSettings} />
        <MobileButton
          icon={isPanMode ? '✋' : '🖱'}
          label={isPanMode ? 'Pan' : 'Move'}
          active
          activeVariant={isPanMode ? 'pan' : 'move'}
          onClick={onTouchModeToggle}
        />
        <MobileButton icon="⌘" label="CAD" onClick={onCtrlAltDel} />
        <MobileButton icon="✕" label="Exit" onClick={onDisconnect} />
      </div>
    </div>
  );
}

function MobileButton({
  icon,
  label,
  active = false,
  activeVariant,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  activeVariant?: 'move' | 'pan';
  onClick: () => void;
}) {
  const activeClass =
    active && activeVariant === 'pan'
      ? 'bg-primary/25 text-primary ring-1 ring-primary/50'
      : active && activeVariant === 'move'
        ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
        : active
          ? 'bg-white/15 text-primary'
          : '';

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg hover:bg-white/10 ${activeClass}`}
    >
      <span className="text-lg">{icon}</span>
      <span className={`text-[10px] ${active ? 'text-inherit' : 'text-zinc-400'}`}>{label}</span>
    </button>
  );
}
