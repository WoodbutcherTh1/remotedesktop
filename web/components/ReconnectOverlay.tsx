'use client';

interface ReconnectOverlayProps {
  visible: boolean;
  attempt?: number;
  maxAttempts?: number;
}

export default function ReconnectOverlay({ visible, attempt = 0, maxAttempts = 10 }: ReconnectOverlayProps) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="glass rounded-xl p-8 flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-200 font-medium">Reconnecting…</p>
        {attempt > 0 && (
          <p className="text-zinc-400 text-sm font-mono">
            Attempt {attempt} of {maxAttempts}
          </p>
        )}
      </div>
    </div>
  );
}
