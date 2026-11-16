import { Fragment } from 'react';
import { splitSentences } from '../domain/sentences';

/**
 * Renders a notice with every sentence starting on a new line (decision 2026-11-16).
 * The space before each break keeps the read-out text (screen readers, copy) as one spaced sentence list.
 */
export function Sentences({ text }: { text: string }) {
  return <>{splitSentences(text).map((sentence, index) => <Fragment key={index}>{index > 0 && <>{' '}<br /></>}{sentence}</Fragment>)}</>;
}
