export type Panel = 'resident' | 'study' | 'undecided' | 'recent' | 'detail' | 'cancel' | 'cancel-review' | 'edit' | 'delete' | 'settings' | 'information' | 'evidence' | 'payment' | 'import' | 'operations' | 'data' | 'rules' | 'accessibility' | 'verification' | null;

export function previousPanel(panel: Panel): Panel {
  if (panel === 'operations' || panel === 'data' || panel === 'accessibility' || panel === 'verification' || panel === 'information') return 'settings';
  if (panel === 'rules') return 'data';
  if (panel === 'detail') return 'recent';
  if (panel === 'edit' || panel === 'delete' || panel === 'cancel') return 'detail';
  return null;
}
