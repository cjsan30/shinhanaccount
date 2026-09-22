import type { AccessibilityPreferences } from '../domain/accessibility';

export function AccessibilitySettings({ preferences, onChange }: { preferences: AccessibilityPreferences; onChange: (next: AccessibilityPreferences) => void }) {
  return <section className="accessibility-settings">
    <p>읽기와 조작 방식을 이 기기에서만 조정합니다.</p>
    <fieldset>
      <legend>글자 크기</legend>
      <div className="accessibility-settings__choices">
        {(['small', 'default', 'large'] as const).map((textScale) => <button key={textScale} type="button" className={preferences.textScale === textScale ? 'is-selected' : ''} onClick={() => onChange({ ...preferences, textScale })}>{textScale === 'small' ? '작게' : textScale === 'large' ? '크게' : '기본'}</button>)}
      </div>
    </fieldset>
    <label className="accessibility-settings__toggle"><span><strong>고대비 모드</strong><small>텍스트와 경계선을 더 선명하게 표시합니다.</small></span><input aria-label="고대비 모드" type="checkbox" checked={preferences.highContrast} onChange={(event) => onChange({ ...preferences, highContrast: event.target.checked })} /></label>
    <label className="accessibility-settings__toggle"><span><strong>진동 피드백</strong><small>버튼을 누를 때 짧은 진동으로 반응합니다.</small></span><input aria-label="진동 피드백" type="checkbox" checked={preferences.vibration} onChange={(event) => onChange({ ...preferences, vibration: event.target.checked })} /></label>
  </section>;
}
