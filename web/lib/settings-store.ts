import { QUALITY_PRESETS, QualityPreset } from './constants';
import { TouchInteractionMode } from './view-transform';

export type CursorStyle = 'default' | 'crosshair' | 'dot' | 'pointer';
export type MouseMode = 'absolute' | 'relative';
export type ScrollMethod = 'wheel' | 'smooth' | 'pixel';
export type KeyboardMode = 'legacy' | 'unicode' | 'map';
export type ScaleMode = 'fill' | 'fit' | 'original' | 'stretch';
export type ColorMode = 'color' | 'grayscale' | 'high-contrast';

export interface RemoteSettings {
  mouse: {
    showRemoteCursor: boolean;
    showLocalCursor: boolean;
    cursorStyle: CursorStyle;
    cursorColor: string;
    mode: MouseMode;
    scrollSpeed: number;
    scrollDirection: 'natural' | 'traditional';
    scrollMethod: ScrollMethod;
    doubleClickSpeed: number;
    rightClickLongPress: number;
    ctrlClickAsRightClick: boolean;
    dragEnabled: boolean;
    dragThreshold: number;
    touchMode: TouchInteractionMode;
  };
  keyboard: {
    mode: KeyboardMode;
    shortcutPassthrough: boolean;
    blockBrowserShortcuts: boolean;
    shortcutExceptions: string;
    showSpecialKeysToolbar: boolean;
    imeEnabled: boolean;
    layout: string;
  };
  display: {
    qualityPreset: QualityPreset;
    customJpegQuality: number;
    fpsLimit: number;
    hardwareAcceleration: boolean;
    colorMode: ColorMode;
    showStatsOverlay: boolean;
    scaleMode: ScaleMode;
  };
  advanced: {
    autoReconnect: boolean;
    reconnectAttempts: number;
    clipboardSync: boolean;
    sessionTimeout: number;
    audioEnabled: boolean;
    fileTransferEnabled: boolean;
    wakeOnLanEnabled: boolean;
  };
}

export const DEFAULT_SETTINGS: RemoteSettings = {
  mouse: {
    showRemoteCursor: true,
    showLocalCursor: true,
    cursorStyle: 'default',
    cursorColor: '#7C3AED',
    mode: 'absolute',
    scrollSpeed: 3,
    scrollDirection: 'traditional',
    scrollMethod: 'wheel',
    doubleClickSpeed: 400,
    rightClickLongPress: 500,
    ctrlClickAsRightClick: false,
    dragEnabled: true,
    dragThreshold: 5,
    touchMode: 'move',
  },
  keyboard: {
    mode: 'unicode',
    shortcutPassthrough: true,
    blockBrowserShortcuts: true,
    shortcutExceptions: 'F5,F12',
    showSpecialKeysToolbar: true,
    imeEnabled: true,
    layout: 'auto',
  },
  display: {
    qualityPreset: 'high',
    customJpegQuality: 75,
    fpsLimit: 30,
    hardwareAcceleration: true,
    colorMode: 'color',
    showStatsOverlay: false,
    scaleMode: 'fill',
  },
  advanced: {
    autoReconnect: true,
    reconnectAttempts: 10,
    clipboardSync: false,
    sessionTimeout: 0,
    audioEnabled: false,
    fileTransferEnabled: false,
    wakeOnLanEnabled: false,
  },
};

const STORAGE_KEY = 'remotedesk_settings';

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal &&
      typeof tgtVal === 'object'
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (srcVal !== undefined) {
      result[key] = srcVal as T[keyof T];
    }
  }
  return result;
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

export function loadSettings(): RemoteSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const mobile = isMobileViewport();
    if (!raw) {
      const defaults = { ...DEFAULT_SETTINGS };
      defaults.display = {
        ...defaults.display,
        scaleMode: mobile ? 'fit' : 'stretch',
      };
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<RemoteSettings>;
    const merged = deepMerge(
      DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      parsed as Record<string, unknown>,
    ) as unknown as RemoteSettings;
    if (mobile) {
      merged.display = { ...merged.display, scaleMode: 'fit' };
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: RemoteSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function updateSettings<K extends keyof RemoteSettings>(
  section: K,
  partial: Partial<RemoteSettings[K]>,
): RemoteSettings {
  const current = loadSettings();
  const updated: RemoteSettings = {
    ...current,
    [section]: { ...current[section], ...partial },
  };
  saveSettings(updated);
  return updated;
}

export function resetSettings(): RemoteSettings {
  saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export function getEffectiveJpegQuality(settings: RemoteSettings): number {
  if (settings.display.qualityPreset === 'custom') {
    return settings.display.customJpegQuality;
  }
  return QUALITY_PRESETS[settings.display.qualityPreset as QualityPreset] ?? 75;
}

export function parseShortcutExceptions(exceptions: string): string[] {
  return exceptions
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
