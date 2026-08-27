export type Panel = 'resident' | 'study' | 'undecided' | 'recent' | 'detail' | 'cancel' | 'edit' | 'delete' | 'settings' | 'evidence' | 'payment' | 'import' | 'operations' | 'data' | 'rules' | 'accessibility' | null;

export function previousPanel(panel: Panel): Panel {
  if (panel === 'operations' || panel === 'data' || panel === 'accessibility') return 'settings';
  if (panel === 'rules') return 'data';
  if (panel === 'detail') return 'recent';
  if (panel === 'edit' || panel === 'delete' || panel === 'cancel') return 'detail';
  return null;
}
