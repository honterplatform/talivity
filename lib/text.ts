/**
 * Text helpers shared by the parser (matching) and the report (display).
 */

/**
 * Normalise typographic characters so ASCII-written regexes match every
 * model's output. Claude and Gemini frequently emit curly apostrophes
 * ("I don’t have…"), which silently broke the old not-recognized patterns.
 */
export function normalizeText(s: string): string {
  return s
    .replace(/[‘’‚‛′´`]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[   ]/g, ' ');
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip Markdown so verbatim quotes don't show literal `**`, `###` or `[x](y)`.
 * Keeps paragraph breaks and turns list markers into bullets.
 */
export function stripMarkdown(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((?:[^)(]|\([^)]*\))*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?![\w])/g, '$1$2')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * If a response was cut off by the token limit mid-sentence, end it at the
 * last complete sentence (when that keeps most of the text) or add an ellipsis.
 */
export function trimToSentence(s: string): string {
  const text = s.trim();
  if (!text) return text;
  if (/[.!?…)"'”’]$/.test(text)) return text;
  const lastStop = Math.max(
    text.lastIndexOf('. '),
    text.lastIndexOf('! '),
    text.lastIndexOf('? '),
    text.lastIndexOf('.\n'),
    text.lastIndexOf('!\n'),
    text.lastIndexOf('?\n')
  );
  if (lastStop > text.length * 0.6) return text.slice(0, lastStop + 1).trim();
  return text.replace(/[\s,;:–—-]+$/, '') + '…';
}

/** Display-ready version of a raw model answer. */
export function cleanResponseForDisplay(s: string): string {
  return trimToSentence(stripMarkdown(normalizeText(s)));
}
