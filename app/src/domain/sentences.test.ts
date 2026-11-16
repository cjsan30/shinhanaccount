import { describe, expect, it } from 'vitest';
import { splitSentences } from './sentences';

describe('splitSentences', () => {
  it('puts each sentence of a notice on its own line', () => {
    expect(splitSentences('미리보기 준비를 취소했습니다. 선택한 파일은 그대로 유지됩니다.')).toEqual(['미리보기 준비를 취소했습니다.', '선택한 파일은 그대로 유지됩니다.']);
  });

  it('keeps decimals, amounts and a single sentence whole', () => {
    expect(splitSentences('컬러를 유지하며 4.5MB 이하로 최적화합니다.')).toEqual(['컬러를 유지하며 4.5MB 이하로 최적화합니다.']);
    expect(splitSentences('지원금이 입금됐나요? 확인해 주세요!')).toEqual(['지원금이 입금됐나요?', '확인해 주세요!']);
    expect(splitSentences('파일 2.30MB · 5,000원')).toEqual(['파일 2.30MB · 5,000원']);
  });

  it('returns nothing for empty text', () => {
    expect(splitSentences('  ')).toEqual([]);
  });
});
