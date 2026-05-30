'use client';

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-white/5">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-zinc-200">{label}</div>
        {description && <div className="text-xs text-zinc-500 mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-zinc-600'}`}
    >
      <span
        className={`block w-4 h-4 rounded-full bg-white transition-transform m-0.5 ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-16 bg-surface border border-white/10 rounded px-2 py-1 text-sm text-right"
    />
  );
}

export function RangeInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24"
      />
      <span className="text-xs font-mono w-8 text-right">{value}</span>
    </div>
  );
}

export function SelectInput<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
