// ============================================================
// Safe arithmetic evaluator (pure; unit-tested)
// ------------------------------------------------------------
// Used to check the numeric answer of a generated question against the
// working the generator supplied. It is a small recursive-descent parser:
// numbers, + − × ÷ ^, parentheses, unary minus, the constants pi and e,
// and a fixed list of functions. There is no eval, no variables and no
// property access, so a malicious expression can only fail to parse.
// ============================================================

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  // trigonometry in degrees, as used at IGCSE
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
  round: Math.round,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'id'; v: string };

function tokenize(src: string): Token[] {
  const s = src.replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/\*\*/g, '^');
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new Error('bad number');
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(s.slice(i))!;
      out.push({ t: 'id', v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`unexpected character ${c}`);
  }
  return out;
}

/** Evaluates an arithmetic expression. Returns null if it is invalid or not finite. */
export function evaluate(expression: string): number | null {
  if (typeof expression !== 'string' || expression.length === 0 || expression.length > 200) return null;
  let tokens: Token[];
  try {
    tokens = tokenize(expression);
  } catch {
    return null;
  }
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;

  function primary(): number {
    const tk = tokens[pos++];
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num') return tk.v;
    if (tk.t === 'op' && tk.v === '(') {
      const v = expr();
      if (!isOp(')')) throw new Error('missing )');
      pos++;
      return v;
    }
    if (tk.t === 'op' && (tk.v === '-' || tk.v === '+')) {
      const v = power();
      return tk.v === '-' ? -v : v;
    }
    if (tk.t === 'id') {
      if (tk.v in CONSTS) return CONSTS[tk.v];
      const f = FUNCS[tk.v];
      if (!f || !isOp('(')) throw new Error('unknown name');
      pos++;
      const v = expr();
      if (!isOp(')')) throw new Error('missing )');
      pos++;
      return f(v);
    }
    throw new Error('unexpected token');
  }
  function power(): number {
    const base = primary();
    if (isOp('^')) {
      pos++;
      return base ** power(); // right-associative
    }
    return base;
  }
  function term(): number {
    let v = power();
    while (isOp('*') || isOp('/')) {
      const op = tokens[pos++].v;
      const r = power();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  try {
    const v = expr();
    if (pos !== tokens.length) return null;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The first number written in an answer option, e.g. "2.5 A" → 2.5,
 * "$1 200" → 1200, "3.2 × 10⁻⁴" → 0.00032. Null if there is none.
 */
export function numberIn(text: string): number | null {
  const sup: Record<string, string> = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const t = text.replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => sup[c]).replace(/−/g, '-');
  const sci = /(-?\d+(?:\.\d+)?)\s*[×x*]\s*10\^?\s*(-?\d+)/.exec(t);
  if (sci) return Number(sci[1]) * 10 ** Number(sci[2]);
  const m = /-?\d{1,3}(?:[ ,]\d{3})+(?:\.\d+)?|-?\d*\.?\d+/.exec(t);
  if (!m) return null;
  const n = Number(m[0].replace(/[ ,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** True if a and b agree to within `rel` (default 1%), allowing for rounding. */
export function close(a: number, b: number, rel = 0.01): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= Math.max(1e-9, rel * Math.max(Math.abs(a), Math.abs(b)));
}
