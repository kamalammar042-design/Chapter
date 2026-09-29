// Near-duplicate filtering for flashcards (pure; unit-tested). The database
// already rejects exact repeats of a front within a deck (case and spacing
// insensitive); this also catches rewordings such as "Define osmosis" vs
// "Define osmosis." or "What is osmosis?" vs "What is osmosis".

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

function tokens(s: string): Set<string> {
  return new Set(normalise(s).split(' ').filter((w) => w.length > 1 && !['the', 'a', 'an', 'of', 'is', 'what', 'define', 'state', 'give'].includes(w)));
}

export function cardSimilarity(a: string, b: string): number {
  if (normalise(a) === normalise(b)) return 1;
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}

export const CARD_DUPLICATE_THRESHOLD = 0.85;

/** Drops cards whose front repeats an existing card or an earlier card in the list. */
export function dedupeCards<T extends { front: string; back: string }>(cards: T[], existingFronts: string[] = []): { kept: T[]; dropped: number } {
  const seen = [...existingFronts];
  const kept: T[] = [];
  for (const c of cards) {
    const front = c.front.trim();
    if (!front || !c.back.trim()) continue;
    if (seen.some((f) => cardSimilarity(f, front) >= CARD_DUPLICATE_THRESHOLD)) continue;
    seen.push(front);
    kept.push(c);
  }
  return { kept, dropped: cards.length - kept.length };
}
