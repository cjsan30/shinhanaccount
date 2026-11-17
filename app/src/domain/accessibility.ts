export type AccessibilityPreferences = {
  textScale: 'small' | 'default' | 'large';
  vibration: boolean;
};

export const ACCESSIBILITY_STORAGE_KEY = 'shinhanhae-accessibility-v1';
export const defaultAccessibilityPreferences: AccessibilityPreferences = { textScale: 'default', vibration: false };

export function loadAccessibilityPreferences(storage: Pick<Storage, 'getItem'>): AccessibilityPreferences {
  try {
    const parsed = JSON.parse(storage.getItem(ACCESSIBILITY_STORAGE_KEY) || '{}') as Partial<AccessibilityPreferences>;
    // Only known fields are kept, so a value saved by an older version (high contrast) is dropped.
    return {
      textScale: parsed.textScale === 'small' || parsed.textScale === 'large' ? parsed.textScale : 'default',
      vibration: parsed.vibration === true,
    };
  } catch { return defaultAccessibilityPreferences; }
}

export function saveAccessibilityPreferences(storage: Pick<Storage, 'setItem'>, preferences: AccessibilityPreferences) {
  storage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(preferences));
}
