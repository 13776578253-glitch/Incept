export const CODEX_AUTO_REVIEW_MODEL = 'codex-auto-review-unpriced';

export function isCodexAutoReviewModel(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized === 'codex-auto-review' || normalized === CODEX_AUTO_REVIEW_MODEL;
}
