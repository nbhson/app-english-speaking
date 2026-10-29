// UI preference persistence (F4): mode, scenario, custom topic and panel
// visibility survive a reload. One versioned localStorage key, defensively
// validated on read so corrupted/legacy values can't break startup.

import { AppMode } from '../types';

const KEY = 'fluentdev-ui-prefs-v1';

export interface UIPrefs {
  mode: AppMode;
  scenarioId: string;
  customTopic: string;
  showSidebar: boolean;
  showAssessment: boolean;
}

const VALID_MODES = new Set<string>(Object.values(AppMode));

export function loadUiPrefs(): Partial<UIPrefs> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<UIPrefs>;
    return {
      ...(p.mode && VALID_MODES.has(p.mode) ? { mode: p.mode } : {}),
      ...(typeof p.scenarioId === 'string' && p.scenarioId ? { scenarioId: p.scenarioId } : {}),
      ...(typeof p.customTopic === 'string' ? { customTopic: p.customTopic } : {}),
      ...(typeof p.showSidebar === 'boolean' ? { showSidebar: p.showSidebar } : {}),
      ...(typeof p.showAssessment === 'boolean' ? { showAssessment: p.showAssessment } : {}),
    };
  } catch {
    return {};
  }
}

export function saveUiPrefs(prefs: UIPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* quota ignore */
  }
}
