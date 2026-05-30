export const STORAGE_KEYS = {
  TOKEN: 'remotedesk_token',
  RELAY_URL: 'remotedesk_relay_url',
  SETTINGS: 'remotedesk_settings',
} as const;

export const DEFAULT_RELAY_URL =
  process.env.NEXT_PUBLIC_RELAY_URL || 'ws://localhost:8080';

export const QUALITY_PRESETS = {
  low: 40,
  medium: 60,
  high: 75,
  ultra: 90,
  custom: 75,
} as const;

export type QualityPreset = keyof typeof QUALITY_PRESETS;

export interface CommandMessage {
  type: 'command';
  action: string;
  [key: string]: unknown;
}

export type WSMessage =
  | { type: 'auth'; role: 'agent' | 'client'; token: string }
  | { type: 'auth_ok'; role: string }
  | { type: 'auth_error'; message: string }
  | { type: 'agent_status'; online: boolean; timestamp: number }
  | { type: 'ping'; timestamp: number }
  | { type: 'pong'; timestamp: number }
  | { type: 'heartbeat'; timestamp: number }
  | { type: 'error'; message: string }
  | CommandMessage;

export const SPECIAL_KEYS = [
  { label: 'Ctrl', keys: ['ctrl'] },
  { label: 'Alt', keys: ['alt'] },
  { label: 'Shift', keys: ['shift'] },
  { label: 'Win', keys: ['cmd'] },
  { label: 'Tab', keys: ['tab'] },
  { label: 'Esc', keys: ['escape'] },
  { label: 'Del', keys: ['delete'] },
  { label: 'Enter', keys: ['enter'] },
  { label: 'Space', keys: ['space'] },
  { label: '↑', keys: ['up'] },
  { label: '↓', keys: ['down'] },
  { label: '←', keys: ['left'] },
  { label: '→', keys: ['right'] },
] as const;

export const KEYBOARD_SHORTCUTS = [
  { label: 'Ctrl+C', keys: ['ctrl', 'c'] },
  { label: 'Ctrl+V', keys: ['ctrl', 'v'] },
  { label: 'Ctrl+X', keys: ['ctrl', 'x'] },
  { label: 'Ctrl+Z', keys: ['ctrl', 'z'] },
  { label: 'Ctrl+A', keys: ['ctrl', 'a'] },
  { label: 'Ctrl+S', keys: ['ctrl', 's'] },
  { label: 'Alt+Tab', keys: ['alt', 'tab'] },
  { label: 'Win', keys: ['cmd'] },
  { label: 'Ctrl+Alt+Del', keys: ['ctrl', 'alt', 'delete'] },
] as const;
