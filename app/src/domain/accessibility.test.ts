import { describe, expect, it } from 'vitest';
import { ACCESSIBILITY_STORAGE_KEY, defaultAccessibilityPreferences, loadAccessibilityPreferences, saveAccessibilityPreferences } from './accessibility';

const storageWith = (value: string | null) => ({ getItem: (key: string) => (key === ACCESSIBILITY_STORAGE_KEY ? value : null) });

describe('accessibility preferences', () => {
  it('uses the defaults when nothing is saved or the value is broken', () => {
    expect(loadAccessibilityPreferences(storageWith(null))).toEqual(defaultAccessibilityPreferences);
    expect(loadAccessibilityPreferences(storageWith('{broken'))).toEqual(defaultAccessibilityPreferences);
  });

  it('drops the high contrast value saved by an older version', () => {
    const saved = JSON.stringify({ textScale: 'large', highContrast: true, vibration: true });
    expect(loadAccessibilityPreferences(storageWith(saved))).toEqual({ textScale: 'large', vibration: true });
  });

  it('falls back for unknown values', () => {
    expect(loadAccessibilityPreferences(storageWith(JSON.stringify({ textScale: 'huge', vibration: 'yes' })))).toEqual(defaultAccessibilityPreferences);
  });

  it('saves only the current fields', () => {
    let stored = '';
    saveAccessibilityPreferences({ setItem: (_key, value) => { stored = value; } }, { textScale: 'small', vibration: false });
    expect(JSON.parse(stored)).toEqual({ textScale: 'small', vibration: false });
  });
});
