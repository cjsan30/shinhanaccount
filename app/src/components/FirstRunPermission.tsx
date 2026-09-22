import { useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { NotificationBridge } from '../native/notificationBridge';
import { SmsBridge } from '../native/smsBridge';

type Props = {
  onComplete: (cardLast4: string) => void;
  onSkip?: () => void;
};

export function FirstRunPermission({ onComplete, onSkip }: Props) {
  const [cardLast4, setCardLast4] = useState('');
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const start = async () => {
    if (!/^\d{4}$/.test(cardLast4)) {
      setMessage('카드 끝 4자리를 입력해 주세요.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const notifications = await NotificationBridge.requestPermission();
      if (!notifications.granted) {
        setMessage('승인 결제와 예산 경고를 알려면 앱 알림을 허용해 주세요.');
        return;
      }
      const access = await SmsBridge.getNotificationAccessStatus();
      if (!access.granted) {
        await SmsBridge.openNotificationAccessSettings();
        setMessage('알림 접근에서 신청해 계산기를 허용한 뒤 앱으로 돌아와 다시 눌러 주세요.');
        return;
      }
      onComplete(cardLast4);
    } catch {
      setMessage('권한 설정을 완료할 수 없습니다. Android 앱에서 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="first-run">
      <div className="first-run__mark">지원금 관리 · 1/3</div>
      <h1>자동 관리를<br />시작할게요</h1>
      <p>필요한 권한을 설정한 뒤 사용 계획을 확정합니다.</p>
      <section className="first-run__card">
        <label>
          카드 끝 4자리
          <div className="first-run__input">
            <input
              aria-label="초기 카드 끝 4자리"
              type={visible ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={4}
              value={cardLast4}
              onChange={(event) => setCardLast4(event.target.value.replace(/\D/g, ''))}
            />
            <button type="button" aria-label={visible ? '카드 끝자리 숨기기' : '카드 끝자리 보기'} onClick={() => setVisible((current) => !current)}>
              {visible ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </label>
      </section>
      <section className="first-run__notice">
        <strong>권한이 필요한 이유</strong>
        <span>알림 접근은 등록한 카드의 승인 알림만 기기 안에서 기록합니다.</span>
        <small>앱 알림은 예산 경고와 새 결제 안내를 보여줍니다. 두 권한 모두 설정에서 언제든 해제할 수 있습니다.</small>
      </section>
      {message && <p role="alert" className="first-run__error">{message}</p>}
      <button className="first-run__start" type="button" onClick={() => void start()} disabled={saving}>
        {saving ? '권한 확인 중…' : '동의하고 알림 접근 설정'}
      </button>
      {onSkip && (
        <button className="guide-toggle" type="button" onClick={() => onSkip()}>
          넘어가기
        </button>
      )}
    </main>
  );
}
