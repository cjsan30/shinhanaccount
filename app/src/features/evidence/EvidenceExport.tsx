import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { SpotlightGuide, type GuideStep } from '../../components/SpotlightGuide';
import { openLatestSavedFile, saveFile } from '../../native/fileExport';
import { loadEvidence, removeStoredEvidence, storeEvidence } from '../../native/evidenceVault';
import type { ReportEvidenceRecord, ReportEvidenceSection } from '../../domain/reportEvidence';
import { paymentDateInKorea } from '../../domain/receiptMatching';
import { toStatementRows } from '../../domain/statementImport';
import type { LedgerEntry } from '../../domain/ledger';
import { getReportReadiness } from '../../domain/reportReadiness';
import { parseShinhanBankPdfExport } from '../../domain/shinhanBankImport';
import type { PolicyPeriod } from '../../domain/budget';
import { isValidReceiptDate } from '../../domain/receiptOcr';
import { addRasterPages, assembleEvidencePdf } from './pipeline/assemble';
import { compressImage, pdfPages, recognizeReceiptDetails, resolvedReceiptPatch } from './pipeline/render';
import { ExportCancelled, SECTION_LABEL, PROFILES, TARGET_BYTES, type RasterImage, type ReportSummary } from './pipeline/types';
export type { ReportSummary } from './pipeline/types';

type EvidenceKind = 'image' | 'pdf';
type Evidence = ReportEvidenceRecord & { file: File; kind: EvidenceKind; url?: string; pages?: number };
type Progress = { current: number; total: number; stage: string; attempt: number; measuring?: boolean };
import { BenchmarkCancelled, compareBenchmarks, measureBenchmark, receiptFingerprint, type BenchmarkResult } from './benchmark';
const PDF_GUIDE_STEPS: readonly GuideStep[] = [
  { target: '[data-guide="statement"] > .file-picker', title: '입출금내역을 추가하세요', body: '은행 또는 카드사에서 받은 파일을 추가하세요. 보호된 PDF는 비밀번호를 입력해 다시 읽을 수 있어요.' },
  { target: '.statement-redaction > summary', fallbackTarget: '[data-guide="statement"] > .file-picker', title: '가릴 내역을 확인하세요', body: '파일의 상세보기를 열어 사업 무관 거래를 선택하세요. 선택한 행은 회색으로 가려지며, 입금과 정책 기간 외 행은 자동으로 가려집니다.' },
  { target: '[data-guide="transactionProof"] > .file-picker', title: '추가 증빙은 필요한 경우만', body: '주거비·교통비에 필요한 계좌이체 확인서 등의 자료가 있다면 해당 결제에 연결하세요.' },
  { target: '[data-guide="receipt"] > .file-picker', title: '영수증을 추가하세요', body: '사진이나 스캔 이미지를 추가하세요. 추가된 영수증의 썸네일을 누르면 사진을 크게 볼 수 있어요.' },
  { target: '[data-guide="receipt"] .receipt-payment-candidates', fallbackTarget: '[data-guide="receipt"] .evidence-link', title: '필요하면 결제를 연결하세요', body: '읽어온 날짜를 확인하거나 직접 선택한 뒤 같은 날짜의 결제를 한 번 눌러 연결하세요. 연결은 선택 사항입니다.' },
  { target: '.evidence-export__actions', title: 'PDF를 생성하세요', body: '미연결 경고가 있어도 생성할 수 있고, 미연결 영수증도 별도로 포함됩니다. 생성 후 미리보기로 누락과 글자 선명도를 확인하세요. 파일은 5MB 이하로 자동 최적화하며, 불가능하면 안내합니다.' },
];

const MAX_EVIDENCE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EVIDENCE_TOTAL_BYTES = 120 * 1024 * 1024;
const won = (value: number) => `${Math.max(0, value).toLocaleString('ko-KR')}원`;
const fileSize = (value: number) => `${value.toLocaleString('ko-KR')}B (${(value / 1024 / 1024).toFixed(2)}MB)`;
const supported = (file: File) => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
const kindOf = (file: File): EvidenceKind => file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'pdf' : 'image';





export function EvidenceExport({ helpRequest = 0, reportEvidence, onReportEvidenceChange, summary, entries, periodKey, period }: { helpRequest?: number; reportEvidence: ReportEvidenceRecord[]; onReportEvidenceChange: Dispatch<SetStateAction<ReportEvidenceRecord[]>>; summary: ReportSummary; entries: LedgerEntry[]; periodKey: string; period?: PolicyPeriod }) {
  useEffect(() => { if (helpRequest > 0) setGuideOpen(true); }, [helpRequest]);
  const [adding, setAdding] = useState<{ current: number; total: number } | null>(null);
  const [addingSection, setAddingSection] = useState<ReportEvidenceSection>('receipt');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const addingRef = useRef(false);
  const loadedFiles = useRef(new Map<string, Evidence>());
  const [missingFiles, setMissingFiles] = useState<ReportEvidenceRecord[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [receiptFilter, setReceiptFilter] = useState<'all' | 'unlinked' | 'date'>('all');
  const [focusedReceipt, setFocusedReceipt] = useState<string | null>(null);
  const [expandedReceipts, setExpandedReceipts] = useState(new Set<string>());
  useEffect(() => { if (focusedReceipt) document.getElementById('evidence-' + focusedReceipt)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }, [focusedReceipt, receiptFilter]);
  const [items, setItems] = useState<Evidence[]>([]); const [message, setMessage] = useState<string | null>(null); const [exporting, setExporting] = useState(false); const [progress, setProgress] = useState<Progress | null>(null); const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null); const [benchmarks, setBenchmarks] = useState<Partial<Record<'legacy' | 'current', BenchmarkResult>>>({}); const [statementPasswords, setStatementPasswords] = useState<Record<string, string>>({}); const [previewReceipt, setPreviewReceipt] = useState<Evidence | null>(null); const [guideOpen, setGuideOpen] = useState(false); const urls = useRef(new Set<string>()); const raster = useRef(new Map<string, RasterImage[]>()); const cancelled = useRef(false);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []); useEffect(() => () => { if (resultPreviewUrl) URL.revokeObjectURL(resultPreviewUrl); }, [resultPreviewUrl]);
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
      } catch { return null; }
    })).then((loaded) => {
      if (disposed) return;
      setItems(loaded.filter((item): item is Evidence => item !== null));
      setMissingFiles(reportEvidence.filter((_, index) => loaded[index] === null)); setLoadingFiles(false);
    });
    return () => { disposed = true; };
  }, [reportEvidence]);
  useEffect(() => { let disposed = false; const pending = items.filter((item) => item.kind === 'pdf' && !item.pages); void Promise.all(pending.map(async (item) => { let pages = 1; try { pages = await pdfPages(item.file); } catch { /* export will give a readable error */ } if (!disposed) { const cached = loadedFiles.current.get(item.id); if (cached) loadedFiles.current.set(item.id, { ...cached, pages }); setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, pages } : candidate)); } })); return () => { disposed = true; }; }, [items]);
  const inSection = (section: ReportEvidenceSection) => items.filter((item) => item.section === section).sort((a, b) => a.order - b.order);
  const addFiles = async (section: ReportEvidenceSection, files: FileList | null) => {
    if (!files || addingRef.current || exporting) return;
    const selected = [...files];
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
          const record: ReportEvidenceRecord = { id: crypto.randomUUID(), stored, section, order: 0, ...(section === 'receipt' && kindOf(file) === 'image' ? { receiptOcrStatus: 'reading' } : {}) };
          const kind = kindOf(file); const url = kind === 'image' ? URL.createObjectURL(file) : undefined;
          if (url) urls.current.add(url);
          loadedFiles.current.set(record.id, { ...record, file, kind, url, pages: kind === 'image' ? 1 : undefined });
          pending.push({ record, file });
          onReportEvidenceChange((current) => [...current, { ...record, order: Math.max(-1, ...current.filter((item) => item.section === section).map((item) => item.order)) + 1 }]);
        } catch { setMessage(`${file.name}을 저장하지 못했습니다. 다시 추가해 주세요.`); }
      }
      for (const [index, { record, file }] of pending.entries()) {
        let patch: Partial<ReportEvidenceRecord> = {};
        if (section === 'receipt' && kindOf(file) === 'image') {
          try { const details = await recognizeReceiptDetails(file); patch = { receiptDate: details.date, ...resolvedReceiptPatch(details) }; }
          catch { patch = { receiptOcrStatus: 'failed', receiptOcrMessage: '이미지에서 결제 날짜를 읽지 못했습니다. 날짜를 선택하거나 다시 읽어 주세요.' }; }
        } else if (section === 'statement' && kindOf(file) === 'pdf') {
          try { patch = { statementRows: toStatementRows(await parseShinhanBankPdfExport(await file.arrayBuffer())), excludedStatementRowIds: [], statementParseFailed: false, statementSourceRequiresPassword: false }; }
          catch { patch = { statementParseFailed: true }; setMessage('입출금내역 표를 읽지 못했습니다. 비밀번호를 입력해 다시 읽어 주세요.'); }
        }
        onReportEvidenceChange((current) => current.map((item) => item.id === record.id ? { ...item, ...patch } : item));
        setAdding({ current: index + 1, total: pending.length });
      }
    } finally { addingRef.current = false; setAdding(null); }
  };
  const reattachOriginal = async (record: ReportEvidenceRecord, file: File | undefined) => {
    if (!file || addingRef.current || exporting) return;
    if (!supported(file) || !file.size || file.size > MAX_EVIDENCE_FILE_BYTES || kindOf(file) !== (/\.pdf$/i.test(record.stored.fileName) || record.stored.mimeType === 'application/pdf' ? 'pdf' : 'image') || reportEvidence.reduce((sum, item) => sum + item.stored.size, 0) - record.stored.size + file.size > MAX_EVIDENCE_TOTAL_BYTES) {
      setMessage('원본과 같은 종류의 파일을 선택해 주세요. 파일 하나는 20MB, 합계는 120MB 이하입니다.'); return;
    }
    addingRef.current = true; setAddingSection(record.section); setAdding({ current: 0, total: 1 });
    try {
      const stored = await storeEvidence(file);
      const next: ReportEvidenceRecord = { id: record.id, stored, section: record.section, order: record.order };
      if (record.section === 'receipt' && kindOf(file) === 'image') {
        try { const details = await recognizeReceiptDetails(file); Object.assign(next, { receiptDate: details.date, ...resolvedReceiptPatch(details) }); }
        catch { next.receiptOcrStatus = 'failed'; }
      }
      if (record.section === 'statement' && kindOf(file) === 'pdf') {
        try { next.statementRows = toStatementRows(await parseShinhanBankPdfExport(await file.arrayBuffer())); }
        catch { next.statementParseFailed = true; }
      }
      loadedFiles.current.delete(record.id); raster.current.clear();
      setStatementPasswords((current) => { const next = { ...current }; delete next[record.id]; return next; });
      onReportEvidenceChange((current) => current.map((item) => item.id === record.id ? next : item));
      setMessage('원본 파일을 다시 추가했습니다. 날짜와 결제 연결을 다시 확인해 주세요.');
    } catch { setMessage('원본 파일을 저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { addingRef.current = false; setAdding(null); }
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
  const unlinkedReceiptCount = reportEvidence.filter((item) => item.section === 'receipt' && !payments.some((payment) => payment.id === item.linkedEntryId)).length;
  const receiptWarning = readiness.missingReceipts.length || unlinkedReceiptCount ? `영수증 미연결 결제 ${readiness.missingReceipts.length}건 · 결제 미연결 영수증 ${unlinkedReceiptCount}장. 연결하지 않아도 PDF를 생성할 수 있습니다. 미연결 영수증은 별도로 포함됩니다.` : '';
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
    try {
      const password = statementPasswords[item.id];
      const rows = toStatementRows(await parseShinhanBankPdfExport(await item.file.arrayBuffer(), password || undefined));
      if (!rows.length) throw new Error('입출금 행을 찾지 못했습니다.');
      update(item.id, { statementRows: rows, excludedStatementRowIds: [], statementParseFailed: false, statementSourceRequiresPassword: Boolean(password) });
      setMessage('입출금내역 표를 읽었습니다. 사업과 무관한 행만 선택해 가릴 수 있습니다.');
    } catch {
      setMessage('입출금내역 표를 읽지 못했습니다. PDF 비밀번호와 파일 형식을 확인해 주세요.');
    }
  };
  const move = (section: ReportEvidenceSection, index: number, direction: -1 | 1) => onReportEvidenceChange((current) => { const ordered = current.filter((item) => item.section === section).sort((left, right) => left.order - right.order); const target = index + direction; if (target < 0 || target >= ordered.length) return current; const left = ordered[index]; const right = ordered[target]; return current.map((item) => item.id === left.id ? { ...item, order: right.order } : item.id === right.id ? { ...item, order: left.order } : item); });
  const remove = (item: Evidence) => { if (item.url) { URL.revokeObjectURL(item.url); urls.current.delete(item.url); } loadedFiles.current.delete(item.id); raster.current.clear(); onReportEvidenceChange((current) => current.filter((record) => record.id !== item.id)); void removeStoredEvidence(item.stored).catch(() => undefined); };
  const exportPdf = async (qualityComparison = false) => {
    if (addingRef.current || loadingFiles || missingFiles.length) { setMessage('처리 중이거나 원본을 찾지 못한 파일이 있습니다. 원본 파일을 다시 추가한 뒤 생성해 주세요.'); return; }
    if (!items.length) return;
    const unreadStatements = items.filter((item) => item.section === 'statement' && item.kind === 'pdf' && !item.statementRows?.length);
    if (unreadStatements.length > 0) { setMessage(`표를 읽지 못한 입출금내역 ${unreadStatements.length}개가 있습니다. 원본 개인정보 보호를 위해 비밀번호 입력 후 다시 읽어 주세요.`); return; }
    const protectedStatements = items.filter((item) => item.section === 'statement' && item.statementSourceRequiresPassword && !statementPasswords[item.id]);
    if (protectedStatements.length > 0) { setMessage(`원본 형식으로 제출하려면 보호된 입출금내역 ${protectedStatements.length}개의 PDF 비밀번호를 입력해 주세요. 비밀번호는 이 화면에서만 사용되고 저장되지 않습니다.`); return; }
    const categories = [...new Set(inSection('receipt').map(receiptCategory))] as string[];
    cancelled.current = false;
    setExporting(true);
    setMessage(null);
    const showPreview = (bytes: Uint8Array) => setResultPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })); });
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
          showPreview(pdfBytes);
        } } : {}),
      });
      if (qualityComparison) { setMessage(`압축 품질 비교 PDF 3개를 Downloads에 저장했습니다. ${comparisonResults.join(' · ')}`); return; }
      setProgress((current) => current ? { ...current, stage: 'Downloads에 저장하고 있습니다' } : current);
      const result = await saveFile('shinhanhae_report_evidence.pdf', bytes, 'application/pdf');
      showPreview(bytes);
      setMessage(`${result.fileName}을 ${result.relativePath}에 저장했습니다. ${fileSize(bytes.byteLength)}${receiptWarning ? ` · ${receiptWarning}` : ''}`);
    } catch (error) { setMessage(error instanceof ExportCancelled ? 'PDF 생성을 취소했습니다. 선택한 파일은 그대로 유지됩니다.' : error instanceof Error ? error.message : 'PDF를 만들지 못했습니다.'); }
    finally { setExporting(false); setProgress(null); }
  };
  const inputFingerprint = receiptFingerprint(inSection('receipt').filter((item) => item.kind === 'image'));
  useEffect(() => { setBenchmarks({}); }, [inputFingerprint]);
  const runBenchmark = async (kind: 'legacy' | 'current') => {
    const receipts = inSection('receipt').filter((item) => item.kind === 'image');
    if (addingRef.current || loadingFiles || missingFiles.length) { setMessage('파일 처리를 완료하고 누락된 원본을 다시 추가해 주세요.'); return; }
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
  const statementDetails = (item: Evidence) => item.statementRows?.length ? <><details className="statement-redaction"><summary>입출금 {item.statementRows.length}행 · 제외 {item.excludedStatementRowIds?.length ?? 0}행</summary><div className="statement-redaction__rows">{item.statementRows.map((row) => <label className="statement-redaction__row" key={row.id}><input type="checkbox" checked={item.excludedStatementRowIds?.includes(row.id) ?? false} onChange={() => toggleStatementRow(item.id, row.id)} /><span><b>{row.date} {row.time}</b><small>{row.summary} · {row.merchant}</small></span><em>{won(row.withdrawal || row.deposit)}</em></label>)}</div></details>{item.statementSourceRequiresPassword && <label className="statement-source-password">제출용 원본 PDF 비밀번호<input aria-label={`${item.file.name} 제출용 PDF 비밀번호`} type="password" value={statementPasswords[item.id] ?? ''} onChange={(event) => setStatementPasswords((current) => ({ ...current, [item.id]: event.target.value }))} /><small>원본 입출금내역의 제외 행을 회색으로 가려 생성할 때만 사용하며 저장하지 않습니다.</small></label>}{!item.statementRows.some((row) => row.sourcePage !== undefined && row.sourceY !== undefined) && <small className="statement-source-note">이전 형식으로 읽은 파일입니다. 원본 레이아웃 제출을 위해 파일을 다시 추가해 주세요.</small>}</> : null;
  const receiptStatus = (item: Evidence) => {
    // Old persisted status copy mentioned amount-based automatic matching. Do not
    // repeat those instructions after switching to date-only user selection.
    const currentMessage = item.receiptOcrMessage && !/금액|추천|자동/.test(item.receiptOcrMessage) ? item.receiptOcrMessage : undefined;
    if (item.receiptOcrStatus === 'reading' && adding) return <div className="receipt-link-priority" role="status"><small>결제 날짜 확인 중…</small></div>;
    if (item.receiptOcrStatus === 'reading' && !adding) return <div className="receipt-link-priority"><small>날짜 확인이 중단되었습니다. 다시 읽거나 날짜를 선택해 주세요.</small><button type="button" onClick={() => void retryReceiptOcr(item)}>영수증 다시 읽기</button></div>;
    if (item.linkedEntryId && !payments.some((payment) => payment.id === item.linkedEntryId)) return <div className="receipt-link-priority"><small>연결한 결제가 미정·취소·기간 외 상태입니다. 분류와 기간을 확인하거나 다른 결제를 선택해 주세요.</small></div>;
    if (item.linkedEntryId) return <div className="receipt-link-priority"><strong>결제 연결 완료</strong><small>날짜 변경 또는 결제 변경이 필요하면 아래에서 다시 선택해 주세요.</small></div>;
    if (item.receiptDate && !isValidReceiptDate(item.receiptDate)) return <div className="receipt-link-priority"><small>읽은 날짜 형식이 올바르지 않습니다. 날짜를 직접 선택하거나 다시 읽어 주세요.</small><button type="button" onClick={() => void retryReceiptOcr(item)}>영수증 다시 읽기</button></div>;
    if (item.receiptOcrStatus === 'failed' || item.receiptOcrStatus === 'needs-input') return <div className="receipt-link-priority"><small>{currentMessage ?? '결제 날짜를 읽지 못했습니다. 날짜를 선택해 주세요.'}</small><button type="button" onClick={() => void retryReceiptOcr(item)}>영수증 다시 읽기</button></div>;
    return <div className="receipt-link-priority"><small>{currentMessage ?? '결제 날짜를 선택하면 해당 날짜의 결제를 보여드립니다.'}</small></div>;
  };
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]); const pages = items.reduce((sum, item) => sum + (item.pages ?? 1), 0); const expected = '파일 크기와 기기 성능에 따라 달라집니다'; const percent = progress ? Math.min(100, Math.round(progress.current / Math.max(1, progress.total) * 100)) : 0;
  const section = (name: ReportEvidenceSection, text: string) => {
    const listed = inSection(name);
    const visible = name !== 'receipt' ? listed : listed.filter((item) => receiptFilter === 'all' || (receiptFilter === 'unlinked' ? !payments.some((payment) => payment.id === item.linkedEntryId) : !isValidReceiptDate(item.receiptDate)));
    return <section data-guide={name} className="evidence-group"><h3>{SECTION_LABEL[name]} <span>{listed.length}개</span></h3><p>{text}</p>{name === 'receipt' && <section className="evidence-missing"><strong>영수증 연결 확인</strong><span>결제 {readiness.payments.length}건 · 연결 {readiness.linkedEntryIds.size}건 · 미연결 {readiness.missingReceipts.length}건</span>{receiptWarning && <small role="status">{receiptWarning}</small>}</section>}<label className="file-picker">{SECTION_LABEL[name]} 파일 추가<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple disabled={exporting || Boolean(adding)} onChange={(event) => { void addFiles(name, event.target.files); event.currentTarget.value = ''; }} /></label>{name === 'receipt' && <div className="receipt-task-controls"><label>영수증 보기<select aria-label="영수증 보기 필터" value={receiptFilter} onChange={(event) => setReceiptFilter(event.target.value as typeof receiptFilter)}><option value="all">전체</option><option value="unlinked">미연결</option><option value="date">날짜 확인 필요</option></select></label><button type="button" disabled={Boolean(adding) || !listed.some((item) => !payments.some((payment) => payment.id === item.linkedEntryId))} onClick={() => { const pending = listed.filter((item) => !payments.some((payment) => payment.id === item.linkedEntryId)); const next = pending[(pending.findIndex((item) => item.id === focusedReceipt) + 1) % pending.length]; if (next) { setReceiptFilter('unlinked'); setFocusedReceipt(next.id); requestAnimationFrame(() => document.getElementById(`evidence-${next.id}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })); } }}>다음 미연결 영수증</button></div>}<div className="evidence-list">{visible.map((item) => { const index = listed.findIndex((record) => record.id === item.id);
      const isLinked = payments.some((payment) => payment.id === item.linkedEntryId);
      const receiptDate = name === 'receipt' && isValidReceiptDate(item.receiptDate) ? item.receiptDate : undefined;
      const sameDayPayments = receiptDate ? payments.filter((payment) => paymentDateInKorea(payment) === receiptDate && !reportEvidence.some((evidence) => evidence.section === 'receipt' && evidence.id !== item.id && evidence.linkedEntryId === payment.id)) : [];
      return <article id={`evidence-${item.id}`} key={item.id}>{item.url ? <button type="button" className="receipt-thumbnail" onClick={() => setPreviewReceipt(item)} aria-label={`${SECTION_LABEL[name]} ${index + 1} 크게 보기`}><img src={item.url} alt={`${SECTION_LABEL[name]} ${index + 1}`} /></button> : <div className="evidence-pdf-preview" aria-label={`${SECTION_LABEL[name]} PDF`}>PDF</div>}<div className="evidence-content"><span>{item.file.name}</span>{name === 'statement' ? statementDetails(item) : null}{name === 'statement' && item.statementParseFailed ? <div className="statement-unread"><strong>표를 읽지 못했습니다</strong><small>원본 PDF는 제출서류에 포함되지 않습니다.</small><label>PDF 비밀번호<input aria-label={`${item.file.name} PDF 비밀번호`} type="password" value={statementPasswords[item.id] ?? ''} onChange={(event) => setStatementPasswords((current) => ({ ...current, [item.id]: event.target.value }))} /></label><button type="button" onClick={() => void retryStatementParse(item)}>표 다시 읽기</button></div> : null}{name === 'transactionProof' && <label className="evidence-link">추가 증빙 결제 연결 (주거비·교통비)<select aria-label={`거래증빙 ${index + 1} 결제 연결`} value={item.linkedEntryId ?? ''} onChange={(event) => linkAdditionalProof(item.id, event.target.value)}><option value="">선택하지 않음</option>{additionalProofPayments.map((payment) => <option key={payment.id} value={payment.id}>{new Date(payment.occurredAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {payment.merchant} · {won(payment.amount)}</option>)}</select></label>}{name === 'receipt' && <details className="receipt-edit-details" open={!payments.some((payment) => payment.id === item.linkedEntryId) || expandedReceipts.has(item.id)} onToggle={(event) => { if (!payments.some((payment) => payment.id === item.linkedEntryId)) return; const open = event.currentTarget.open; setExpandedReceipts((current) => { const next = new Set(current); if (open) next.add(item.id); else next.delete(item.id); return next; }); }}><summary>{payments.some((payment) => payment.id === item.linkedEntryId) ? '연결한 영수증 확인 · 수정' : '날짜 확인 · 결제 연결'}</summary>{receiptStatus(item)}<label className="evidence-link">영수증 결제 날짜<input key={`receipt-date-${receiptDate ?? ''}`} aria-label={`영수증 ${index + 1} 날짜`} type="date" defaultValue={receiptDate ?? ''} disabled={Boolean(adding)} onBlur={(event) => update(item.id, { receiptDate: event.target.value || undefined, receiptAutoLinked: undefined })} /></label>{receiptDate && !isLinked && <div className="receipt-link-priority receipt-payment-candidates"><strong>{receiptDate} 결제 {sameDayPayments.length}건</strong>{sameDayPayments.length ? sameDayPayments.map((payment) => <button type="button" key={payment.id} onClick={() => linkReceipt(item.id, payment.id)}>{payment.merchant} · {won(payment.amount)} <small>{new Date(payment.occurredAt).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · 이 결제로 연결</small></button>) : <small>이 날짜에 연결 가능한 정책 기간 내 결제가 없습니다. 날짜를 바꾸거나 거래내역을 확인해 주세요.</small>}</div>}{item.linkedEntryId && <button type="button" className="receipt-unlink" onClick={() => linkReceipt(item.id, '')}>결제 연결 해제</button>}</details>}</div><div className="evidence-order"><button type="button" disabled={exporting || index === 0} onClick={() => move(name, index, -1)}>위로</button><button type="button" disabled={exporting || index === listed.length - 1} onClick={() => move(name, index, 1)}>아래로</button><button type="button" disabled={exporting || Boolean(adding)} onClick={() => remove(item)}>삭제</button></div></article>;
    })}</div></section>;
  };
  const improvement = compareBenchmarks(benchmarks.legacy, benchmarks.current);
  return <><section className="evidence-export">{adding && <p role="status">{addingSection === 'receipt' ? '파일 추가 · 날짜 확인 중' : addingSection === 'statement' ? '파일 추가 · 표 확인 중' : '파일 추가 중'} {adding.current} / {adding.total}장</p>}{missingFiles.length > 0 && <section className="evidence-missing" role="alert"><strong>원본 파일 {missingFiles.length}개를 찾지 못했습니다</strong><p>원본을 다시 추가해야 전체 제출 PDF를 생성할 수 있습니다. 아래에서 같은 파일을 선택하거나 첨부를 삭제해 주세요.</p>{missingFiles.map((record) => <div key={record.id}><span>{record.stored.fileName}</span><label className="file-picker">원본 다시 추가<input type="file" aria-label={`${record.stored.fileName} 원본 다시 추가`} disabled={Boolean(adding) || exporting} accept={record.stored.mimeType === 'application/pdf' ? '.pdf,application/pdf' : 'image/jpeg,image/png,image/webp'} onChange={(event) => { void reattachOriginal(record, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><button type="button" disabled={Boolean(adding) || exporting} onClick={() => onReportEvidenceChange((current) => current.filter((item) => item.id !== record.id))}>누락 첨부 삭제</button></div>)}</section>}<p>지원금 사용 요약을 첫 장에 만들고, 이후 입출금내역·거래증빙·세부 항목별 영수증 순서로 정리합니다. 연결한 영수증은 세부 항목별로, 연결하지 않은 영수증은 별도로 모아 정리합니다.</p>{items.length > 0 && <section className="evidence-summary"><strong>제출 전 요약</strong><span>첨부 {items.length}개 · 원본 {Math.ceil(totalBytes / 1024 / 1024 * 10) / 10}MB</span><small>첫 장 요약 + 원본 {pages}장 · 소요 시간은 {expected}</small><small>컬러를 유지하며 5MB 이하로 최적화합니다.</small></section>}{section('statement', '은행 또는 카드사에서 받은 입출금·이용내역 파일을 먼저 넣어 주세요.')}{section('transactionProof', '주거비·교통비 결제를 보완할 계좌이체 확인서 등 자료가 있다면 해당 결제에 연결하세요.')}{section('receipt', '영수증에서 읽은 결제 날짜를 확인한 뒤, 같은 날짜의 결제를 한 번 눌러 연결하세요. OCR은 연결을 자동 확정하지 않습니다.')}{progress && <section className="evidence-progress" role="status"><strong>{progress.stage}</strong><span>{progress.current} / {progress.total}장 처리 완료 · {percent}%</span><i aria-hidden="true"><b style={{ width: `${percent}%` }} /></i><small>{progress.measuring ? '측정 횟수와 영수증 처리 장수는 별개입니다.' : expected}</small><button type="button" onClick={() => { cancelled.current = true; }}>생성 취소</button></section>}{message && <p className="evidence-message">{message}</p>}{resultPreviewUrl && <section className="evidence-result-preview"><strong>생성 결과</strong><button className="sheet-action" type="button" onClick={() => void openLatestSavedFile(resultPreviewUrl, 'application/pdf').catch(() => setMessage('PDF를 열지 못했습니다. Downloads/신청해 계산기에서 직접 열어 주세요.'))}>미리보기</button><small>기기에 설치된 PDF 앱에서 파일을 엽니다.</small></section>}{import.meta.env.MODE === 'internal' && <section className="evidence-benchmark"><strong>압축·알고리즘 검증 (내부 테스트)</strong><p>같은 영수증으로 과거 고화질 방식은 1회, 현재 단계형 방식은 3회 측정해 중앙값을 기록합니다.</p><button className="sheet-action" disabled={exporting || Boolean(adding) || loadingFiles || missingFiles.length > 0 || !items.length} onClick={() => void exportPdf(true)}>{exporting ? 'PDF 생성 중…' : '압축 품질 비교 생성'}</button><button className="sheet-action secondary-action" disabled={exporting || Boolean(adding)} onClick={() => void runBenchmark('legacy')}>과거 방식 시간 측정</button><button className="sheet-action secondary-action" disabled={exporting || Boolean(adding)} onClick={() => void runBenchmark('current')}>현재 방식 시간 측정</button>{(['legacy', 'current'] as const).map((kind) => benchmarks[kind] && <small key={kind}>{benchmarks[kind].label}: {benchmarks[kind].imageCount}장 · {(benchmarks[kind].elapsedMs / 1000).toFixed(2)}초 중앙값 · {Math.round(benchmarks[kind].outputBytes / 1024)}KB · {benchmarks[kind].sampleCount}회 측정</small>)}{improvement !== null && <p>{improvement} 처리 시간과 용량을 함께 비교해 주세요.</p>}</section>}<div className="evidence-export__actions"><button className="sheet-action" disabled={exporting || Boolean(adding) || loadingFiles || missingFiles.length > 0 || !items.length} onClick={() => void exportPdf()}>{exporting ? 'PDF 생성 중…' : 'PDF 생성'}</button></div></section>{guideOpen && <SpotlightGuide title="PDF 생성 도움말" steps={PDF_GUIDE_STEPS} onClose={() => setGuideOpen(false)} />}{previewReceipt?.url && <div className="receipt-preview-backdrop" role="dialog" aria-modal="true" aria-label="영수증 크게 보기" onClick={() => setPreviewReceipt(null)}><section className="receipt-preview" onClick={(event) => event.stopPropagation()}><button type="button" aria-label="영수증 미리보기 닫기" onClick={() => setPreviewReceipt(null)}>×</button><img src={previewReceipt.url} alt={`${previewReceipt.file.name} 크게 보기`} /><small>{previewReceipt.file.name}</small></section></div>}</>;
}
