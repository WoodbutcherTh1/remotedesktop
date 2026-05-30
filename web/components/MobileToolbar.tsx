'use client';

interface MobileToolbarProps {
  onSettings: () => void;
  onCtrlAltDel: () => void;
  onDisconnect: () => void;
}

export default function MobileToolbar({
  onSettings,
  onCtrlAltDel,
  onDisconnect,
}: MobileToolbarProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)] pointer-events-none">
      <div className="glass rounded-none border-x-0 border-b-0 flex items-center justify-around py-3 px-2 pointer-events-auto">
        <MobileButton icon="⚙" label="Settings" onClick={onSettings} />
        <MobileButton icon="⌘" label="CAD" onClick={onCtrlAltDel} />
        <MobileButton icon="✕" label="Exit" onClick={onDisconnect} />
      </div>
    </div>
  );
}

function MobileButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg hover:bg-white/10"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-[10px] text-zinc-400">{label}</span>
    </button>
  );
}
