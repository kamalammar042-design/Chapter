// Some models write LaTeX as \( ... \) and \[ ... \]; remark-math only reads
// $ ... $ and $$ ... $$. Converts the former outside code spans and fences.
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;
const DISPLAY = /\\\[([\s\S]+?)\\\]/g;
const INLINE = /\\\(([\s\S]+?)\\\)/g;

export function normalizeMathDelimiters(text: string): string {
  if (!text.includes('\\(') && !text.includes('\\[')) return text;
  return text
    .split(CODE)
    .map((part, i) => (i % 2 === 1 ? part : part
      .replace(DISPLAY, (_, m: string) => `\n$$\n${m.trim()}\n$$\n`)
      .replace(INLINE, (_, m: string) => `$${m.trim()}$`)))
    .join('');
}
