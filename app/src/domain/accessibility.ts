export type AccessibilityPreferences = {
  textScale: 'small' | 'default' | 'large';
  highContrast: boolean;
  vibration: boolean;
};

export const ACCESSIBILITY_STORAGE_KEY = 'shinhanhae-accessibility-v1';
export const defaultAccessibilityPreferences: AccessibilityPreferences = { textScale: 'default', highContrast: false, vibration: false };

export function loadAccessibilityPreferences(storage: Pick<Storage, 'getItem'>): AccessibilityPreferences {
  try {
    const parsed = JSON.parse(storage.getItem(ACCESSIBILITY_STORAGE_KEY) || '{}') as Partial<AccessibilityPreferences>;
    return { ...defaultAccessibilityPreferences, ...parsed };
  } catch { return defaultAccessibilityPreferences; }
}

export function saveAccessibilityPreferences(storage: Pick<Storage, 'setItem'>, preferences: AccessibilityPreferences) {
  storage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(preferences));
}
