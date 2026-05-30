'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  RemoteSettings,
  loadSettings,
  saveSettings,
  updateSettings as storeUpdate,
  resetSettings as storeReset,
} from '@/lib/settings-store';

export function useSettings() {
  const [settings, setSettings] = useState<RemoteSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  const updateSection = useCallback(
    <K extends keyof RemoteSettings>(section: K, partial: Partial<RemoteSettings[K]>) => {
      const updated = storeUpdate(section, partial);
      setSettings(updated);
      return updated;
    },
    [],
  );

  const setAll = useCallback((next: RemoteSettings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  const reset = useCallback(() => {
    const defaults = storeReset();
    setSettings(defaults);
    return defaults;
  }, []);

  return { settings, loaded, updateSection, setAll, reset };
}
