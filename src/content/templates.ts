// ============================================================
// Procedural question families
// ------------------------------------------------------------
// Deterministic generators for calculation skills. Each family:
//   • targets one skill at a fixed difficulty (1–5)
//   • varies wording and question style, not only the numbers
//   • computes the answer from its parameters AND re-checks it by an
//     independent route (`check`), so a family with a bug cannot serve a
//     wrong answer: instantiate() discards any instance that fails
//   • builds distractors from real misconceptions, never random noise
//
// Families are registered as `questions` rows (question_type 'procedural')
// so every attempt is recorded against them with full provenance.
// ============================================================

export type Rng = () => number;

export interface TemplateInstance {
  stem: string;
  options: string[];
  correct: number;
  explanation: string;
  hint: string;
  /** misconception key for each option (null for the answer and untagged) */
  misconceptions: Array<string | null>;
}

interface Draft {
  stem: string;
  answer: number | string;
  /** distractor values, each a plausible mistake; [value, misconception key] tags the mistake */
  distractors: Array<number | string | [number | string, string]>;
  unit?: string;
  dp?: number;
  explanation: string;
  hint: string;
  /** independent recomputation of the answer; must be true */
  check: boolean;
}

export interface Template {
  key: string;
  skillId: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  cognitive: 'recall' | 'understand' | 'apply' | 'analyse';
  name: string;
  make: (rng: Rng) => Draft;
}

// ---- helpers --------------------------------------------------------------
const int = (rng: Rng, a: number, b: number) => Math.floor(rng() * (b - a + 1)) + a;
const pick = <T,>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const near = (a: number, b: number, rel = 1e-6) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * rel);

export function fmt(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return 'NaN';
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  return (Object.is(r, -0) ? 0 : r).toLocaleString('en-US', { maximumFractionDigits: dp, useGrouping: false });
}

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const BAD = /NaN|undefined|Infinity|null/;

/**
 * Turns a draft into a question, or null if it is not safe to show:
 * failed self-check, non-finite values, fewer than 3 distinct distractors,
 * or a distractor equal to the answer.
 */
export function instantiate(t: Template, rng: Rng, attempts = 12): TemplateInstance | null {
  for (let i = 0; i < attempts; i++) {
    let d: Draft;
    try {
      d = t.make(rng);
    } catch {
      continue;
    }
    if (!d.check) continue;
    if (typeof d.answer === 'number' && !Number.isFinite(d.answer)) continue;
    const unit = d.unit ? ` ${d.unit}` : '';
    const show = (v: number | string) => (typeof v === 'number' ? `${fmt(v, d.dp ?? 2)}${unit}` : v);
    const answer = show(d.answer);
    const seen = new Set([answer.toLowerCase()]);
    const distractors: Array<{ text: string; misconception: string | null }> = [];
    for (const raw of d.distractors) {
      const [x, m] = Array.isArray(raw) ? raw : [raw, null];
      if (typeof x === 'number' && (!Number.isFinite(x) || (typeof d.answer === 'number' && near(x, d.answer, 1e-3)))) continue;
      const s = show(x);
      if (BAD.test(s) || seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase());
      distractors.push({ text: s, misconception: m });
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3 || BAD.test(answer) || BAD.test(d.stem) || BAD.test(d.explanation)) continue;
    const all = shuffle(rng, [{ text: answer, misconception: null as string | null }, ...distractors]);
    return {
      stem: d.stem,
      options: all.map((o) => o.text),
      correct: all.findIndex((o) => o.text === answer),
      explanation: d.explanation,
      hint: d.hint,
      misconceptions: all.map((o) => o.misconception),
    };
  }
  return null;
}

// ---- families -------------------------------------------------------------
export const TEMPLATES: Template[] = [
  // ======== IGCSE Physics ========
  {
    key: 'phys.wave-speed', skillId: 'igcse.physics/waves/wave-properties', difficulty: 2, cognitive: 'apply', name: 'Wave equation',
    make: (rng) => {
      const f = int(rng, 2, 90);
      const lam = pick(rng, [0.5, 1.5, 2, 3, 4, 6, 8]);
      const v = f * lam;
      const ask = pick(rng, ['v', 'f', 'lambda'] as const);
      if (ask === 'v') return {
        stem: pick(rng, [
          `A wave has a frequency of ${f} Hz and a wavelength of ${fmt(lam)} m. What is its speed?`,
          `Water waves arrive at a harbour wall ${f} times per second. The distance between crests is ${fmt(lam)} m. How fast do the waves travel?`,
        ]),
        answer: v, unit: 'm/s', distractors: [f / lam, f + lam, v * 2, lam / f],
        explanation: `v = fλ = ${f} Hz × ${fmt(lam)} m = ${fmt(v)} m/s.`, hint: 'Which equation links speed, frequency and wavelength?',
        check: near(v / f, lam),
      };
      if (ask === 'f') return {
        stem: `A wave travels at ${fmt(v)} m/s with a wavelength of ${fmt(lam)} m. What is its frequency?`,
        answer: f, unit: 'Hz', distractors: [v * lam, v - lam, lam / v, f * 2],
        explanation: `f = v / λ = ${fmt(v)} ÷ ${fmt(lam)} = ${f} Hz.`, hint: 'Rearrange v = fλ to make f the subject.',
        check: near(f * lam, v),
      };
      return {
        stem: `Sound of frequency ${f} Hz travels at ${fmt(v)} m/s in a gas. What is its wavelength?`,
        answer: lam, unit: 'm', distractors: [v * f, f / v, lam * 2, v - f],
        explanation: `λ = v / f = ${fmt(v)} ÷ ${f} = ${fmt(lam)} m.`, hint: 'Rearrange v = fλ to make λ the subject.',
        check: near(lam * f, v),
      };
    },
  },
  {
    key: 'phys.period', skillId: 'igcse.physics/waves/wave-properties', difficulty: 1, cognitive: 'apply', name: 'Period and frequency',
    make: (rng) => {
      const T = pick(rng, [0.01, 0.02, 0.04, 0.05, 0.1, 0.2, 0.25, 0.5]);
      const f = 1 / T;
      return {
        stem: pick(rng, [`The period of a wave is ${T} s. What is its frequency?`, `One complete oscillation of a pendulum takes ${T} s. What is its frequency?`]),
        answer: f, unit: 'Hz', distractors: [T, f / 2, T * 100, f * 2],
        explanation: `f = 1 / T = 1 ÷ ${T} = ${fmt(f)} Hz.`, hint: 'Frequency and period are reciprocals.',
        check: near(f * T, 1),
      };
    },
  },
  {
    key: 'phys.ohm', skillId: 'igcse.physics/electricity/resistance', difficulty: 2, cognitive: 'apply', name: "Ohm's law",
    make: (rng) => {
      const R = pick(rng, [2, 4, 5, 6, 8, 10, 12, 15, 20, 24]);
      const I = pick(rng, [0.25, 0.5, 1, 1.5, 2, 3]);
      const V = I * R;
      const ask = pick(rng, ['I', 'V', 'R'] as const);
      if (ask === 'I') return {
        stem: pick(rng, [`A voltage of ${fmt(V)} V is applied across a ${R} Ω resistor. What is the current?`, `A lamp of resistance ${R} Ω is connected to a ${fmt(V)} V supply. What current flows through it?`]),
        answer: I, unit: 'A', distractors: [[V * R, 'multiplies-v-and-r'], [R / V, 'inverts-ohms-law'], V + R, I * 2],
        explanation: `I = V / R = ${fmt(V)} ÷ ${R} = ${fmt(I)} A.`, hint: 'Current = voltage ÷ resistance.',
        check: near(I * R, V),
      };
      if (ask === 'V') return {
        stem: `A current of ${fmt(I)} A flows through a ${R} Ω resistor. What is the potential difference across it?`,
        answer: V, unit: 'V', distractors: [R / I, I / R, R + I, V / 2],
        explanation: `V = IR = ${fmt(I)} × ${R} = ${fmt(V)} V.`, hint: 'V = IR.',
        check: near(V / R, I),
      };
      return {
        stem: `A component has ${fmt(V)} V across it and ${fmt(I)} A through it. What is its resistance?`,
        answer: R, unit: 'Ω', distractors: [V * I, I / V, V - I, R * 2],
        explanation: `R = V / I = ${fmt(V)} ÷ ${fmt(I)} = ${R} Ω.`, hint: 'Resistance = voltage ÷ current.',
        check: near(R * I, V),
      };
    },
  },
  {
    key: 'phys.series-parallel', skillId: 'igcse.physics/electricity/circuits', difficulty: 3, cognitive: 'apply', name: 'Combined resistance',
    make: (rng) => {
      const [a, b] = pick(rng, [[2, 2], [3, 6], [4, 4], [6, 12], [4, 12], [10, 10], [5, 20], [12, 24]] as const);
      const parallel = rng() < 0.6;
      const series = a + b;
      const par = (a * b) / (a + b);
      return parallel ? {
        stem: pick(rng, [`Resistors of ${a} Ω and ${b} Ω are connected in parallel. What is their combined resistance?`, `Two lamps with resistances ${a} Ω and ${b} Ω are wired side by side (in parallel). What is the total resistance of the pair?`]),
        answer: par, unit: 'Ω', distractors: [[series, 'parallel-adds-like-series'], Math.abs(a - b) || a / 2, [(a + b) / 2, 'parallel-is-average'], a * b],
        explanation: `1/R = 1/${a} + 1/${b}, so R = (${a} × ${b}) ÷ (${a} + ${b}) = ${fmt(par)} Ω. It is less than the smallest resistor.`,
        hint: 'In parallel the total resistance is smaller than either resistor.',
        check: near(1 / par, 1 / a + 1 / b),
      } : {
        stem: `Resistors of ${a} Ω and ${b} Ω are connected in series. What is the total resistance?`,
        answer: series, unit: 'Ω', distractors: [par, a * b, Math.abs(a - b) || a / 2, series * 2],
        explanation: `In series, resistances add: ${a} + ${b} = ${series} Ω.`, hint: 'In series, add the resistances.',
        check: series - b === a,
      };
    },
  },
  {
    key: 'phys.power', skillId: 'igcse.physics/electricity/power-energy', difficulty: 3, cognitive: 'apply', name: 'Electrical power and energy',
    make: (rng) => {
      const V = pick(rng, [6, 12, 24, 230]);
      const I = pick(rng, [0.5, 2, 4, 5]);
      const P = V * I;
      const t = pick(rng, [10, 30, 60, 120]);
      const E = P * t;
      return rng() < 0.5 ? {
        stem: `A heater draws ${fmt(I)} A from a ${V} V supply. What is its power?`,
        answer: P, unit: 'W', distractors: [V / I, V + I, P / 2, I / V],
        explanation: `P = IV = ${fmt(I)} × ${V} = ${fmt(P)} W.`, hint: 'Power = current × voltage.',
        check: near(P / V, I),
      } : {
        stem: `A ${fmt(P)} W device is switched on for ${t} s. How much energy does it transfer?`,
        answer: E, unit: 'J', distractors: [P / t, P + t, E / 60, t / P],
        explanation: `E = Pt = ${fmt(P)} × ${t} = ${fmt(E)} J.`, hint: 'Energy = power × time (in seconds).',
        check: near(E / t, P),
      };
    },
  },
  {
    key: 'phys.charge', skillId: 'igcse.physics/electricity/charge-current', difficulty: 2, cognitive: 'apply', name: 'Charge and current',
    make: (rng) => {
      const I = pick(rng, [0.2, 0.5, 1.5, 2, 3]);
      const t = pick(rng, [10, 20, 30, 60, 120]);
      const Q = I * t;
      return {
        stem: `A current of ${fmt(I)} A flows for ${t} s. How much charge passes?`,
        answer: Q, unit: 'C', distractors: [I / t, t / I, I + t, Q / 60],
        explanation: `Q = It = ${fmt(I)} × ${t} = ${fmt(Q)} C.`, hint: 'Charge = current × time.',
        check: near(Q / t, I),
      };
    },
  },
  {
    key: 'phys.fma', skillId: 'igcse.physics/motion-forces-energy/forces', difficulty: 2, cognitive: 'apply', name: "Newton's second law",
    make: (rng) => {
      const m = pick(rng, [2, 5, 10, 20, 50, 800, 1200]);
      const a = pick(rng, [0.5, 2, 3, 4, 5]);
      const F = m * a;
      return rng() < 0.5 ? {
        stem: pick(rng, [`A ${m} kg object accelerates at ${fmt(a)} m/s². What resultant force acts on it?`, `A car of mass ${m} kg speeds up at ${fmt(a)} m/s². What is the resultant force on it?`]),
        answer: F, unit: 'N', distractors: [m / a, m + a, F / 10, a / m],
        explanation: `F = ma = ${m} × ${fmt(a)} = ${fmt(F)} N.`, hint: 'Resultant force = mass × acceleration.',
        check: near(F / m, a),
      } : {
        stem: `A resultant force of ${fmt(F)} N acts on a ${m} kg mass. What is its acceleration?`,
        answer: a, unit: 'm/s²', distractors: [F * m, m / F, F - m, a * 10],
        explanation: `a = F / m = ${fmt(F)} ÷ ${m} = ${fmt(a)} m/s².`, hint: 'Rearrange F = ma.',
        check: near(a * m, F),
      };
    },
  },
  {
    key: 'phys.kinetic', skillId: 'igcse.physics/motion-forces-energy/energy-work-power', difficulty: 3, cognitive: 'apply', name: 'Kinetic energy',
    make: (rng) => {
      const m = pick(rng, [2, 4, 6, 10, 50]);
      const v = pick(rng, [2, 3, 4, 5, 10]);
      const KE = 0.5 * m * v * v;
      return {
        stem: pick(rng, [`What is the kinetic energy of a ${m} kg object moving at ${v} m/s?`, `A ${m} kg trolley rolls at ${v} m/s. How much kinetic energy does it have?`]),
        answer: KE, unit: 'J', distractors: [[m * v, 'ke-confused-with-momentum'], [0.5 * m * v, 'ke-forgets-to-square'], [m * v * v, 'ke-forgets-half'], KE * 2],
        explanation: `KE = ½mv² = 0.5 × ${m} × ${v}² = ${fmt(KE)} J. Remember to square the speed.`, hint: 'KE = ½ × mass × speed².',
        check: near((2 * KE) / (v * v), m),
      };
    },
  },
  {
    key: 'phys.work', skillId: 'igcse.physics/motion-forces-energy/energy-work-power', difficulty: 2, cognitive: 'apply', name: 'Work done',
    make: (rng) => {
      const F = pick(rng, [10, 25, 40, 50, 120]);
      const d = pick(rng, [2, 3, 5, 8, 10]);
      const W = F * d;
      return {
        stem: `A force of ${F} N pushes a box ${d} m along the floor in the direction of the force. How much work is done?`,
        answer: W, unit: 'J', distractors: [F / d, F + d, W / 2, d / F],
        explanation: `W = Fd = ${F} × ${d} = ${W} J.`, hint: 'Work done = force × distance moved in the direction of the force.',
        check: W / d === F,
      };
    },
  },
  {
    key: 'phys.momentum', skillId: 'igcse.physics/motion-forces-energy/momentum', difficulty: 3, cognitive: 'apply', name: 'Momentum',
    make: (rng) => {
      const m = pick(rng, [2, 5, 10, 60, 1000]);
      const v = pick(rng, [3, 4, 5, 10, 15]);
      const p = m * v;
      return {
        stem: `What is the momentum of a ${m} kg object moving at ${v} m/s?`,
        answer: p, unit: 'kg m/s', distractors: [m + v, 0.5 * m * v * v, p * 2, m / v],
        explanation: `p = mv = ${m} × ${v} = ${p} kg m/s.`, hint: 'Momentum = mass × velocity.',
        check: p / m === v,
      };
    },
  },
  {
    key: 'phys.density', skillId: 'igcse.physics/motion-forces-energy/pressure-density', difficulty: 2, cognitive: 'apply', name: 'Density',
    make: (rng) => {
      const V = pick(rng, [20, 40, 50, 100, 250]);
      const rho = pick(rng, [0.8, 1, 2.7, 7.9, 11.3]);
      const m = rho * V;
      return {
        stem: pick(rng, [`A block has a mass of ${fmt(m, 1)} g and a volume of ${V} cm³. What is its density?`, `A ${V} cm³ sample of metal has a mass of ${fmt(m, 1)} g. Calculate its density.`]),
        answer: rho, unit: 'g/cm³', dp: 2, distractors: [V / m, m * V, m - V, rho * 10],
        explanation: `Density = mass ÷ volume = ${fmt(m, 1)} ÷ ${V} = ${fmt(rho)} g/cm³.`, hint: 'ρ = m / V.',
        check: near(rho * V, m),
      };
    },
  },
  {
    key: 'phys.pressure', skillId: 'igcse.physics/motion-forces-energy/pressure-density', difficulty: 3, cognitive: 'apply', name: 'Pressure',
    make: (rng) => {
      const F = pick(rng, [100, 250, 500, 600, 800]);
      const A = pick(rng, [0.02, 0.05, 0.1, 0.25, 0.5]);
      const P = F / A;
      return {
        stem: `A force of ${F} N acts on an area of ${A} m². What pressure does it exert?`,
        answer: P, unit: 'Pa', distractors: [F * A, A / F, F - A, P / 10],
        explanation: `p = F / A = ${F} ÷ ${A} = ${fmt(P)} Pa.`, hint: 'Pressure = force ÷ area.',
        check: near(P * A, F),
      };
    },
  },
  {
    key: 'phys.shc', skillId: 'igcse.physics/thermal/thermal-energy', difficulty: 4, cognitive: 'apply', name: 'Specific heat capacity',
    make: (rng) => {
      const m = pick(rng, [0.5, 1, 2, 3]);
      const c = pick(rng, [390, 900, 4200]);
      const dT = pick(rng, [5, 10, 20, 25]);
      const E = m * c * dT;
      return {
        stem: `How much energy is needed to raise the temperature of ${m} kg of a material with specific heat capacity ${c} J/(kg °C) by ${dT} °C?`,
        answer: E, unit: 'J', distractors: [m * c, c * dT, E / 1000, m * dT],
        explanation: `E = mcΔT = ${m} × ${c} × ${dT} = ${fmt(E)} J.`, hint: 'E = mass × specific heat capacity × temperature change.',
        check: near(E / (m * dT), c),
      };
    },
  },
  {
    key: 'phys.kelvin', skillId: 'igcse.physics/thermal/gas-behaviour', difficulty: 1, cognitive: 'apply', name: 'Celsius and kelvin',
    make: (rng) => {
      const c = int(rng, -200, 120);
      const k = c + 273;
      return rng() < 0.5 ? {
        stem: `Convert ${c} °C to kelvin.`, answer: k, unit: 'K', distractors: [c - 273, Math.abs(c), k + 100, 273 - c],
        explanation: `K = °C + 273 = ${c} + 273 = ${k} K.`, hint: 'Add 273 to a Celsius temperature.', check: k - 273 === c,
      } : {
        stem: `A gas is at ${k} K. What is this temperature in °C?`, answer: c, unit: '°C', distractors: [k + 273, -c || c + 10, 273 - k, c + 100],
        explanation: `°C = K − 273 = ${k} − 273 = ${c} °C.`, hint: 'Subtract 273 from a kelvin temperature.', check: c + 273 === k,
      };
    },
  },
  {
    key: 'phys.half-life', skillId: 'igcse.physics/nuclear-space/radioactivity', difficulty: 3, cognitive: 'apply', name: 'Half-life',
    make: (rng) => {
      const start = pick(rng, [800, 1600, 3200, 6400]);
      const h = pick(rng, [2, 5, 8, 10]);
      const n = pick(rng, [2, 3, 4]);
      const left = start / 2 ** n;
      return {
        stem: pick(rng, [`A sample has an activity of ${start} Bq. Its half-life is ${h} hours. What is its activity after ${h * n} hours?`, `A radioactive isotope with a half-life of ${h} days starts with ${start} undecayed nuclei. How many remain after ${h * n} days?`]),
        answer: left, distractors: [[start / n, 'half-life-divides-by-count'], start / (2 * n), start - (start / 2) * n > 0 ? start - (start / 2) * n : start / 3, left * 2],
        explanation: `${h * n} ÷ ${h} = ${n} half-lives. ${start} ÷ 2^${n} = ${fmt(left)}.`, hint: 'Count how many half-lives have passed, then halve that many times.',
        check: near(left * 2 ** n, start),
      };
    },
  },
  {
    key: 'phys.transformer', skillId: 'igcse.physics/magnetism/transformers', difficulty: 4, cognitive: 'apply', name: 'Transformer equation',
    make: (rng) => {
      const Np = pick(rng, [100, 200, 400, 500, 1000]);
      const ratio = pick(rng, [2, 4, 5, 10]);
      const up = rng() < 0.5;
      const Ns = up ? Np * ratio : Np / ratio;
      const Vp = pick(rng, [12, 24, 230]);
      const Vs = (Vp * Ns) / Np;
      return {
        stem: `A transformer has ${Np} turns on the primary coil and ${fmt(Ns, 0)} turns on the secondary. The input voltage is ${Vp} V. What is the output voltage?`,
        answer: Vs, unit: 'V', distractors: [(Vp * Np) / Ns, Vp, Vp * ratio * (up ? 0.5 : 2), Vp + Ns - Np > 0 ? Vp + Ns - Np : Vp / 3],
        explanation: `Vs / Vp = Ns / Np, so Vs = ${Vp} × ${fmt(Ns, 0)} ÷ ${Np} = ${fmt(Vs)} V. This is a step-${up ? 'up' : 'down'} transformer.`,
        hint: 'The voltage ratio equals the turns ratio.',
        check: near(Vs / Vp, Ns / Np),
      };
    },
  },
  {
    key: 'phys.speed', skillId: 'igcse.physics/motion-forces-energy/motion', difficulty: 1, cognitive: 'apply', name: 'Speed',
    make: (rng) => {
      const v = pick(rng, [2, 4, 5, 8, 12, 15, 20]);
      const t = pick(rng, [5, 10, 20, 30, 60]);
      const d = v * t;
      return pick(rng, [
        { stem: `A cyclist travels ${d} m in ${t} s. What is her average speed?`, answer: v, unit: 'm/s', distractors: [d * t, t / d, d - t, v * 2], explanation: `speed = distance ÷ time = ${d} ÷ ${t} = ${v} m/s.`, hint: 'Speed = distance ÷ time.', check: v * t === d },
        { stem: `A runner keeps a steady ${v} m/s for ${t} s. How far does he go?`, answer: d, unit: 'm', distractors: [v / t, t / v, v + t, d / 2], explanation: `distance = speed × time = ${v} × ${t} = ${d} m.`, hint: 'Distance = speed × time.', check: d / t === v },
      ]);
    },
  },
  {
    key: 'phys.acceleration', skillId: 'igcse.physics/motion-forces-energy/motion', difficulty: 3, cognitive: 'apply', name: 'Acceleration',
    make: (rng) => {
      const u = pick(rng, [0, 2, 4, 5, 10]);
      const a = pick(rng, [0.5, 1, 2, 3]);
      const t = pick(rng, [4, 5, 6, 8, 10]);
      const v = u + a * t;
      return {
        stem: `A car speeds up from ${u} m/s to ${fmt(v)} m/s in ${t} s. What is its acceleration?`,
        answer: a, unit: 'm/s²', distractors: [v / t, (v + u) / t, v - u, t / (v - u)],
        explanation: `a = (v − u) / t = (${fmt(v)} − ${u}) ÷ ${t} = ${fmt(a)} m/s².`, hint: 'Acceleration = change in velocity ÷ time.',
        check: near(u + a * t, v),
      };
    },
  },

  // ======== IGCSE Chemistry ========
  {
    key: 'chem.moles', skillId: 'igcse.chemistry/physical/moles', difficulty: 3, cognitive: 'apply', name: 'Moles from mass',
    make: (rng) => {
      const [name, Mr] = pick(rng, [['water (H₂O)', 18], ['carbon dioxide (CO₂)', 44], ['sodium chloride (NaCl)', 58.5], ['calcium carbonate (CaCO₃)', 100], ['magnesium oxide (MgO)', 40], ['sodium hydroxide (NaOH)', 40]] as const);
      const n = pick(rng, [0.1, 0.25, 0.5, 2, 3]);
      const m = n * Mr;
      return rng() < 0.6 ? {
        stem: `How many moles are in ${fmt(m, 2)} g of ${name}? (Mr = ${Mr})`,
        answer: n, unit: 'mol', distractors: [[m * Mr, 'moles-multiplies-by-mr'], [Mr / m, 'moles-inverted'], m / 100, n * 2],
        explanation: `n = m / Mr = ${fmt(m, 2)} ÷ ${Mr} = ${fmt(n)} mol.`, hint: 'Moles = mass ÷ relative formula mass.',
        check: near(n * Mr, m),
      } : {
        stem: `What is the mass of ${fmt(n)} mol of ${name}? (Mr = ${Mr})`,
        answer: m, unit: 'g', distractors: [Mr / n, n / Mr, Mr + n, m * 2],
        explanation: `m = n × Mr = ${fmt(n)} × ${Mr} = ${fmt(m)} g.`, hint: 'Mass = moles × Mr.',
        check: near(m / Mr, n),
      };
    },
  },
  {
    key: 'chem.gas-volume', skillId: 'igcse.chemistry/physical/moles', difficulty: 3, cognitive: 'apply', name: 'Molar gas volume',
    make: (rng) => {
      const n = pick(rng, [0.1, 0.25, 0.5, 1.5, 2]);
      const V = n * 24;
      return {
        stem: `What volume does ${fmt(n)} mol of a gas occupy at room temperature and pressure? (1 mol of gas = 24 dm³)`,
        answer: V, unit: 'dm³', distractors: [24 / n, n / 24, V * 1000, n + 24],
        explanation: `V = n × 24 = ${fmt(n)} × 24 = ${fmt(V)} dm³.`, hint: 'Each mole of any gas occupies 24 dm³ at r.t.p.',
        check: near(V / 24, n),
      };
    },
  },
  {
    key: 'chem.reacting-mass', skillId: 'igcse.chemistry/physical/reacting-masses', difficulty: 4, cognitive: 'apply', name: 'Reacting masses',
    make: (rng) => {
      const mMg = pick(rng, [1.2, 2.4, 4.8, 7.2]);
      const nMg = mMg / 24;
      const mMgO = nMg * 40;
      return {
        stem: `Magnesium burns in oxygen: 2Mg + O₂ → 2MgO. What mass of magnesium oxide forms from ${mMg} g of magnesium? (Ar: Mg = 24, O = 16)`,
        answer: mMgO, unit: 'g', distractors: [mMg, nMg * 40 / 2, mMg + 16, nMg * 56],
        explanation: `n(Mg) = ${mMg} ÷ 24 = ${fmt(nMg, 3)} mol. The ratio Mg : MgO is 2 : 2, so n(MgO) = ${fmt(nMg, 3)} mol. Mass = ${fmt(nMg, 3)} × 40 = ${fmt(mMgO)} g.`,
        hint: 'Find moles of magnesium, use the equation ratio, then convert back to mass.',
        check: near(mMgO / 40, mMg / 24),
      };
    },
  },
  {
    key: 'chem.percent-yield', skillId: 'igcse.chemistry/physical/reacting-masses', difficulty: 3, cognitive: 'apply', name: 'Percentage yield',
    make: (rng) => {
      const theo = pick(rng, [4, 5, 8, 10, 12.5, 20]);
      const pct = pick(rng, [40, 60, 75, 80, 90]);
      const actual = (theo * pct) / 100;
      return {
        stem: `A reaction should produce ${theo} g of product, but only ${fmt(actual)} g is collected. What is the percentage yield?`,
        answer: pct, unit: '%', distractors: [(theo / actual) * 100, 100 - pct, actual * 10, theo - actual],
        explanation: `% yield = actual ÷ theoretical × 100 = ${fmt(actual)} ÷ ${theo} × 100 = ${pct}%.`, hint: 'Percentage yield = actual yield ÷ theoretical yield × 100.',
        check: near((pct * theo) / 100, actual),
      };
    },
  },
  {
    key: 'chem.rf', skillId: 'igcse.chemistry/analysis/chromatography', difficulty: 2, cognitive: 'apply', name: 'Rf values',
    make: (rng) => {
      const front = pick(rng, [8, 10, 12, 16]);
      const rf = pick(rng, [0.25, 0.4, 0.5, 0.6, 0.75]);
      const spot = rf * front;
      return {
        stem: `On a chromatogram the solvent front moved ${front} cm and a spot moved ${fmt(spot, 1)} cm from the baseline. What is the Rf value?`,
        answer: rf, dp: 2, distractors: [front / spot, front - spot, spot, rf * 10],
        explanation: `Rf = distance moved by spot ÷ distance moved by solvent = ${fmt(spot, 1)} ÷ ${front} = ${fmt(rf)}. Rf is always between 0 and 1.`,
        hint: 'Rf = spot distance ÷ solvent-front distance.',
        check: near(rf * front, spot),
      };
    },
  },

  // ======== IGCSE Mathematics ========
  {
    key: 'math.percent-change', skillId: 'igcse.mathematics/number/percentages', difficulty: 2, cognitive: 'apply', name: 'Percentage change',
    make: (rng) => {
      const price = int(rng, 4, 60) * 5;
      const p = pick(rng, [5, 10, 15, 20, 25, 30, 40]);
      const up = rng() < 0.5;
      const mult = up ? 1 + p / 100 : 1 - p / 100;
      const ans = price * mult;
      return {
        stem: pick(rng, [`A price of $${price} is ${up ? 'increased' : 'decreased'} by ${p}%. What is the new price?`, `A shop ${up ? 'raises' : 'cuts'} the $${price} price of a jacket by ${p}%. What does it cost now?`]),
        answer: `$${fmt(ans)}`, distractors: [`$${fmt(price * (up ? 1 - p / 100 : 1 + p / 100))}`, [`$${fmt((price * p) / 100)}`, 'percent-change-gives-only-the-change'], [`$${fmt(price + (up ? p : -p))}`, 'percent-treated-as-absolute'], `$${fmt(ans + 5)}`],
        explanation: `Multiply by ${fmt(mult)}: $${price} × ${fmt(mult)} = $${fmt(ans)}.`, hint: `A ${p}% ${up ? 'increase' : 'decrease'} means multiplying by ${fmt(mult)}.`,
        check: near(ans / mult, price),
      };
    },
  },
  {
    key: 'math.reverse-percent', skillId: 'igcse.mathematics/number/percentages', difficulty: 4, cognitive: 'analyse', name: 'Reverse percentage',
    make: (rng) => {
      const orig = int(rng, 8, 60) * 5;
      const p = pick(rng, [10, 20, 25, 40]);
      const sale = orig * (1 - p / 100);
      return {
        stem: `After a ${p}% reduction, a pair of shoes costs $${fmt(sale)}. What was the original price?`,
        answer: `$${fmt(orig)}`, distractors: [[`$${fmt(sale * (1 + p / 100))}`, 'reverse-percent-adds-back'], `$${fmt(sale + p)}`, `$${fmt(sale / (p / 100))}`, `$${fmt(sale * (1 - p / 100))}`],
        explanation: `$${fmt(sale)} is ${100 - p}% of the original, so original = ${fmt(sale)} ÷ ${fmt(1 - p / 100)} = $${fmt(orig)}. Adding ${p}% back on is a common mistake.`,
        hint: 'The sale price is what percentage of the original?',
        check: near(orig * (1 - p / 100), sale),
      };
    },
  },
  {
    key: 'math.compound-interest', skillId: 'igcse.mathematics/number/percentages', difficulty: 4, cognitive: 'apply', name: 'Compound interest',
    make: (rng) => {
      const P = pick(rng, [500, 1000, 2000, 5000]);
      const r = pick(rng, [2, 3, 4, 5]);
      const n = pick(rng, [2, 3]);
      const A = P * (1 + r / 100) ** n;
      return {
        stem: `$${P} is invested at ${r}% compound interest per year. What is it worth after ${n} years?`,
        answer: `$${fmt(A)}`, distractors: [[`$${fmt(P * (1 + (r * n) / 100))}`, 'compound-as-simple'], `$${fmt(P * (r / 100) ** n)}`, `$${fmt(P + r * n)}`, `$${fmt(P * (1 + r / 100) ** (n + 1))}`],
        explanation: `A = ${P} × ${fmt(1 + r / 100)}^${n} = $${fmt(A)}. Simple interest would give $${fmt(P * (1 + (r * n) / 100))}.`,
        hint: 'Multiply by the growth factor once for each year.',
        check: near(A / (1 + r / 100) ** n, P),
      };
    },
  },
  {
    key: 'math.ratio-share', skillId: 'igcse.mathematics/number/ratio-proportion', difficulty: 2, cognitive: 'apply', name: 'Sharing in a ratio',
    make: (rng) => {
      const a = int(rng, 1, 5);
      let b = int(rng, 2, 7);
      if (b === a) b += 1;
      const unit = int(rng, 2, 12);
      const total = (a + b) * unit;
      return {
        stem: pick(rng, [`Share ${total} in the ratio ${a} : ${b}.`, `Two friends split $${total} in the ratio ${a} : ${b}. How much does each get?`]),
        answer: `${a * unit} and ${b * unit}`,
        distractors: [`${b * unit} and ${a * unit}`, `${Math.round(total / 2)} and ${total - Math.round(total / 2)}`, `${a * (unit + 1)} and ${total - a * (unit + 1)}`, `${a} and ${b}`],
        explanation: `${a} + ${b} = ${a + b} parts; one part = ${total} ÷ ${a + b} = ${unit}. So ${a} × ${unit} = ${a * unit} and ${b} × ${unit} = ${b * unit}.`,
        hint: 'Add the ratio parts first to find the value of one part.',
        check: (a + b) * unit === total,
      };
    },
  },
  {
    key: 'math.linear-equation', skillId: 'igcse.mathematics/algebra/linear-equations', difficulty: 2, cognitive: 'apply', name: 'Linear equations',
    make: (rng) => {
      const a = int(rng, 2, 9);
      const x = int(rng, -6, 12);
      const b = int(rng, 1, 20);
      const c = a * x + b;
      return {
        stem: pick(rng, [`Solve ${a}x + ${b} = ${c}.`, `I think of a number, multiply it by ${a} and add ${b}. The answer is ${c}. What was my number?`]),
        answer: x, distractors: [(c + b) / a, c - b, (c - b) * a, x + 1],
        explanation: `${a}x = ${c} − ${b} = ${c - b}, so x = ${c - b} ÷ ${a} = ${x}.`, hint: 'Undo the addition first, then the multiplication.',
        check: a * x + b === c,
      };
    },
  },
  {
    key: 'math.quadratic-roots', skillId: 'igcse.mathematics/algebra/quadratics', difficulty: 4, cognitive: 'apply', name: 'Solving quadratics by factorising',
    make: (rng) => {
      const r1 = int(rng, 1, 9);
      let r2 = int(rng, -8, 8);
      if (r2 === r1 || r2 === 0) r2 = -r1 - 1;
      const b = -(r1 + r2);
      const c = r1 * r2;
      const bs = b === 0 ? '' : b < 0 ? ` − ${Math.abs(b)}x` : ` + ${b}x`;
      const cs = c < 0 ? ` − ${Math.abs(c)}` : ` + ${c}`;
      return {
        stem: `Solve x²${bs}${cs} = 0.`,
        answer: `x = ${Math.min(r1, r2)} or x = ${Math.max(r1, r2)}`,
        distractors: [`x = ${Math.min(-r1, -r2)} or x = ${Math.max(-r1, -r2)}`, `x = ${r1} or x = ${-r2 === r1 ? r2 + 2 : -r2}`, `x = ${b} or x = ${c}`],
        explanation: `x²${bs}${cs} = (x − ${r1})(x ${r2 < 0 ? '+' : '−'} ${Math.abs(r2)}) = 0, so x = ${r1} or x = ${r2}.`,
        hint: 'Find two numbers that multiply to the constant and add to the x-coefficient.',
        check: r1 * r1 + b * r1 + c === 0 && r2 * r2 + b * r2 + c === 0,
      };
    },
  },
  {
    key: 'math.nth-term', skillId: 'igcse.mathematics/algebra/sequences', difficulty: 3, cognitive: 'analyse', name: 'nth term',
    make: (rng) => {
      const d = int(rng, 2, 9);
      const c = int(rng, -5, 10);
      const terms = [1, 2, 3, 4].map((n) => d * n + c);
      const cs = c === 0 ? '' : c < 0 ? ` − ${-c}` : ` + ${c}`;
      return {
        stem: `Find the nth term of the sequence ${terms.join(', ')}, …`,
        answer: `${d}n${cs}`, distractors: [`n + ${d}`, `${d}n`, `${terms[0]}n + ${d}`, `${d}n${c - d < 0 ? ` − ${d - c}` : ` + ${c - d}`}`],
        explanation: `The terms go up by ${d}, so the rule starts ${d}n. When n = 1, ${d}n = ${d}, and the first term is ${terms[0]}, so add ${c}: ${d}n${cs}.`,
        hint: 'The common difference gives the coefficient of n.',
        check: terms.every((t, i) => t === d * (i + 1) + c),
      };
    },
  },
  {
    key: 'math.simultaneous', skillId: 'igcse.mathematics/algebra/simultaneous', difficulty: 4, cognitive: 'apply', name: 'Simultaneous equations',
    make: (rng) => {
      const x = int(rng, -4, 8);
      const y = int(rng, -4, 8);
      const a = int(rng, 1, 4);
      const b = int(rng, 1, 4);
      return {
        stem: `Solve the simultaneous equations ${a}x + y = ${a * x + y} and x − ${b}y = ${x - b * y}.`,
        answer: `x = ${x}, y = ${y}`, distractors: [`x = ${y}, y = ${x}`, `x = ${x + 1}, y = ${y - 1}`, `x = ${-x}, y = ${-y}`, `x = ${x}, y = ${y + 2}`],
        explanation: `Substituting x = ${x}, y = ${y}: ${a}(${x}) + ${y} = ${a * x + y} ✓ and ${x} − ${b}(${y}) = ${x - b * y} ✓.`,
        hint: 'Make one variable the subject of one equation and substitute into the other.',
        // solve independently with Cramer's rule
        check: (() => {
          const c1 = a * x + y, c2 = x - b * y, det = a * -b - 1;
          return near((c1 * -b - c2) / det, x) && near((a * c2 - c1) / det, y);
        })(),
      };
    },
  },
  {
    key: 'math.pythagoras', skillId: 'igcse.mathematics/geometry/pythagoras-trig', difficulty: 3, cognitive: 'apply', name: "Pythagoras' theorem",
    make: (rng) => {
      const [a, b, c] = pick(rng, [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [7, 24, 25], [9, 12, 15]] as const);
      const findHyp = rng() < 0.6;
      return findHyp ? {
        stem: pick(rng, [`A right-angled triangle has shorter sides ${a} cm and ${b} cm. How long is the hypotenuse?`, `A ladder reaches ${b} m up a wall with its foot ${a} m from the wall. How long is the ladder?`]),
        answer: c, distractors: [a + b, Math.sqrt(b * b - a * a), c + 1, (a * b) / 2],
        explanation: `c² = ${a}² + ${b}² = ${a * a + b * b}, so c = ${c}.`, hint: 'Square the two shorter sides and add.', check: a * a + b * b === c * c,
      } : {
        stem: `A right-angled triangle has hypotenuse ${c} cm and one side ${a} cm. How long is the other side?`,
        answer: b, distractors: [Math.sqrt(a * a + c * c), c - a, b + 1, (c + a) / 2],
        explanation: `b² = ${c}² − ${a}² = ${c * c - a * a}, so b = ${b}.`, hint: 'For a shorter side, subtract the squares.', check: a * a + b * b === c * c,
      };
    },
  },
  {
    key: 'math.circle-area', skillId: 'igcse.mathematics/geometry/mensuration', difficulty: 2, cognitive: 'apply', name: 'Circle area and circumference',
    make: (rng) => {
      const r = int(rng, 2, 12);
      return rng() < 0.5 ? {
        stem: `What is the area of a circle of radius ${r} cm? Give your answer in terms of π.`,
        answer: `${r * r}π cm²`, distractors: [`${2 * r}π cm²`, `${r}π cm²`, `${4 * r * r}π cm²`, `${r * r} cm²`],
        explanation: `A = πr² = π × ${r}² = ${r * r}π cm².`, hint: 'Area of a circle = πr².', check: true,
      } : {
        stem: `What is the circumference of a circle of radius ${r} cm? Give your answer in terms of π.`,
        answer: `${2 * r}π cm`, distractors: [`${r * r}π cm`, `${r}π cm`, `${4 * r}π cm`, `${2 * r} cm`],
        explanation: `C = 2πr = 2 × π × ${r} = ${2 * r}π cm.`, hint: 'Circumference = 2πr (or πd).', check: true,
      };
    },
  },
  {
    key: 'math.mean', skillId: 'igcse.mathematics/statistics/averages', difficulty: 1, cognitive: 'apply', name: 'Mean',
    make: (rng) => {
      const xs = Array.from({ length: 5 }, () => int(rng, 1, 20));
      const sum = xs.reduce((a, b) => a + b, 0);
      const mean = sum / 5;
      const sorted = [...xs].sort((a, b) => a - b);
      return {
        stem: `Find the mean of ${xs.join(', ')}.`,
        answer: mean, distractors: [sum, sorted[2] === mean ? mean + 1 : sorted[2], Math.max(...xs) - Math.min(...xs) || mean + 2, mean + 0.5],
        explanation: `Mean = (${xs.join(' + ')}) ÷ 5 = ${sum} ÷ 5 = ${fmt(mean)}.`, hint: 'Add them up and divide by how many there are.',
        check: near(mean * 5, sum),
      };
    },
  },
  {
    key: 'math.independent-prob', skillId: 'igcse.mathematics/statistics/combined-events', difficulty: 3, cognitive: 'apply', name: 'Independent events',
    make: (rng) => {
      const pa = pick(rng, [0.2, 0.3, 0.4, 0.5, 0.6]);
      const pb = pick(rng, [0.1, 0.25, 0.5, 0.7]);
      const both = pa * pb;
      return {
        stem: `P(A) = ${pa} and P(B) = ${pb}. A and B are independent. What is P(A and B)?`,
        answer: both, dp: 3, distractors: [pa + pb, Math.abs(pa - pb) || 0.05, pa + pb - both, both * 2],
        explanation: `For independent events P(A and B) = P(A) × P(B) = ${pa} × ${pb} = ${fmt(both, 3)}.`, hint: 'For independent events, multiply.',
        check: near(both / pb, pa),
      };
    },
  },
  {
    key: 'math.standard-form', skillId: 'igcse.mathematics/number/standard-form-indices', difficulty: 2, cognitive: 'apply', name: 'Standard form',
    make: (rng) => {
      const mant = int(rng, 11, 99) / 10;
      const e = pick(rng, [-5, -4, -3, 3, 4, 5, 6]);
      const value = mant * 10 ** e;
      const plain = e < 0 ? value.toFixed(-e + 1) : String(Math.round(value));
      const sup = (n: number) => String(n).split('').map((ch) => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' } as Record<string, string>)[ch] ?? ch).join('');
      const sf = (k: number) => `${fmt(mant, 1)} × 10${sup(k)}`;
      return {
        stem: `Write ${plain.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} in standard form.`,
        answer: sf(e), distractors: [sf(-e), sf(e + 1), sf(e - 1), `${Math.round(mant * 10)} × 10${sup(e - 1)}`],
        explanation: `Place the decimal point after the first non-zero digit (${fmt(mant, 1)}); it moved ${Math.abs(e)} places, so the power is ${e}.`,
        hint: 'Standard form is a × 10ⁿ with 1 ≤ a < 10.',
        check: near(Number(plain), value, 1e-9),
      };
    },
  },

  // ======== IGCSE Computer Science ========
  {
    key: 'cs.binary-denary', skillId: 'igcse.computer-science/data-representation/number-systems', difficulty: 2, cognitive: 'apply', name: 'Binary and denary',
    make: (rng) => {
      const n = int(rng, 5, 250);
      const bin = n.toString(2).padStart(8, '0');
      const spaced = `${bin.slice(0, 4)} ${bin.slice(4)}`;
      const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === '0' ? '1' : '0') + s.slice(i + 1);
      return rng() < 0.5 ? {
        stem: `Convert the binary number ${spaced} to denary.`,
        answer: n, distractors: [parseInt(flip(bin, 7), 2), parseInt(bin.split('').reverse().join(''), 2), parseInt(flip(bin, 3), 2), n + 16],
        explanation: `Add the place values of each 1: ${bin.split('').map((b, i) => (b === '1' ? 2 ** (7 - i) : 0)).filter(Boolean).join(' + ')} = ${n}.`,
        hint: 'Place values from the right are 1, 2, 4, 8, 16, 32, 64, 128.',
        check: parseInt(bin, 2) === n,
      } : {
        stem: `Convert the denary number ${n} to 8-bit binary.`,
        answer: spaced, distractors: [flip(bin, 7), flip(bin, 2), bin.split('').reverse().join('')].map((s) => `${s.slice(0, 4)} ${s.slice(4)}`),
        explanation: `${n} = ${bin.split('').map((b, i) => (b === '1' ? 2 ** (7 - i) : 0)).filter(Boolean).join(' + ')}, which is ${spaced}.`,
        hint: 'Subtract the largest place value that fits, then continue down.',
        check: parseInt(bin, 2) === n,
      };
    },
  },
  {
    key: 'cs.hex', skillId: 'igcse.computer-science/data-representation/number-systems', difficulty: 3, cognitive: 'apply', name: 'Hexadecimal',
    make: (rng) => {
      const n = int(rng, 17, 254);
      const hex = n.toString(16).toUpperCase().padStart(2, '0');
      return {
        stem: `What is the denary value of the hexadecimal number ${hex}?`,
        answer: n, distractors: [parseInt(hex.split('').reverse().join(''), 16), parseInt(hex[0], 16) + parseInt(hex[1], 16), parseInt(hex[0], 16) * 10 + parseInt(hex[1], 16), n + 16],
        explanation: `${hex[0]} × 16 + ${hex[1]} = ${parseInt(hex[0], 16)} × 16 + ${parseInt(hex[1], 16)} = ${n}.`,
        hint: 'The left hex digit is worth 16 times its value.',
        check: parseInt(hex, 16) === n,
      };
    },
  },
  {
    key: 'cs.image-size', skillId: 'igcse.computer-science/data-representation/file-size', difficulty: 4, cognitive: 'apply', name: 'Image file size',
    make: (rng) => {
      const w = pick(rng, [100, 200, 400, 640, 800]);
      const h = pick(rng, [100, 200, 300, 480, 600]);
      const depth = pick(rng, [1, 8, 16, 24]);
      const bytes = (w * h * depth) / 8;
      return {
        stem: `An image is ${w} × ${h} pixels with a colour depth of ${depth} bit${depth > 1 ? 's' : ''}. What is its file size in bytes (before compression)?`,
        answer: bytes, unit: 'bytes', dp: 0, distractors: [w * h * depth, w * h, bytes / 1024, bytes * 2],
        explanation: `${w} × ${h} × ${depth} = ${w * h * depth} bits; ÷ 8 = ${bytes} bytes.`, hint: 'Pixels × bits per pixel gives bits; divide by 8 for bytes.',
        check: near(bytes * 8, w * h * depth),
      };
    },
  },

  // ======== IGCSE Economics & Business ========
  {
    key: 'econ.ped', skillId: 'igcse.economics/micro/elasticity', difficulty: 3, cognitive: 'apply', name: 'Price elasticity of demand',
    make: (rng) => {
      const dp = pick(rng, [5, 10, 20, 25]);
      const ped = pick(rng, [0.4, 0.5, 1.5, 2, 2.5]);
      const dq = dp * ped;
      return {
        stem: `The price of a good rises by ${dp}% and quantity demanded falls by ${fmt(dq)}%. What is the price elasticity of demand?`,
        answer: -ped, distractors: [[-dp / dq, 'ped-inverted'], dq - dp, ped, -(dp + dq) / 10],
        explanation: `PED = %Δ quantity ÷ %Δ price = −${fmt(dq)} ÷ ${dp} = ${fmt(-ped)}. Demand is ${ped > 1 ? 'elastic' : 'inelastic'}.`,
        hint: 'PED = percentage change in quantity demanded ÷ percentage change in price.',
        check: near(-ped * dp, -dq),
      };
    },
  },
  {
    key: 'bus.break-even', skillId: 'igcse.business/operations/break-even', difficulty: 4, cognitive: 'apply', name: 'Break-even output',
    make: (rng) => {
      const fixed = pick(rng, [2000, 5000, 12000, 20000, 30000]);
      const price = pick(rng, [10, 15, 20, 25, 40]);
      const vc = price - pick(rng, [2, 4, 5, 8, 10]);
      const contrib = price - vc;
      const be = fixed / contrib;
      return {
        stem: `A business has fixed costs of $${fixed}. It sells each unit for $${price} and each unit costs $${vc} to make. What is the break-even output?`,
        answer: be, unit: 'units', dp: 0, distractors: [[fixed / price, 'break-even-ignores-variable-costs'], fixed / vc, fixed / (price + vc), be * 2],
        explanation: `Contribution per unit = $${price} − $${vc} = $${contrib}. Break-even = $${fixed} ÷ $${contrib} = ${fmt(be, 0)} units.`,
        hint: 'Divide fixed costs by the contribution per unit.',
        check: Number.isInteger(be) && be * contrib === fixed,
      };
    },
  },
  {
    key: 'bus.gross-margin', skillId: 'igcse.business/finance/profit-margins', difficulty: 3, cognitive: 'apply', name: 'Gross profit margin',
    make: (rng) => {
      const revenue = pick(rng, [20000, 40000, 50000, 80000, 100000]);
      const margin = pick(rng, [20, 25, 30, 40, 45]);
      const cos = revenue * (1 - margin / 100);
      return {
        stem: `A business has revenue of $${revenue} and cost of sales of $${cos}. What is its gross profit margin?`,
        answer: margin, unit: '%', distractors: [100 - margin, (cos / revenue) * 100 + 5, ((revenue - cos) / cos) * 100, margin / 2],
        explanation: `Gross profit = $${revenue} − $${cos} = $${revenue - cos}. Margin = ${revenue - cos} ÷ ${revenue} × 100 = ${margin}%.`,
        hint: 'Gross profit margin = gross profit ÷ revenue × 100.',
        check: near(((revenue - cos) / revenue) * 100, margin),
      };
    },
  },

  // ======== SAT Math ========
  {
    key: 'sat.linear-model', skillId: 'sat.math/algebra/linear-functions', difficulty: 2, cognitive: 'understand', name: 'Linear models in context',
    make: (rng) => {
      const fee = pick(rng, [20, 25, 35, 40, 50]);
      const rate = pick(rng, [8, 12, 15, 18, 25]);
      const [unit, noun] = pick(rng, [['month', 'membership'], ['hour', 'rental'], ['day', 'hire']] as const);
      return {
        stem: `The cost C, in dollars, of a ${noun} is C = ${rate}t + ${fee}, where t is the number of ${unit}s. What does ${rate} represent?`,
        answer: `The cost per ${unit}`, distractors: [`The one-time starting fee`, `The total cost after one ${unit}`, `The number of ${unit}s`],
        explanation: `${rate} multiplies t, so it is the amount added for each ${unit}: the rate. ${fee} is the fixed starting cost.`,
        hint: 'Which number changes the total each time t goes up by 1?',
        check: true,
      };
    },
  },
  {
    key: 'sat.percent-successive', skillId: 'sat.math/problem-solving/ratios-rates', difficulty: 3, cognitive: 'analyse', name: 'Successive percentage changes',
    make: (rng) => {
      const p = pick(rng, [10, 20, 25, 30, 50]);
      const net = (1 + p / 100) * (1 - p / 100);
      const change = Math.round((1 - net) * 10000) / 100;
      return {
        stem: `A price is increased by ${p}% and then the new price is decreased by ${p}%. Compared with the original, the final price is:`,
        answer: `${fmt(change)}% lower`, distractors: [['The same', 'successive-percentages-cancel'], `${fmt(change)}% higher`, `${fmt(p / 5)}% lower`],
        explanation: `× ${fmt(1 + p / 100)} then × ${fmt(1 - p / 100)} gives × ${fmt(net, 4)}, which is ${fmt(change)}% lower.`,
        hint: 'Multiply the two scale factors instead of adding the percentages.',
        check: near(net, 1 - (p / 100) ** 2),
      };
    },
  },
  {
    key: 'sat.exponential', skillId: 'sat.math/advanced-math/exponential', difficulty: 3, cognitive: 'understand', name: 'Exponential growth factor',
    make: (rng) => {
      const a = pick(rng, [200, 500, 1000, 1500]);
      const r = pick(rng, [2, 4, 5, 8, 10, 12]);
      const grow = rng() < 0.5;
      const factor = grow ? 1 + r / 100 : 1 - r / 100;
      return {
        stem: `The model f(t) = ${a}(${fmt(factor)})ᵗ gives a quantity after t years. Which statement is true?`,
        answer: `It ${grow ? 'increases' : 'decreases'} by ${r}% each year`,
        distractors: [`It ${grow ? 'decreases' : 'increases'} by ${r}% each year`, `It ${grow ? 'increases' : 'decreases'} by ${fmt(factor * 100)}% each year`, `It changes by ${a} each year`],
        explanation: `The growth factor is ${fmt(factor)} = 1 ${grow ? '+' : '−'} ${fmt(r / 100)}, a ${r}% ${grow ? 'increase' : 'decrease'} per year.`,
        hint: 'Compare the base with 1.',
        check: near(factor, grow ? 1 + r / 100 : 1 - r / 100),
      };
    },
  },
  // ======== Advanced (level 5): multi-step problems ========
  {
    key: 'phys.circuit-power', skillId: 'igcse.physics/electricity/circuits', difficulty: 5, cognitive: 'analyse', name: 'Power in a series-parallel circuit',
    make: (rng) => {
      const [r2, r3] = pick(rng, [[6, 3], [12, 6], [4, 4], [10, 10], [12, 12], [20, 5], [6, 12]] as const);
      const r1 = pick(rng, [2, 3, 4, 6, 8]);
      const I = pick(rng, [0.5, 1, 1.5, 2]);
      const rp = (r2 * r3) / (r2 + r3);
      const rt = r1 + rp;
      const V = I * rt;
      const p1 = I * I * r1;
      return {
        stem: `A ${r1} Ω resistor is connected in series with a parallel pair of ${r2} Ω and ${r3} Ω resistors, across a ${fmt(V)} V supply. What power is dissipated in the ${r1} Ω resistor?`,
        answer: p1, unit: 'W',
        distractors: [(V * V) / r1, I * I * rt, V * I, I * r1, (V / (r1 + r2 + r3)) ** 2 * r1],
        explanation: `Parallel pair: (${r2} × ${r3}) ÷ (${r2} + ${r3}) = ${fmt(rp)} Ω. Total: ${r1} + ${fmt(rp)} = ${fmt(rt)} Ω. Current: ${fmt(V)} ÷ ${fmt(rt)} = ${fmt(I)} A. Power in the ${r1} Ω resistor: I²R = ${fmt(I)}² × ${r1} = ${fmt(p1)} W.`,
        hint: 'Find the total resistance first, then the current that flows through the series resistor.',
        // independent route: voltage across R1, then P = V²/R
        check: near(((V * r1) / rt) ** 2 / r1, p1),
      };
    },
  },
  {
    key: 'phys.collision-energy', skillId: 'igcse.physics/motion-forces-energy/momentum', difficulty: 5, cognitive: 'analyse', name: 'Energy lost in a collision',
    make: (rng) => {
      const m1 = pick(rng, [1, 2, 3, 4, 5]);
      const m2 = pick(rng, [1, 2, 3, 5, 6]);
      const u = pick(rng, [2, 3, 4, 6, 8, 10]);
      const v = (m1 * u) / (m1 + m2);
      const before = 0.5 * m1 * u * u;
      const after = 0.5 * (m1 + m2) * v * v;
      const lost = before - after;
      return {
        stem: `A trolley of mass ${m1} kg moving at ${u} m/s collides with a stationary trolley of mass ${m2} kg. They stick together. How much kinetic energy is transferred to other stores in the collision?`,
        answer: lost, unit: 'J', dp: 2,
        distractors: [[0, 'ke-conserved-with-momentum'], after, before, m1 * u - (m1 + m2) * v + 0.5 * m2 * u],
        explanation: `Momentum is conserved: ${m1} × ${u} = ${m1 + m2}v, so v = ${fmt(v)} m/s. KE before = ½ × ${m1} × ${u}² = ${fmt(before)} J. KE after = ½ × ${m1 + m2} × ${fmt(v)}² = ${fmt(after)} J. Energy transferred = ${fmt(lost)} J.`,
        hint: 'Use conservation of momentum to find the common speed, then compare kinetic energies before and after.',
        // closed form for a perfectly inelastic collision
        check: near(lost, before * (m2 / (m1 + m2))),
      };
    },
  },
  {
    key: 'chem.limiting-gas', skillId: 'igcse.chemistry/physical/reacting-masses', difficulty: 5, cognitive: 'analyse', name: 'Limiting reagent and gas volume',
    make: (rng) => {
      const mass = pick(rng, [2.5, 5, 7.5, 10, 12.5, 15, 20]);
      const nCarb = mass / 100;
      const acidLimits = rng() < 0.5;
      const nHcl = acidLimits ? nCarb * pick(rng, [0.5, 1, 1.5]) : nCarb * pick(rng, [3, 4]);
      const nCo2 = Math.min(nCarb, nHcl / 2);
      const vol = nCo2 * 24;
      return {
        stem: `${fmt(mass)} g of calcium carbonate (Mr = 100) is added to ${fmt(nHcl, 4)} mol of hydrochloric acid.\nCaCO₃ + 2HCl → CaCl₂ + H₂O + CO₂\nWhat volume of carbon dioxide is produced at room temperature and pressure? (1 mol of gas occupies 24 dm³.)`,
        answer: vol, unit: 'dm³', dp: 3,
        distractors: [nCarb * 24, nHcl * 24, (nHcl / 2) * 24 === vol ? nCarb * 48 : (nHcl / 2) * 24, mass * 24, vol * 2],
        explanation: `Moles of CaCO₃ = ${fmt(mass)} ÷ 100 = ${fmt(nCarb, 3)}. It needs 2 × ${fmt(nCarb, 3)} = ${fmt(2 * nCarb, 3)} mol HCl; there is ${fmt(nHcl, 4)} mol, so the ${acidLimits ? 'acid' : 'calcium carbonate'} is limiting. Moles of CO₂ = ${fmt(nCo2, 5)}, volume = ${fmt(nCo2, 5)} × 24 = ${fmt(vol, 3)} dm³.`,
        hint: 'Work out which reactant runs out first, using the 1 : 2 ratio in the equation.',
        // independent: moles of each reactant divided by its coefficient; the smaller limits
        check: near(vol / 24, [nCarb / 1, nHcl / 2].sort((a, b) => a - b)[0]),
      };
    },
  },
  {
    key: 'math.quadratic-formula', skillId: 'igcse.mathematics/algebra/quadratics', difficulty: 5, cognitive: 'apply', name: 'Quadratic formula to 2 decimal places',
    make: (rng) => {
      const a = pick(rng, [1, 2, 3]);
      const b = int(rng, -9, 9);
      const c = int(rng, -9, -1);
      const disc = b * b - 4 * a * c;
      const sq = Math.sqrt(disc);
      const x1 = (-b - sq) / (2 * a);
      const x2 = (-b + sq) / (2 * a);
      const wrongDisc = b * b + 4 * a * c;
      const show = (p: number, q: number) => `x = ${fmt(Math.min(p, q))} or x = ${fmt(Math.max(p, q))}`;
      const term = (k: number, s: string) => (k === 0 ? '' : `${k < 0 ? ' − ' : ' + '}${Math.abs(k) === 1 && s ? '' : Math.abs(k)}${s}`);
      return {
        stem: `Solve ${a === 1 ? '' : a}x²${term(b, 'x')}${term(c, '')} = 0, giving your answers correct to 2 decimal places.`,
        answer: show(x1, x2),
        distractors: [
          show(-x1, -x2), // sign of b not changed
          show((-b - sq) / a, (-b + sq) / a), // divided by a instead of 2a
          wrongDisc >= 0 ? show((-b - Math.sqrt(wrongDisc)) / (2 * a), (-b + Math.sqrt(wrongDisc)) / (2 * a)) : show(x1 - 1, x2 + 1), // b² + 4ac
        ],
        explanation: `x = (−b ± √(b² − 4ac)) ÷ 2a with a = ${a}, b = ${b}, c = ${c}: b² − 4ac = ${disc}, so x = (${-b} ± √${disc}) ÷ ${2 * a}, giving ${show(x1, x2)}.`,
        hint: 'The quadratic does not factorise: use x = (−b ± √(b² − 4ac)) ÷ 2a.',
        // independent: both roots satisfy the equation, and they sum to −b/a
        check: Math.abs(a * x1 * x1 + b * x1 + c) < 1e-9 && Math.abs(a * x2 * x2 + b * x2 + c) < 1e-9 && near(x1 + x2, -b / a) && Math.round(sq) ** 2 !== disc,
      };
    },
  },
  {
    key: 'math.cuboid-angle', skillId: 'igcse.mathematics/geometry/pythagoras-trig', difficulty: 5, cognitive: 'analyse', name: 'Angle between a diagonal and a plane',
    make: (rng) => {
      const l = int(rng, 4, 12);
      const w = int(rng, 3, 9);
      const h = int(rng, 2, 10);
      const base = Math.sqrt(l * l + w * w);
      const deg = (x: number) => (Math.atan(x) * 180) / Math.PI;
      const angle = deg(h / base);
      return {
        stem: `A cuboid measures ${l} cm by ${w} cm by ${h} cm (height). Find the angle between a space diagonal and the base, correct to 1 decimal place.`,
        answer: angle, unit: '°', dp: 1,
        distractors: [deg(h / l), deg(base / h), deg(h / w), (Math.asin(h / base) * 180) / Math.PI],
        explanation: `Diagonal of the base = √(${l}² + ${w}²) = ${fmt(base)} cm. The angle θ satisfies tan θ = ${h} ÷ ${fmt(base)}, so θ = ${fmt(angle, 1)}°.`,
        hint: 'Find the diagonal of the base first; it forms a right-angled triangle with the height.',
        // independent: sin θ = h / space diagonal
        check: near(Math.sin((angle * Math.PI) / 180), h / Math.sqrt(l * l + w * w + h * h), 1e-6),
      };
    },
  },
  {
    key: 'sat.system-no-solution', skillId: 'sat.math/algebra/systems', difficulty: 5, cognitive: 'analyse', name: 'Systems with no solution',
    make: (rng) => {
      const a = pick(rng, [1, 2, 3, 4, 6]);
      const b = pick(rng, [2, 3, 4, 5, 6]);
      const m = pick(rng, [2, 3, 4]);
      const d = a * m;
      const k = b * m;
      const c = int(rng, 1, 12);
      const e = c * m + int(rng, 1, 5);
      return {
        stem: `${a}x + ${b}y = ${c}\n${d}x + ky = ${e}\nIn the system of equations above, k is a constant. For what value of k does the system have no solution?`,
        answer: k,
        distractors: [(a * d) / b, -k, b + d - a, k + m],
        explanation: `No solution means the lines are parallel but distinct: the coefficients must be in the same ratio (${d} ÷ ${a} = ${m}), so k = ${b} × ${m} = ${k}, while ${e} ≠ ${c} × ${m} = ${c * m}.`,
        hint: 'Parallel lines have proportional x- and y-coefficients but a different constant.',
        // independent: determinant is zero and the constants are not in the same ratio
        check: a * k - b * d === 0 && c * d !== a * e,
      };
    },
  },
];

const BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

export function getTemplate(key: string | null | undefined): Template | undefined {
  return key ? BY_KEY.get(key) : undefined;
}
