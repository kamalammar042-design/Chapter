// Curated misconceptions: well-known wrong ideas, keyed by skill.
// Distractors in questions point at these so that choosing a wrong answer
// tells Chapter *why* a student got it wrong, not just that they did.
// The generation pipeline reuses these keys and may add new ones.

export const MISCONCEPTIONS: Record<string, Array<[key: string, description: string]>> = {
  'igcse.physics/electricity/resistance': [
    ['multiplies-v-and-r', 'Multiplies voltage by resistance to find current instead of dividing.'],
    ['inverts-ohms-law', 'Divides resistance by voltage, inverting Ohm’s law.'],
  ],
  'igcse.physics/electricity/circuits': [
    ['parallel-adds-like-series', 'Adds resistances in parallel as if they were in series.'],
    ['parallel-is-average', 'Thinks combined parallel resistance is the average of the resistors.'],
    ['current-used-up', 'Believes current is used up as it flows around a series circuit.'],
  ],
  'igcse.physics/electricity/charge-current': [
    ['electron-flow-is-conventional', 'Confuses the direction of electron flow with conventional current.'],
  ],
  'igcse.physics/motion-forces-energy/energy-work-power': [
    ['ke-forgets-to-square', 'Forgets to square the speed when calculating kinetic energy.'],
    ['ke-forgets-half', 'Leaves out the ½ in KE = ½mv².'],
    ['ke-confused-with-momentum', 'Confuses kinetic energy (½mv²) with momentum (mv).'],
  ],
  'igcse.physics/motion-forces-energy/momentum': [
    ['ke-conserved-with-momentum', 'Thinks kinetic energy is always conserved when momentum is conserved.'],
  ],
  'igcse.physics/motion-forces-energy/forces': [
    ['mass-is-weight', 'Treats mass and weight as the same quantity.'],
    ['motion-needs-force', 'Believes a moving object needs a resultant force to keep moving at constant speed.'],
  ],
  'igcse.physics/nuclear-space/radioactivity': [
    ['half-life-divides-by-count', 'Divides by the number of half-lives instead of halving repeatedly.'],
  ],
  'igcse.physics/waves/wave-properties': [
    ['frequency-speed-confused', 'Thinks higher frequency always means a faster wave in the same medium.'],
  ],
  'igcse.chemistry/physical/moles': [
    ['moles-multiplies-by-mr', 'Multiplies mass by Mr instead of dividing to find moles.'],
    ['moles-inverted', 'Divides Mr by mass, inverting n = m/Mr.'],
    ['ignores-mole-ratio', 'Ignores the mole ratio from the balanced equation.'],
  ],
  'igcse.chemistry/physical/reacting-masses': [
    ['mass-ratio-from-equation', 'Uses the equation coefficients as a mass ratio instead of a mole ratio.'],
  ],
  'igcse.chemistry/physical/rates': [
    ['catalyst-used-up', 'Thinks a catalyst is used up in the reaction.'],
    ['temperature-more-energy-only', 'Explains faster rates only by energy, missing more frequent successful collisions.'],
  ],
  'igcse.chemistry/organic/hydrocarbons': [
    ['alkane-decolourises-bromine', 'Thinks alkanes decolourise bromine water.'],
  ],
  'igcse.mathematics/number/percentages': [
    ['reverse-percent-adds-back', 'Adds the percentage back on to reverse a percentage decrease.'],
    ['compound-as-simple', 'Calculates compound interest as if it were simple interest.'],
    ['percent-change-gives-only-the-change', 'Gives the size of the change instead of the new value.'],
    ['percent-treated-as-absolute', 'Adds the percentage as an amount instead of a proportion.'],
  ],
  'igcse.mathematics/algebra/linear-equations': [
    ['inverse-operations-order', 'Undoes operations in the wrong order when solving.'],
  ],
  'igcse.mathematics/statistics/combined-events': [
    ['independent-adds', 'Adds probabilities of independent events instead of multiplying.'],
  ],
  'igcse.economics/micro/elasticity': [
    ['ped-inverted', 'Divides the price change by the quantity change, inverting PED.'],
  ],
  'igcse.business/operations/break-even': [
    ['break-even-ignores-variable-costs', 'Divides fixed costs by price, ignoring variable cost per unit.'],
  ],
  'sat.math/problem-solving/ratios-rates': [
    ['successive-percentages-cancel', 'Thinks an increase and an equal percentage decrease cancel out.'],
  ],
};

export function misconceptionText(skillId: string | null | undefined, key: string | null | undefined): string | null {
  if (!skillId || !key) return null;
  return MISCONCEPTIONS[skillId]?.find(([k]) => k === key)?.[1] ?? null;
}
