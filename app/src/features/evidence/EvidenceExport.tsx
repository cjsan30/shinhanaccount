import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { SpotlightGuide, type GuideStep } from '../../components/SpotlightGuide';
import { existingSavedFiles, isSavedFileNotFound, openSavedFile, saveFile } from '../../native/fileExport';
import { addRecentReport, removeRecentReport, type RecentReport } from '../../domain/recentReports';
import { loadRecentReports, saveRecentReports } from '../../native/recentReportsStore';
import { loadEvidence, removeStoredEvidence, storeEvidence } from '../../native/evidenceVault';
import type { ReportEvidenceRecord, ReportEvidenceSection } from '../../domain/reportEvidence';
import { paymentDateInKorea } from '../../domain/receiptMatching';
import { toStatementRows } from '../../domain/statementImport';
import type { LedgerEntry } from '../../domain/ledger';
import { getReportReadiness } from '../../domain/reportReadiness';
import { addLostReceiptLinks, isEvidenceNotFound, pendingLostReceiptLinks } from '../../domain/lostEvidence';
import { loadLostReceiptLinks, saveLostReceiptLinks } from '../../native/lostReceiptLinksStore';
import { getMaskedAccountLast4, parseShinhanBankPdfExport } from '../../domain/shinhanBankImport';
import type { PolicyPeriod } from '../../domain/budget';
import { isValidReceiptDate } from '../../domain/receiptOcr';
import { addRasterPages, assembleEvidencePdf } from './pipeline/assemble';
import { compressImage, pdfPages, recognizeReceiptDetails, resolvedReceiptPatch } from './pipeline/render';
import { ExportCancelled, SECTION_LABEL, PROFILES, TARGET_BYTES, type RasterImage, type ReportSummary } from './pipeline/types';
import { renderPreviewPages } from './pipeline/preview';
import { PdfPreview } from './PdfPreview';
export type { ReportSummary } from './pipeline/types';

type EvidenceKind = 'image' | 'pdf';
type Evidence = ReportEvidenceRecord & { file: File; kind: EvidenceKind; url?: string; pages?: number };
type Progress = { current: number; total: number; stage: string; attempt: number; measuring?: boolean };
import { BenchmarkCancelled, compareBenchmarks, measureBenchmark, receiptFingerprint, type BenchmarkResult } from './benchmark';
import { Sentences } from '../../components/Sentences';
const PDF_GUIDE_STEPS: readonly GuideStep[] = [
  { target: '[data-guide="statement"] > .file-picker', title: '입출금내역을 추가하세요', body: '은행 또는 카드사에서 받은 파일을 추가하세요. 보호된 PDF는 비밀번호를 입력해 다시 읽을 수 있어요.' },
  { target: '.statement-redaction > summary', fallbackTarget: '[data-guide="statement"] > .file-picker', title: '모자이크할 내역을 확인하세요', body: '파일의 상세보기를 열어 사업 무관 거래를 선택하세요. 선택한 행은 모자이크 처리되며, 입금과 정책 기간 외 행은 자동으로 모자이크 처리됩니다.' },
  { target: '[data-guide="transactionProof"] > .file-picker', title: '추가 증빙은 필요한 경우만', body: '주거비·교통비에 필요한 계좌이체 확인서 등의 자료가 있다면 해당 결제에 연결하세요.' },
  { target: '[data-guide="receipt"] > .file-picker', title: '영수증을 추가하세요', body: '사진이나 스캔 이미지를 추가하세요. 추가된 영수증의 썸네일을 누르면 사진을 크게 볼 수 있어요.' },
  { target: '[data-guide="receipt"] .receipt-payment-candidates', fallbackTarget: '[data-guide="receipt"] .evidence-link', title: '필요하면 결제를 연결하세요', body: '읽어온 날짜를 확인하거나 직접 선택한 뒤 같은 날짜의 결제를 한 번 눌러 연결하세요. 연결은 선택 사항입니다.' },
  { target: '.evidence-export__actions', title: '미리보기로 확인하고 PDF를 생성하세요', body: '미연결 경고가 있어도 생성할 수 있고, 미연결 영수증도 별도로 포함됩니다. [미리보기]에서 누락과 글자 선명도를 확인한 뒤 [이대로 PDF 생성]을 누르면 저장됩니다. 파일은 4.5MB 이하로 자동 최적화하며, 불가능하면 안내합니다.' },
];

const MAX_EVIDENCE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EVIDENCE_TOTAL_BYTES = 120 * 1024 * 1024;
const won = (value: number) => `${Math.max(0, value).toLocaleString('ko-KR')}원`;
const fileSize = (value: number) => `${value.toLocaleString('ko-KR')}B (${(value / 1_000_000).toFixed(2)}MB)`;
const shortSize = (value: number) => `${(value / 1_000_000).toFixed(1)}MB`;
const reportTime = (iso: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const supported = (file: File) => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
const kindOf = (file: File): EvidenceKind => file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'pdf' : 'image';


// Long PDF work stops when the screen turns off and locks, because the WebView pauses JavaScript.
// Keep the screen on only while it runs; the browser drops the lock when the app is hidden, so take it again on return.
function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!active || !wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let stopped = false;
    const acquire = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      void wakeLock.request('screen').then((granted) => { if (stopped) void granted.release(); else { void lock?.release().catch(() => undefined); lock = granted; } }).catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => { stopped = true; document.removeEventListener('visibilitychange', acquire); void lock?.release().catch(() => undefined); };
  }, [active]);
}

const UNREADABLE_MESSAGE = (count: number) => `첨부 ${count}개를 읽지 못했습니다. 사용보고서를 닫았다가 다시 열어 주세요.`;

export function EvidenceExport({ helpRequest = 0, reportEvidence, onReportEvidenceChange, summary, entries, periodKey, period, onNotify }: { helpRequest?: number; onNotify?: (message: string) => void; reportEvidence: ReportEvidenceRecord[]; onReportEvidenceChange: Dispatch<SetStateAction<ReportEvidenceRecord[]>>; summary: ReportSummary; entries: LedgerEntry[]; periodKey: string; period?: PolicyPeriod }) {
  useEffect(() => { if (helpRequest > 0) setGuideOpen(true); }, [helpRequest]);
  const [adding, setAdding] = useState<{ current: number; total: number } | null>(null);
  const [addingSection, setAddingSection] = useState<ReportEvidenceSection>('receipt');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const addingRef = useRef(false);
  const loadedFiles = useRef(new Map<string, Evidence>());
  const [missingFiles, setMissingFiles] = useState<ReportEvidenceRecord[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  /** Payments whose linked receipt was dropped because the app's copy of the file is gone. */
  const [lostLinks, setLostLinks] = useState(loadLostReceiptLinks);
  useEffect(() => { saveLostReceiptLinks(lostLinks); }, [lostLinks]);
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'unlinked' | 'date'>('all');
  const [focusedReceipt, setFocusedReceipt] = useState<string | null>(null);
  const [expandedReceipts, setExpandedReceipts] = useState(new Set<string>());
  const [overviewMissingOnly, setOverviewMissingOnly] = useState(false); const [overviewExpanded, setOverviewExpanded] = useState(false);
  const linkPicker = useRef<HTMLInputElement>(null); const linkTarget = useRef<LedgerEntry | null>(null);
  useEffect(() => { if (focusedReceipt) document.getElementById('evidence-' + focusedReceipt)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }, [focusedReceipt, receiptFilter]);
  const [items, setItems] = useState<Evidence[]>([]); const [message, setMessage] = useState<string | null>(null); const [exporting, setExporting] = useState(false); const [progress, setProgress] = useState<Progress | null>(null); const [benchmarks, setBenchmarks] = useState<Partial<Record<'legacy' | 'current', BenchmarkResult>>>({}); const [statementPasswords, setStatementPasswords] = useState<Record<string, string>>({}); const [statementAccounts, setStatementAccounts] = useState<Record<string, string>>({}); const [statementsWithoutAccount, setStatementsWithoutAccount] = useState<Record<string, Partial<ReportEvidenceRecord>>>({}); const [previewReceipt, setPreviewReceipt] = useState<Evidence | null>(null); const [guideOpen, setGuideOpen] = useState(false); const urls = useRef(new Set<string>()); const raster = useRef(new Map<string, RasterImage[]>()); const cancelled = useRef(false);
  useScreenWakeLock(exporting || Boolean(adding));
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const [pdfPreview, setPdfPreview] = useState<{ bytes: Uint8Array; pages: string[] } | null>(null); const [savingPreview, setSavingPreview] = useState(false); const [previewError, setPreviewError] = useState<string | null>(null);
  const previewPages = useRef<string[]>([]);
  const [recentReports, setRecentReports] = useState<RecentReport[]>(loadRecentReports); const [recentNotice, setRecentNotice] = useState<string | null>(null);
  useEffect(() => { saveRecentReports(recentReports); }, [recentReports]);
  // Reports deleted in the file app leave the list on their own: checked when this screen opens and whenever the app comes back to the front.
  const recentUris = useRef<string[]>([]); recentUris.current = recentReports.map((report) => report.uri);
  useEffect(() => {
    let active = true;
    const prune = () => {
      const uris = recentUris.current; if (!uris.length || document.visibilityState === 'hidden') return;
      void existingSavedFiles(uris).then((present) => {
        if (!active) return;
        const kept = new Set(present); const gone = uris.filter((uri) => !kept.has(uri));
        if (gone.length) setRecentReports((current) => current.filter((report) => !gone.includes(report.uri)));
      }).catch(() => undefined);
    };
    prune();
    document.addEventListener('visibilitychange', prune);
    return () => { active = false; document.removeEventListener('visibilitychange', prune); };
  }, []);
  // Browser builds open their own blob: URLs; these die with the screen.
  const browserReportUrls = useRef<string[]>([]);
  useEffect(() => () => browserReportUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => () => previewPages.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    let disposed = false; setLoadingFiles(true);
    void Promise.all(reportEvidence.map(async (record) => {
      try {
        let loaded = loadedFiles.current.get(record.id);
        if (!loaded || loaded.stored.id !== record.stored.id) {
          const file = await loadEvidence(record.stored); if (disposed) return null; const kind = kindOf(file);
          const url = kind === 'image' && mounted.current ? URL.createObjectURL(file) : undefined;
          if (url) urls.current.add(url);
          loaded = { ...record, file, kind, url, pages: kind === 'image' ? 1 : undefined };
          loadedFiles.current.set(record.id, loaded);
        }
        return { ...loaded, ...record };
      } catch (error) { return { failed: true as const, notFound: isEvidenceNotFound(error) }; }
    })).then((loaded) => {
      if (disposed) return;
      setItems(loaded.filter((item): item is Evidence => item !== null && !('failed' in item)));
      const failed = loaded.flatMap((item, index) => item && 'failed' in item ? [{ record: reportEvidence[index], notFound: item.notFound }] : []);
      // A file confirmed gone is dropped; a read error that may be temporary keeps the attachment.
      setMissingFiles(failed.filter((item) => !item.notFound).map((item) => item.record)); setLoadingFiles(false);
      const lost = failed.filter((item) => item.notFound).map((item) => item.record);
      if (!lost.length) return;
      const lostIds = new Set(lost.map((record) => record.id));
      const lostLinkIds = lost.flatMap((record) => record.section === 'receipt' && record.linkedEntryId ? [record.linkedEntryId] : []);
      if (lostLinkIds.length) setLostLinks((current) => addLostReceiptLinks(current, lostLinkIds));
      onReportEvidenceChange((current) => current.filter((record) => !lostIds.has(record.id)));
    });
    return () => { disposed = true; };
  }, [reportEvidence, onReportEvidenceChange]);
  useEffect(() => { let disposed = false; const pending = items.filter((item) => item.kind === 'pdf' && !item.pages); void Promise.all(pending.map(async (item) => { let pages = 1; try { pages = await pdfPages(item.file); } catch { /* export will give a readable error */ } if (!disposed) { const cached = loadedFiles.current.get(item.id); if (cached) loadedFiles.current.set(item.id, { ...cached, pages }); setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, pages } : candidate)); } })); return () => { disposed = true; }; }, [items]);
  const inSection = (section: ReportEvidenceSection) => items.filter((item) => item.section === section).sort((a, b) => a.order - b.order);
  /** `linkTo`: a payment picked in 결제별 영수증; the one receipt added is linked to it, without reading its date. */
  const addFiles = async (section: ReportEvidenceSection, files: FileList | null, linkTo?: LedgerEntry) => {
    if (!files || addingRef.current || exporting) return;
    const selected = linkTo ? [...files].slice(0, 1) : [...files];
    const supportedFiles = selected.filter(supported);
    const individuallySafe = supportedFiles.filter((file) => file.size > 0 && file.size <= MAX_EVIDENCE_FILE_BYTES);
    const usedBytes = reportEvidence.reduce((sum, item) => sum + item.stored.size, 0);
    let remainingBytes = Math.max(0, MAX_EVIDENCE_TOTAL_BYTES - usedBytes);
    const valid = individuallySafe.filter((file) => {
      if (file.size > remainingBytes) return false;
      remainingBytes -= file.size;
      return true;
    });
    if (!valid.length) {
      setMessage('추가할 수 있는 제출 파일이 없습니다. JPG, PNG, WEBP, PDF 형식과 파일 크기를 확인해 주세요.');
      return;
    }
    const rejectedType = supportedFiles.length !== selected.length;
    const rejectedSize = individuallySafe.length !== supportedFiles.length;
    const rejectedTotal = valid.length !== individuallySafe.length;
    if (rejectedType || rejectedSize || rejectedTotal) setMessage(`일부 파일을 제외했습니다.${rejectedType ? ' JPG, PNG, WEBP, PDF 형식만 지원합니다.' : ''}${rejectedSize ? ' 파일 하나는 20MB 이하만 추가할 수 있습니다.' : ''}${rejectedTotal ? ' 제출 원본은 합계 120MB 이하만 추가할 수 있습니다.' : ''}`);
    addingRef.current = true; setAddingSection(section); setAdding({ current: 0, total: valid.length });
    const pending: Array<{ record: ReportEvidenceRecord; file: File }> = [];
    try {
      for (const file of valid) {
        try {
          const stored = await storeEvidence(file);
          const linked = linkTo && section === 'receipt' ? { linkedEntryId: linkTo.id, category: linkTo.category, receiptDate: paymentDateInKorea(linkTo), receiptOcrStatus: 'linked' as const } : undefined;
          const record: ReportEvidenceRecord = { id: crypto.randomUUID(), stored, section, order: 0, ...(linked ?? (section === 'receipt' && kindOf(file) === 'image' ? { receiptOcrStatus: 'reading' } : {})) };
          const kind = kindOf(file); const url = kind === 'image' ? URL.createObjectURL(file) : undefined;
          if (url) urls.current.add(url);
          loadedFiles.current.set(record.id, { ...record, file, kind, url, pages: kind === 'image' ? 1 : undefined });
          pending.push({ record, file });
          onReportEvidenceChange((current) => [...current, { ...record, order: Math.max(-1, ...current.filter((item) => item.section === section).map((item) => item.order)) + 1 }]);
        } catch { setMessage(`${file.name}을 저장하지 못했습니다. 다시 추가해 주세요.`); }
      }
      for (const [index, { record, file }] of pending.entries()) {
        let patch: Partial<ReportEvidenceRecord> = {};
        if (section === 'receipt' && kindOf(file) === 'image' && !linkTo) {
          try { const details = await recognizeReceiptDetails(file); patch = { receiptDate: details.date, ...resolvedReceiptPatch(details) }; }
          catch { patch = { receiptOcrStatus: 'failed', receiptOcrMessage: '이미지에서 결제 날짜를 읽지 못했습니다. 날짜를 선택하거나 다시 읽어 주세요.' }; }
        } else if (section === 'statement' && kindOf(file) === 'pdf') {
          patch = { statementParseFailed: true, statementNeedsAccount: true }; setMessage('입출금내역의 계좌 끝 4자리를 입력하고 표를 읽어 주세요.');
        }
        onReportEvidenceChange((current) => current.map((item) => item.id === record.id ? { ...item, ...patch } : item));
        setAdding({ current: index + 1, total: pending.length });
      }
    } finally { addingRef.current = false; setAdding(null); }
  };
  const update = (id: string, patch: Partial<ReportEvidenceRecord>) => onReportEvidenceChange((current) => current.map((item) => {
    if (item.id !== id) return item;
    const next = { ...item, ...patch };
    // A changed date must never retain a link chosen for a different day.
    if (item.section === 'receipt' && 'receiptDate' in patch && next.receiptDate !== item.receiptDate && !('receiptOcrStatus' in patch)) {
      return { ...next, ...resolvedReceiptPatch({ date: next.receiptDate }, true) };
    }
    return next;
  }));
  const readiness = getReportReadiness(entries, reportEvidence, periodKey, period);
  const payments = readiness.payments;
  const lostPending = pendingLostReceiptLinks(lostLinks, readiness.missingReceipts.map((entry) => entry.id));
  useEffect(() => { if (!loadingFiles && lostPending.length !== lostLinks.length) setLostLinks(lostPending); }, [loadingFiles, lostPending, lostLinks.length]);
  const unlinkedReceiptCount = reportEvidence.filter((item) => item.section === 'receipt' && !payments.some((payment) => payment.id === item.linkedEntryId)).length;
  const receiptCategory = (item: Evidence) => payments.find((payment) => payment.id === item.linkedEntryId)?.category ?? '__unlinked__';
  const additionalProofPayments = payments.filter((entry) => entry.category === 'lodging' || entry.category === 'transport');
  const linkReceipt = (id: string, entryId: string) => {
    const payment = payments.find((entry) => entry.id === entryId);
    const alreadyLinked = reportEvidence.some((item) => item.section === 'receipt' && item.id !== id && item.linkedEntryId === entryId);
    if (entryId && alreadyLinked) { setMessage('이 결제에는 이미 다른 영수증이 연결되어 있습니다. 연결을 변경하거나 다른 결제를 선택해 주세요.'); return; }
    update(id, { linkedEntryId: entryId || undefined, category: payment?.category, receiptAutoLinked: undefined, receiptOcrStatus: entryId ? 'linked' : 'needs-input', receiptOcrMessage: entryId ? undefined : '결제 날짜를 선택해 주세요.' });
  };
  const retryReceiptOcr = async (item: Evidence) => {
    if (addingRef.current || exporting) return;
    addingRef.current = true; setAddingSection('receipt'); setAdding({ current: 0, total: 1 });
    update(item.id, { receiptOcrStatus: 'reading' });
    try {
      const details = await recognizeReceiptDetails(item.file);
      update(item.id, { receiptDate: details.date, ...resolvedReceiptPatch(details) });
    } catch { update(item.id, { receiptOcrStatus: 'failed', receiptOcrMessage: '이미지에서 결제 날짜를 읽지 못했습니다. 날짜를 선택하거나 다시 읽어 주세요.' }); }
    finally { addingRef.current = false; setAdding(null); }
  };
  const linkAdditionalProof = (id: string, entryId: string) => { const payment = additionalProofPayments.find((entry) => entry.id === entryId); update(id, { linkedEntryId: entryId || undefined, category: payment?.category }); };
  const toggleStatementRow = (id: string, rowId: string) => onReportEvidenceChange((current) => current.map((item) => {
    if (item.id !== id) return item;
    const excluded = new Set(item.excludedStatementRowIds ?? []);
    if (excluded.has(rowId)) excluded.delete(rowId); else excluded.add(rowId);
    return { ...item, excludedStatementRowIds: [...excluded] };
  }));
  const retryStatementParse = async (item: Evidence) => {
    const account = statementAccounts[item.id] ?? '';
    if (!/^\d{4}$/.test(account)) { setMessage('입출금내역의 계좌 끝 4자리를 입력해 주세요.'); return; }
    try {
      const password = statementPasswords[item.id];
      const parsed = await parseShinhanBankPdfExport(await item.file.arrayBuffer(), password || undefined);
      const rows = toStatementRows(parsed);
      if (!rows.length) throw new Error('입출금 행을 찾지 못했습니다.');
      const fileLast4 = getMaskedAccountLast4(parsed.find((row) => row.accountMasked)?.accountMasked);
      if (fileLast4 && fileLast4 !== account) { setMessage('입력한 계좌 끝 4자리와 파일의 계좌 정보가 다릅니다.'); return; }
      const readPatch: Partial<ReportEvidenceRecord> = { statementRows: rows, excludedStatementRowIds: [], statementParseFailed: false, statementNeedsAccount: false, statementSourceRequiresPassword: Boolean(password) };
      // Same as the transaction import: a file without a readable account is attached only after the user confirms it.
      if (!fileLast4) { setStatementsWithoutAccount((current) => ({ ...current, [item.id]: readPatch })); setMessage('파일에서 계좌번호를 확인할 수 없습니다. 입력한 계좌의 내역이 맞으면 [그래도 첨부]를 눌러 주세요.'); return; }
      update(item.id, readPatch);
      setMessage('입출금내역 표를 읽었습니다. 사업과 무관한 행만 선택해 모자이크할 수 있습니다.');
    } catch {
      setMessage('입출금내역 표를 읽지 못했습니다. PDF 비밀번호와 파일 형식을 확인해 주세요.');
    }
  };
  const move = (section: ReportEvidenceSection, index: number, direction: -1 | 1) => onReportEvidenceChange((current) => { const ordered = current.filter((item) => item.section === section).sort((left, right) => left.order - right.order); const target = index + direction; if (target < 0 || target >= ordered.length) return current; const left = ordered[index]; const right = ordered[target]; return current.map((item) => item.id === left.id ? { ...item, order: right.order } : item.id === right.id ? { ...item, order: left.order } : item); });
  const remove = (item: Evidence) => { if (item.url) { URL.revokeObjectURL(item.url); urls.current.delete(item.url); } loadedFiles.current.delete(item.id); raster.current.clear(); onReportEvidenceChange((current) => current.filter((record) => record.id !== item.id)); void removeStoredEvidence(item.stored).catch(() => undefined); };
  /** Empties every section after the user confirms; the stored copies are removed too. */
  const removeAll = () => {
    if (!reportEvidence.length || !window.confirm(`사용보고서를 초기화할까요?\n첨부한 입출금내역·거래증빙·영수증 ${reportEvidence.length}개를 모두 지웁니다.\n되돌릴 수 없습니다.`)) return;
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear(); loadedFiles.current.clear(); raster.current.clear();
    const stored = reportEvidence.map((record) => record.stored);
    onReportEvidenceChange([]);
    void Promise.all(stored.map((file) => removeStoredEvidence(file).catch(() => undefined)));
    setLostLinks([]);
    // The reset button sits at the top, so confirm with a short toast instead of a note above [미리보기].
    setMessage(null);
    onNotify?.('사용보고서를 초기화했습니다.');
  };
  const openReport = async (report: RecentReport) => {
    setRecentNotice(null);
    try { await openSavedFile(report.uri, 'application/pdf'); }
    catch (error) {
      if (isSavedFileNotFound(error)) { setRecentReports((current) => removeRecentReport(current, report.uri)); setRecentNotice('파일을 찾지 못해 목록에서 뺐습니다. 파일 앱에서 지웠을 수 있습니다.'); }
      else setRecentNotice('PDF를 열지 못했습니다. Downloads/신청해 계산기에서 직접 열어 주세요.');
    }
  };
  const closePdfPreview = () => { previewPages.current.forEach((url) => URL.revokeObjectURL(url)); previewPages.current = []; setPdfPreview(null); setPreviewError(null); };
  /** Saves exactly the PDF the user just checked; it is not rebuilt. */
  const savePdfPreview = async () => {
    if (!pdfPreview) return;
    setSavingPreview(true); setPreviewError(null);
    try {
      const bytes = pdfPreview.bytes;
      const result = await saveFile('shinhanhae_report_evidence.pdf', bytes, 'application/pdf');
      let uri = 'uri' in result && typeof result.uri === 'string' ? result.uri : '';
      if (!uri) { uri = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })); browserReportUrls.current.push(uri); }
      setRecentReports((current) => addRecentReport(current, { uri, fileName: result.fileName, size: bytes.byteLength, savedAt: new Date().toISOString() }));
      setRecentNotice(null); setMessage(null);
      closePdfPreview();
      onNotify?.('사용보고서가 생성되었습니다.');
    } catch { setPreviewError('PDF를 저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setSavingPreview(false); }
  };
  const exportPdf = async (qualityComparison = false) => {
    if (addingRef.current || loadingFiles || missingFiles.length) { setMessage(missingFiles.length ? UNREADABLE_MESSAGE(missingFiles.length) : '파일을 처리하는 중입니다. 잠시 뒤 다시 시도해 주세요.'); return; }
    if (!items.length) return;
    const unreadStatements = items.filter((item) => item.section === 'statement' && item.kind === 'pdf' && !item.statementRows?.length);
    if (unreadStatements.length > 0) { setMessage(`표를 읽지 않은 입출금내역 ${unreadStatements.length}개가 있습니다. 원본 개인정보 보호를 위해 계좌 끝 4자리(비밀번호가 있으면 함께)를 입력하고 표를 읽어 주세요.`); return; }
    const protectedStatements = items.filter((item) => item.section === 'statement' && item.statementSourceRequiresPassword && !statementPasswords[item.id]);
    if (protectedStatements.length > 0) { setMessage(`원본 형식으로 제출하려면 보호된 입출금내역 ${protectedStatements.length}개의 PDF 비밀번호를 입력해 주세요. 비밀번호는 이 화면에서만 사용되고 저장되지 않습니다.`); return; }
    const categories = [...new Set(inSection('receipt').map(receiptCategory))] as string[];
    cancelled.current = false;
    setExporting(true);
    setMessage(null);
    try {
      const comparisonResults: string[] = [];
      const bytes = await assembleEvidencePdf({
        summary,
        documents: [...inSection('statement'), ...inSection('transactionProof')],
        receiptGroups: categories.map((category) => ({
          label: category === '__unlinked__' ? '미연결 영수증' : summary.buckets.flatMap((bucket) => bucket.items).find((item) => item.category === category)?.label ?? '미분류',
          receipts: inSection('receipt').filter((candidate) => receiptCategory(candidate) === category),
        })),
        scope: { periodKey, period },
        passwords: statementPasswords,
        rasterCache: raster.current,
        isCancelled: () => cancelled.current,
        onProgress: setProgress,
        ...(qualityComparison ? { onComparison: async (profileId: string, pdfBytes: Uint8Array) => {
          await saveFile(`shinhanhae_report_quality-${profileId}.pdf`, pdfBytes, 'application/pdf');
          comparisonResults.push(`${profileId} ${fileSize(pdfBytes.byteLength)}`);
        } } : {}),
      });
      if (qualityComparison) { setMessage(`압축 품질 비교 PDF 3개를 Downloads에 저장했습니다. ${comparisonResults.join(' · ')}`); return; }
      setProgress((current) => ({ current: 0, total: 1, stage: '미리보기를 준비하고 있습니다', attempt: current?.attempt ?? 1 }));
      const pageImages = await renderPreviewPages(bytes, (done, total) => setProgress((current) => current ? { ...current, current: done, total } : current), () => cancelled.current);
      previewPages.current.forEach((url) => URL.revokeObjectURL(url));
      previewPages.current = pageImages.map((image) => URL.createObjectURL(image));
      setPreviewError(null);
      setPdfPreview({ bytes, pages: previewPages.current });
    } catch (error) { setMessage(error instanceof ExportCancelled ? '미리보기 준비를 취소했습니다. 선택한 파일은 그대로 유지됩니다.' : error instanceof Error ? error.message : 'PDF를 만들지 못했습니다.'); }
    finally { setExporting(false); setProgress(null); }
  };
  const inputFingerprint = receiptFingerprint(inSection('receipt').filter((item) => item.kind === 'image'));
  useEffect(() => { setBenchmarks({}); }, [inputFingerprint]);
  const runBenchmark = async (kind: 'legacy' | 'current') => {
    const receipts = inSection('receipt').filter((item) => item.kind === 'image');
    if (addingRef.current || loadingFiles || missingFiles.length) { setMessage(missingFiles.length ? UNREADABLE_MESSAGE(missingFiles.length) : '파일을 처리하는 중입니다. 잠시 뒤 다시 시도해 주세요.'); return; }
    if (!receipts.length) { setMessage('알고리즘 비교에는 JPG·PNG·WEBP 영수증을 한 장 이상 추가해 주세요.'); return; }
    cancelled.current = false; setExporting(true); setMessage(null);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const result = await measureBenchmark({
        kind, receipts, fingerprint: inputFingerprint, profiles: PROFILES, targetBytes: TARGET_BYTES,
        cancelled: () => cancelled.current, progress: setProgress,
        create: async () => {
          const pdf = await PDFDocument.create();
          return { add: async (receipt, profile) => { const images = await compressImage(receipt.file, profile.maxEdge, profile.quality); if (cancelled.current) throw new BenchmarkCancelled(); await addRasterPages(pdf, images, () => cancelled.current); }, save: () => pdf.save({ useObjectStreams: true }) };
        },
      });
      setBenchmarks((current) => ({ ...current, [kind]: result }));
    } catch (error) { setMessage(error instanceof BenchmarkCancelled || error instanceof ExportCancelled ? '시간 측정을 취소했습니다. 선택한 파일은 그대로 유지됩니다.' : error instanceof Error ? error.message : '알고리즘 측정에 실패했습니다.'); }
    finally { setExporting(false); setProgress(null); }
  };
  const statementDetails = (item: Evidence) => item.statementRows?.length ? <><details className="statement-redaction"><summary>입출금 {item.statementRows.length}행 · 모자이크 {item.excludedStatementRowIds?.length ?? 0}행</summary><div className="statement-redaction__rows">{item.statementRows.map((row) => <label className="statement-redaction__row" key={row.id}><input type="checkbox" checked={item.excludedStatementRowIds?.includes(row.id) ?? false} onChange={() => toggleStatementRow(item.id, row.id)} /><span><b>{row.date} {row.time}</b><small>{row.summary} · {row.merchant}</small></span><em>{won(row.withdrawal || row.deposit)}</em></label>)}</div></details>{item.statementSourceRequiresPassword && <label className="statement-source-password">제출용 원본 PDF 비밀번호<input aria-label={`${item.file.name} 제출용 PDF 비밀번호`} type="password" value={statementPasswords[item.id] ?? ''} onChange={(event) => setStatementPasswords((current) => ({ ...current, [item.id]: event.target.value }))} /><small>원본 입출금내역에 모자이크를 적용해 생성할 때만 사용하며 저장하지 않습니다.</small></label>}{!item.statementRows.some((row) => row.sourcePage !== undefined && row.sourceY !== undefined) && <small className="statement-source-note">이전 형식으로 읽은 파일입니다. <br />원본 레이아웃 제출을 위해 파일을 다시 추가해 주세요.</small>}</> : null;
  const paymentTime = (payment: LedgerEntry) => new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date(payment.occurredAt));
  /**
   * 결제별 영수증: every payment of the period, those without a receipt first (newest first), then
   * linked ones. A row without a receipt opens the picker and links the chosen receipt to it;
   * a linked row jumps to its receipt card. Replaces the former 영수증 연결 확인 box.
   */
  const receiptOverview = () => {
    const receipts = reportEvidence.filter((item) => item.section === 'receipt').sort((a, b) => a.order - b.order);
    const receiptFor = (entryId: string) => receipts.find((item) => item.linkedEntryId === entryId);
    const receiptNumber = (id: string) => receipts.findIndex((item) => item.id === id) + 1;
    const newest = (left: LedgerEntry, right: LedgerEntry) => right.occurredAt.localeCompare(left.occurredAt);
    const missing = [...readiness.missingReceipts].sort(newest);
    const linked = payments.filter((payment) => receiptFor(payment.id)).sort(newest);
    const rows = [...missing.map((payment) => ({ payment, receipt: undefined as ReportEvidenceRecord | undefined })), ...(overviewMissingOnly ? [] : linked.map((payment) => ({ payment, receipt: receiptFor(payment.id) })))];
    const shown = overviewExpanded ? rows : rows.slice(0, 6);
    const busy = exporting || Boolean(adding);
    return <section className="receipt-overview" aria-label="결제별 영수증">
      <div className="receipt-overview__head"><strong>결제별 영수증</strong><span className="receipt-overview__count is-missing">영수증 없음 {missing.length}</span><span className="receipt-overview__count">연결됨 {linked.length}</span></div>
      {lostPending.length > 0 && <small className="evidence-lost-links">원본을 찾지 못해 연결이 풀린 결제 {lostPending.length}건</small>}
      {unlinkedReceiptCount > 0 && <small className="receipt-overview__note">결제와 연결 안 된 영수증 {unlinkedReceiptCount}장</small>}
      {(missing.length > 0 || unlinkedReceiptCount > 0) && <small className="receipt-overview__note" role="status"><Sentences text="연결하지 않아도 PDF를 생성할 수 있습니다. 미연결 영수증은 별도로 포함됩니다." /></small>}
      {payments.length > 0 && <label className="receipt-overview__filter"><input type="checkbox" checked={overviewMissingOnly} onChange={(event) => setOverviewMissingOnly(event.target.checked)} />영수증 없는 결제만 보기</label>}
      {shown.length > 0 && <ul>{shown.map(({ payment, receipt }) => <li key={payment.id}><button type="button" disabled={!receipt && busy} className={receipt ? 'is-linked' : 'is-missing'} aria-label={receipt ? `${payment.merchant} ${payment.amount.toLocaleString('ko-KR')}원 · 영수증 ${receiptNumber(receipt.id)} 보기` : `${payment.merchant} ${payment.amount.toLocaleString('ko-KR')}원 · 영수증 추가`} onClick={() => {
        if (receipt) { setReceiptFilter('all'); setFocusedReceipt(receipt.id); return; }
        linkTarget.current = payment; linkPicker.current?.click();
      }}>
        <span className="receipt-overview__mark" aria-hidden="true">{receipt ? receiptNumber(receipt.id) : '+'}</span>
        <span className="receipt-overview__text"><b>{payment.merchant}</b><small>{paymentTime(payment)}{receipt ? ` · 영수증 ${receiptNumber(receipt.id)}` : ' · 영수증 없음'}</small></span>
        <span className="receipt-overview__amount">{payment.amount.toLocaleString('ko-KR')}원</span>
      </button></li>)}</ul>}
      {rows.length > 6 && <button type="button" className="receipt-overview__more" onClick={() => setOverviewExpanded((value) => !value)}>{overviewExpanded ? '접기' : `${rows.length - 6}건 더 보기`}</button>}
    </section>;
  };
  const receiptStatus = (item: Evidence) => {
    // Old persisted status copy mentioned amount-based automatic matching. Do not
    // repeat those instructions after switching to date-only user selection.
    const currentMessage = item.receiptOcrMessage && !/금액|추천|자동/.test(item.receiptOcrMessage) ? item.receiptOcrMessage : undefined;
    if (item.receiptOcrStatus === 'reading' && adding) return <div className="receipt-link-priority" role="status"><small>결제 날짜 확인 중…</small></div>;
    if (item.receiptOcrStatus === 'reading' && !adding) return <div className="receipt-link-priority"><small>날짜 확인이 중단되었습니다. <br />다시 읽거나 날짜를 선택해 주세요.</small><button type="button" onClick={() => void retryReceiptOcr(item)}>영수증 다시 읽기</button></div>;
    if (item.linkedEntryId && !payments.some((payment) => payment.id === item.linkedEntryId)) return <div className="receipt-link-priority"><small>연결한 결제가 분류 필요·취소·기간 외 상태입니다. <br />분류와 기간을 확인하거나 다른 결제를 선택해 주세요.</small></div>;
    if (item.linkedEntryId) return <div className="receipt-link-priority"><strong>결제 연결 완료</strong><small>날짜 변경 또는 결제 변경이 필요하면 아래에서 다시 선택해 주세요.</small></div>;
    if (item.receiptDate && !isValidReceiptDate(item.receiptDate)) return <div className="receipt-link-priority"><small>읽은 날짜 형식이 올바르지 않습니다. <br />날짜를 직접 선택하거나 다시 읽어 주세요.</small><button type="button" onClick={() => void retryReceiptOcr(item)}>영수증 다시 읽기</button></div>;
    if (item.receiptOcrStatus === 'failed' || item.receiptOcrStatus === 'needs-input') return <div className="receipt-link-priority"><small><Sentences text={currentMessage ?? '결제 날짜를 읽지 못했습니다. 날짜를 선택해 주세요.'} /></small><button type="button" onClick={() => void retryReceiptOcr(item)}>영수증 다시 읽기</button></div>;
    return <div className="receipt-link-priority"><small><Sentences text={currentMessage ?? '결제 날짜를 선택하면 해당 날짜의 결제를 보여드립니다.'} /></small></div>;
  };
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]); const pages = items.reduce((sum, item) => sum + (item.pages ?? 1), 0); const expected = '파일 크기와 기기 성능에 따라 달라집니다'; const percent = progress ? Math.min(100, Math.round(progress.current / Math.max(1, progress.total) * 100)) : 0;
  const section = (name: ReportEvidenceSection, text?: string) => {
    const listed = inSection(name);
    const visible = name !== 'receipt' ? listed : listed.filter((item) => receiptFilter === 'all' || (receiptFilter === 'unlinked' ? !payments.some((payment) => payment.id === item.linkedEntryId) : !isValidReceiptDate(item.receiptDate)));
    return <section data-guide={name} className="evidence-group"><h3>{SECTION_LABEL[name]} <span>{listed.length}개</span></h3>{text && <p>{text}</p>}{name === 'receipt' && receiptOverview()}<label className="file-picker">{SECTION_LABEL[name]} 파일 추가<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple disabled={exporting || Boolean(adding)} onChange={(event) => { void addFiles(name, event.target.files); event.currentTarget.value = ''; }} /></label>{name === 'receipt' && <div className="receipt-task-controls"><label>영수증 보기<select aria-label="영수증 보기 필터" value={receiptFilter} onChange={(event) => setReceiptFilter(event.target.value as typeof receiptFilter)}><option value="all">전체</option><option value="unlinked">미연결</option><option value="date">날짜 확인 필요</option></select></label><button type="button" disabled={Boolean(adding) || !listed.some((item) => !payments.some((payment) => payment.id === item.linkedEntryId))} onClick={() => { const pending = listed.filter((item) => !payments.some((payment) => payment.id === item.linkedEntryId)); const next = pending[(pending.findIndex((item) => item.id === focusedReceipt) + 1) % pending.length]; if (next) { setReceiptFilter('unlinked'); setFocusedReceipt(next.id); requestAnimationFrame(() => document.getElementById(`evidence-${next.id}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })); } }}>다음 미연결 영수증</button></div>}<div className="evidence-list">{visible.map((item) => { const index = listed.findIndex((record) => record.id === item.id);
      const isLinked = payments.some((payment) => payment.id === item.linkedEntryId);
      const receiptDate = name === 'receipt' && isValidReceiptDate(item.receiptDate) ? item.receiptDate : undefined;
      const sameDayPayments = receiptDate ? payments.filter((payment) => paymentDateInKorea(payment) === receiptDate && !reportEvidence.some((evidence) => evidence.section === 'receipt' && evidence.id !== item.id && evidence.linkedEntryId === payment.id)) : [];
      return <article id={`evidence-${item.id}`} key={item.id}>{item.url ? <button type="button" className="receipt-thumbnail" onClick={() => setPreviewReceipt(item)} aria-label={`${SECTION_LABEL[name]} ${index + 1} 크게 보기`}><img src={item.url} alt={`${SECTION_LABEL[name]} ${index + 1}`} /></button> : <div className="evidence-pdf-preview" aria-label={`${SECTION_LABEL[name]} PDF`}>PDF</div>}<div className="evidence-content"><span>{item.file.name}</span>{name === 'statement' ? statementDetails(item) : null}{name === 'statement' && item.statementParseFailed ? <div className="statement-unread"><strong>{item.statementNeedsAccount ? '계좌 확인이 필요합니다' : '표를 읽지 못했습니다'}</strong><small>{item.statementNeedsAccount ? '계좌를 확인하고 표를 읽기 전까지 제출서류에 포함되지 않습니다.' : '원본 PDF는 제출서류에 포함되지 않습니다.'}</small><label>계좌 끝 4자리<input aria-label={`${item.file.name} 계좌 끝 4자리`} inputMode="numeric" maxLength={4} placeholder="0000" value={statementAccounts[item.id] ?? ''} onChange={(event) => { const value = event.target.value.replace(/\D/g, '').slice(0, 4); setStatementAccounts((current) => ({ ...current, [item.id]: value })); setStatementsWithoutAccount((current) => { const next = { ...current }; delete next[item.id]; return next; }); }} /></label><label>PDF 비밀번호 (있는 경우)<input aria-label={`${item.file.name} PDF 비밀번호`} type="password" value={statementPasswords[item.id] ?? ''} onChange={(event) => setStatementPasswords((current) => ({ ...current, [item.id]: event.target.value }))} /></label><button type="button" onClick={() => void retryStatementParse(item)}>{item.statementNeedsAccount ? '표 읽기' : '표 다시 읽기'}</button>{statementsWithoutAccount[item.id] ? <><small>파일에서 계좌번호를 확인할 수 없습니다.</small><button type="button" onClick={() => { update(item.id, statementsWithoutAccount[item.id]); setStatementsWithoutAccount((current) => { const next = { ...current }; delete next[item.id]; return next; }); setMessage('입출금내역 표를 읽었습니다. 사업과 무관한 행만 선택해 모자이크할 수 있습니다.'); }}>그래도 첨부</button></> : null}</div> : null}{name === 'transactionProof' && <label className="evidence-link">추가 증빙 결제 연결 (주거비·교통비)<select aria-label={`거래증빙 ${index + 1} 결제 연결`} value={item.linkedEntryId ?? ''} onChange={(event) => linkAdditionalProof(item.id, event.target.value)}><option value="">선택하지 않음</option>{additionalProofPayments.map((payment) => <option key={payment.id} value={payment.id}>{new Date(payment.occurredAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {payment.merchant} · {won(payment.amount)}</option>)}</select></label>}{name === 'receipt' && <details className="receipt-edit-details" open={!payments.some((payment) => payment.id === item.linkedEntryId) || expandedReceipts.has(item.id)} onToggle={(event) => { if (!payments.some((payment) => payment.id === item.linkedEntryId)) return; const open = event.currentTarget.open; setExpandedReceipts((current) => { const next = new Set(current); if (open) next.add(item.id); else next.delete(item.id); return next; }); }}><summary>{payments.some((payment) => payment.id === item.linkedEntryId) ? '연결한 영수증 확인 · 수정' : '날짜 확인 · 결제 연결'}</summary>{receiptStatus(item)}<label className="evidence-link">영수증 결제 날짜<input key={`receipt-date-${receiptDate ?? ''}`} aria-label={`영수증 ${index + 1} 날짜`} type="date" defaultValue={receiptDate ?? ''} disabled={Boolean(adding)} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => { if (isValidReceiptDate(event.target.value)) update(item.id, { receiptDate: event.target.value, receiptAutoLinked: undefined }); }} onBlur={(event) => { if (!event.target.value) update(item.id, { receiptDate: undefined, receiptAutoLinked: undefined }); }} /></label>{receiptDate && !isLinked && <div className="receipt-link-priority receipt-payment-candidates"><strong>{receiptDate} 결제 {sameDayPayments.length}건</strong>{sameDayPayments.length ? sameDayPayments.map((payment) => <button type="button" key={payment.id} onClick={() => linkReceipt(item.id, payment.id)}>{payment.merchant} · {won(payment.amount)} <small>{new Date(payment.occurredAt).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · 이 결제로 연결</small></button>) : <small>이 날짜에 연결 가능한 정책 기간 내 결제가 없습니다. <br />날짜를 바꾸거나 거래내역을 확인해 주세요.</small>}</div>}{item.linkedEntryId && <button type="button" className="receipt-unlink" onClick={() => linkReceipt(item.id, '')}>결제 연결 해제</button>}</details>}</div><div className="evidence-order"><button type="button" disabled={exporting || index === 0} onClick={() => move(name, index, -1)}>위로</button><button type="button" disabled={exporting || index === listed.length - 1} onClick={() => move(name, index, 1)}>아래로</button><button type="button" disabled={exporting || Boolean(adding)} onClick={() => remove(item)}>삭제</button></div></article>;
    })}</div></section>;
  };
  const improvement = compareBenchmarks(benchmarks.legacy, benchmarks.current);
  return <><section className="evidence-export">{adding && <p role="status">{addingSection === 'receipt' ? '파일 추가 · 날짜 확인 중' : addingSection === 'statement' ? '파일 추가 · 표 확인 중' : '파일 추가 중'} {adding.current} / {adding.total}장</p>}{missingFiles.length > 0 && <p className="evidence-message" role="alert">{UNREADABLE_MESSAGE(missingFiles.length)}</p>}{reportEvidence.length > 0 && <button type="button" className="evidence-reset" disabled={exporting || Boolean(adding)} onClick={removeAll}>보고서 초기화</button>}{items.length > 0 && <section className="evidence-summary"><strong>제출 전 요약</strong><span>첨부 {items.length}개 · 원본 {Math.ceil(totalBytes / 1024 / 1024 * 10) / 10}MB</span><small>첫 장 요약 + 원본 {pages}장 · 소요 시간은 {expected}</small><small>컬러를 유지하며 4.5MB 이하로 최적화합니다.</small></section>}{section('statement')}{section('transactionProof', '주거비·교통비 결제를 보완할 자료를 추가하세요.')}{section('receipt', '영수증에서 읽은 결제 날짜를 확인한 뒤, 같은 날짜의 결제를 한 번 눌러 연결하세요. OCR은 연결을 자동 확정하지 않습니다.')}<input ref={linkPicker} className="receipt-link-picker" type="file" aria-hidden="true" tabIndex={-1} accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" onChange={(event) => { const target = linkTarget.current; linkTarget.current = null; if (target) void addFiles('receipt', event.target.files, target); event.currentTarget.value = ''; }} />{progress && <section className="evidence-progress" role="status"><strong>{progress.stage}</strong><span>{progress.current} / {progress.total}장 처리 완료 · {percent}%</span><i aria-hidden="true"><b style={{ width: `${percent}%` }} /></i><small>{progress.measuring ? '측정 횟수와 영수증 처리 장수는 별개입니다.' : expected}</small><button type="button" onClick={() => { cancelled.current = true; }}>생성 취소</button></section>}{message && <p className="evidence-message">{message}</p>}{import.meta.env.MODE === 'internal' && <section className="evidence-benchmark"><strong>압축·알고리즘 검증 (내부 테스트)</strong><p>같은 영수증으로 과거 고화질 방식은 1회, 현재 단계형 방식은 3회 측정해 중앙값을 기록합니다.</p><button className="sheet-action" disabled={exporting || Boolean(adding) || loadingFiles || missingFiles.length > 0 || !items.length} onClick={() => void exportPdf(true)}>{exporting ? 'PDF 생성 중…' : '압축 품질 비교 생성'}</button><button className="sheet-action secondary-action" disabled={exporting || Boolean(adding)} onClick={() => void runBenchmark('legacy')}>과거 방식 시간 측정</button><button className="sheet-action secondary-action" disabled={exporting || Boolean(adding)} onClick={() => void runBenchmark('current')}>현재 방식 시간 측정</button>{(['legacy', 'current'] as const).map((kind) => benchmarks[kind] && <small key={kind}>{benchmarks[kind].label}: {benchmarks[kind].imageCount}장 · {(benchmarks[kind].elapsedMs / 1000).toFixed(2)}초 중앙값 · {Math.round(benchmarks[kind].outputBytes / 1024)}KB · {benchmarks[kind].sampleCount}회 측정</small>)}{improvement !== null && <p>{improvement} 처리 시간과 용량을 함께 비교해 주세요.</p>}</section>}<div className="evidence-export__actions"><button className="sheet-action" disabled={exporting || Boolean(adding) || loadingFiles || missingFiles.length > 0 || !items.length} onClick={() => void exportPdf()}>{exporting ? '미리보기 준비 중…' : '미리보기'}</button></div>{(recentReports.length > 0 || recentNotice) && <section className="evidence-recent-reports" aria-label="만든 보고서"><strong>만든 보고서</strong>{recentReports.length > 0 && <ul>{recentReports.map((report) => <li key={report.uri}><span><b>{reportTime(report.savedAt)}</b><small>{shortSize(report.size)}</small></span><button type="button" aria-label={`${reportTime(report.savedAt)} 보고서 열기`} onClick={() => void openReport(report)}>열기</button></li>)}</ul>}{recentNotice && <p role="alert"><Sentences text={recentNotice} /></p>}</section>}</section>{pdfPreview && <PdfPreview pages={pdfPreview.pages} sizeLabel={shortSize(pdfPreview.bytes.byteLength)} saving={savingPreview} error={previewError} onClose={closePdfPreview} onSave={() => void savePdfPreview()} />}{guideOpen && <SpotlightGuide title="사용보고서 작성 도움말" steps={PDF_GUIDE_STEPS} onClose={() => setGuideOpen(false)} />}{previewReceipt?.url && <div className="receipt-preview-backdrop" role="dialog" aria-modal="true" aria-label="영수증 크게 보기" onClick={() => setPreviewReceipt(null)}><section className="receipt-preview" onClick={(event) => event.stopPropagation()}><button type="button" aria-label="영수증 미리보기 닫기" onClick={() => setPreviewReceipt(null)}>×</button><img src={previewReceipt.url} alt={`${previewReceipt.file.name} 크게 보기`} /><small>{previewReceipt.file.name}</small></section></div>}</>;
}
