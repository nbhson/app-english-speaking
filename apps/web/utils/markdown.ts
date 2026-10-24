/**
 * Convert a markdown message into plain, speakable text for TTS.
 * Removes markup that speech engines would read aloud ("star star", "dash",
 * "pipe"), including emoji that some voices narrate by name.
 */
export function stripMarkdownForSpeech(text: string): string {
  let out = text;
  // Images (keep alt text) and links (keep label)
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Fenced code blocks: keep the content, drop fence markers/annotations
  out = out.replace(/```[\w-]*\n([\s\S]*?)```/g, (_m, code: string) => ` ${code}`);
  out = out.replace(/```[\w-]*\n?/g, ' ');
  // Headings
  out = out.replace(/^#{1,6}\s+/gm, '');
  // Blockquotes (quote markers only)
  out = out.replace(/^\s*>\s?/gm, '');
  // Table separator rows and pipe characters
  out = out.replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ');
  out = out.replace(/\s*\|/g, ' ');
  // Bold / italic / strikethrough
  out = out.replace(/\*\*\*([^*]+?)\*\*\*/g, '$1');
  out = out.replace(/\*\*([^*]+?)\*\*/g, '$1');
  out = out.replace(/__([^_]+?)__/g, '$1');
  out = out.replace(/\*([^*]+?)\*/g, '$1');
  out = out.replace(/~~([^~]+?)~~/g, '$1');
  out = out.replace(/(^|\s)_([^_]+?)_(?=\s|$|[.,!?])/g, '$1$2');
  // Inline code
  out = out.replace(/`([^`]+?)`/g, '$1');
  // List markers (bullet and numeric) — turn them into plain lines
  out = out.replace(/^\s*[-*•]\s+/gm, '');
  out = out.replace(/^\s*\d+[.)]\s+/gm, '');
  // Horizontal rules
  out = out.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '');
  // Emoji & symbol pictographs that voices read by name
  out = out.replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '');
  for (const ch of ['\uFE0E', '\uFE0F', '\u200D', '\u20E3']) {
    out = out.split(ch).join('');
  }
  // Collapse remaining markup residue and whitespace
  out = out.replace(/[*_`#>|]+/g, '');
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('. ');
  return out.trim();
}
