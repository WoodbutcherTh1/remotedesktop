'use client';

interface MobileToolbarProps {
  onKeyboard: () => void;
  onSettings: () => void;
  onCtrlAltDel: () => void;
  onDisconnect: () => void;
}

export default function MobileToolbar({
  onKeyboard,
  onSettings,
  onCtrlAltDel,
  onDisconnect,
}: MobileToolbarProps) {
  return (
    <div className="md:hidden fixed bottom-4 left-4 right-4 z-30">
      <div className="glass rounded-2xl flex items-center justify-around py-3 px-2">
        <MobileButton icon="⌨" label="Keys" onClick={onKeyboard} />
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
