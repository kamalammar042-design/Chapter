// ============================================================
// Skill taxonomy
// ------------------------------------------------------------
// Program → Subject → Topic → Skill. Skills are the unit the learning
// engine reasons about: mastery, misconceptions, spaced review and question
// generation all target a skill, not a whole topic.
//
// Each skill has a learning objective (used in generation prompts and on
// concept cards) and keywords (used to tag legacy questions that were
// written before skills existed; see scripts/generate-content-sql.mjs).
//
// Keys are stable identifiers stored in the database. Rename the display
// name freely; never change a key once students have data against it.
// ============================================================

export interface Skill {
  key: string;
  name: string;
  objective: string;
  keywords: string[];
}

type Row = [key: string, name: string, objective: string, keywords: string];

const S = (rows: Row[]): Skill[] =>
  rows.map(([key, name, objective, keywords]) => ({
    key,
    name,
    objective,
    keywords: keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean),
  }));

/** Keyed "subjectKey/topicKey". */
export const SKILLS: Record<string, Skill[]> = {
  // ---- IGCSE Biology -----------------------------------------------------
  'igcse.biology/cells': S([
    ['cell-structure', 'Cell structure & organelles', 'Identify cell structures and describe the function of each organelle in plant, animal and bacterial cells.', 'nucleus, mitochondria, ribosome, cell wall, membrane, chloroplast, organelle, cytoplasm, vacuole, prokaryot, eukaryot'],
    ['specialised-cells', 'Specialised cells & organisation', 'Relate the structure of specialised cells to their function and order the levels of organisation.', 'specialised, tissue, organ, red blood cell, root hair, xylem, phloem, stem cell, differentiat'],
    ['transport-membranes', 'Diffusion, osmosis & active transport', 'Explain diffusion, osmosis and active transport in terms of concentration gradients and energy.', 'diffusion, osmosis, active transport, concentration gradient, water potential, turgid, plasmolys, partially permeable'],
    ['enzymes', 'Enzymes', 'Explain how enzymes work and how temperature and pH affect their activity.', 'enzyme, active site, substrate, denatur, catalyst, amylase, protease, lipase, lock and key, optimum'],
    ['microscopy', 'Microscopy & magnification', 'Use magnification = image size ÷ actual size and convert between units.', 'magnification, microscope, image size, actual size, micrometre, resolution'],
  ]),
  'igcse.biology/human-biology': S([
    ['nutrition-digestion', 'Nutrition & digestion', 'Describe a balanced diet and the roles of the digestive organs and enzymes.', 'digest, stomach, intestine, bile, villi, diet, vitamin, protein, carbohydrate, fibre, starch'],
    ['circulation', 'Circulation & blood', 'Describe the heart, blood vessels and the components of blood.', 'heart, artery, vein, capillar, blood, plasma, platelet, haemoglobin, ventricle, atrium, circulat'],
    ['gas-exchange', 'Respiration & gas exchange', 'Compare aerobic and anaerobic respiration and describe gas exchange in the lungs.', 'respiration, aerobic, anaerobic, lactic, alveoli, lung, breathing, gas exchange, glucose + oxygen'],
    ['coordination', 'Nervous & hormonal control', 'Describe reflex arcs, the eye and the action of hormones such as insulin and adrenaline.', 'neuron, nerve, reflex, synapse, hormone, insulin, adrenaline, gland, eye, pupil, retina'],
    ['homeostasis-disease', 'Homeostasis, disease & immunity', 'Explain homeostasis and how the body defends itself against pathogens.', 'homeostasis, temperature control, kidney, pathogen, antibod, immune, vaccin, white blood, antibiotic, disease'],
  ]),
  'igcse.biology/genetics': S([
    ['dna-protein', 'DNA, genes & protein synthesis', 'Describe DNA structure, base pairing and how genes code for proteins.', 'dna, base pair, adenine, thymine, guanine, cytosine, gene, codon, protein synthesis, double helix, chromosome'],
    ['cell-division', 'Mitosis & meiosis', 'Compare mitosis and meiosis and state where each happens.', 'mitosis, meiosis, haploid, diploid, gamete, division, identical cells'],
    ['monohybrid', 'Monohybrid inheritance', 'Use genetic diagrams and Punnett squares to predict inheritance ratios.', 'dominant, recessive, homozygous, heterozygous, genotype, phenotype, allele, punnett, carrier, ratio, cross'],
    ['variation-selection', 'Variation, selection & evolution', 'Explain variation, natural selection and adaptation.', 'variation, natural selection, evolution, adaptation, mutation, selective breeding, darwin, survival'],
    ['biotechnology', 'Genetic technology', 'Describe genetic modification and uses of biotechnology.', 'genetic modification, genetically, biotechnology, plasmid, insulin production, fermenter, cloning'],
  ]),
  'igcse.biology/ecology': S([
    ['food-chains', 'Food chains & energy flow', 'Interpret food chains, webs and pyramids and explain energy loss between trophic levels.', 'food chain, food web, producer, consumer, trophic, pyramid, predator, prey, energy transfer, decomposer'],
    ['nutrient-cycles', 'Carbon & nitrogen cycles', 'Describe the carbon and nitrogen cycles and the organisms involved.', 'carbon cycle, nitrogen cycle, nitrif, denitrif, decomposition, fixation'],
    ['populations', 'Populations & sampling', 'Describe population growth and estimate populations with quadrats.', 'population, quadrat, sampling, carrying capacity, growth curve, habitat, community, ecosystem'],
    ['human-impact', 'Human impact & conservation', 'Evaluate the effects of humans on ecosystems and conservation methods.', 'deforestation, pollution, greenhouse, global warming, eutrophication, conservation, biodiversity, climate'],
    ['photosynthesis', 'Photosynthesis & plant nutrition', 'State the photosynthesis equation and explain limiting factors.', 'photosynthesis, chlorophyll, light intensity, limiting factor, stomata, leaf, carbon dioxide + water, glucose'],
  ]),

  // ---- IGCSE Chemistry ------------------------------------------------------
  'igcse.chemistry/physical': S([
    ['moles', 'Moles & stoichiometry', 'Use n = m / Mr, molar ratios from balanced equations and the molar gas volume.', 'mole, molar, mr, relative formula, avogadro, stoichiometr, balanced equation, 24 dm'],
    ['reacting-masses', 'Reacting masses & limiting reagents', 'Calculate reacting masses, yields and identify the limiting reagent.', 'reacting mass, yield, limiting, excess, percentage yield, theoretical yield'],
    ['energetics', 'Energy changes', 'Classify reactions as exothermic or endothermic and interpret energy profiles.', 'exothermic, endothermic, enthalpy, energy profile, activation energy, bond energy, heat released'],
    ['rates', 'Rates of reaction', 'Explain how temperature, concentration, surface area and catalysts affect rate using collision theory.', 'rate, collision, catalyst, surface area, concentration, temperature increase, frequency of collisions'],
    ['equilibrium', 'Reversible reactions & equilibrium', 'Predict how changing conditions shifts a dynamic equilibrium.', 'equilibrium, reversible, le chatelier, haber, dynamic, shift, forward reaction'],
    ['electrolysis', 'Electrolysis', 'Predict the products of electrolysis and write half-equations.', 'electrolysis, electrode, cathode, anode, electrolyte, half-equation, molten, aqueous, positive ions move'],
  ]),
  'igcse.chemistry/inorganic': S([
    ['atomic-structure', 'Atomic structure', 'Describe protons, neutrons, electrons, isotopes and electronic configuration.', 'proton, neutron, electron, isotope, atomic number, mass number, electron shell, configuration, nucleus'],
    ['bonding', 'Bonding & structure', 'Explain ionic, covalent and metallic bonding and relate structure to properties.', 'ionic, covalent, metallic, bond, lattice, molecule, giant, delocalised, melting point, conduct'],
    ['periodic-table', 'Periodic table & groups', 'Explain trends in groups 1, 7 and 0 and the transition elements.', 'periodic, group, alkali, halogen, noble gas, transition, period, reactivity increases, sodium, chlorine'],
    ['metals-reactivity', 'Metals & reactivity series', 'Use the reactivity series to predict displacement and extraction methods.', 'reactivity series, displacement, extraction, ore, blast furnace, rust, corrosion, alloy, metal'],
    ['acids-salts', 'Acids, bases & salts', 'Describe neutralisation, pH and methods of preparing salts.', 'acid, base, alkali, ph, neutralis, salt, indicator, hydrogen ion, hydroxide, ph 7, ph of, strong acid'],
  ]),
  'igcse.chemistry/organic': S([
    ['hydrocarbons', 'Alkanes & alkenes', 'Compare alkanes and alkenes, including the bromine water test and addition reactions.', 'alkane, alkene, methane, ethene, saturated, unsaturated, bromine water, addition, hydrocarbon, cracking'],
    ['functional-groups', 'Alcohols, acids & esters', 'Describe alcohols, carboxylic acids and esters and their reactions.', 'alcohol, ethanol, carboxylic, ester, fermentation, functional group, oxidation'],
    ['polymers', 'Polymers', 'Explain addition and condensation polymerisation and draw repeat units.', 'polymer, monomer, polymeris, plastic, poly(, nylon, repeat unit'],
    ['fuels', 'Fuels & crude oil', 'Describe fractional distillation and the combustion of fuels.', 'crude oil, fraction, distillation, fuel, combustion, petroleum, incomplete combustion, carbon monoxide'],
    ['naming-isomers', 'Naming & isomers', 'Name simple organic compounds and identify structural isomers.', 'isomer, homologous, general formula, naming, prefix, structural formula, meth, eth, prop, but'],
  ]),
  'igcse.chemistry/analysis': S([
    ['separation', 'Separation & purification', 'Choose filtration, crystallisation or distillation to separate mixtures.', 'filtration, crystallis, distillation, separat, purif, mixture, evaporat, solvent'],
    ['chromatography', 'Chromatography', 'Interpret chromatograms and calculate Rf values.', 'chromatograph, rf, solvent front, spot'],
    ['ion-tests', 'Tests for ions & gases', 'Identify ions and gases from test results.', 'test for, precipitate, flame test, limewater, litmus, squeaky pop, glowing splint, silver nitrate'],
    ['practical', 'Titration & practical skills', 'Plan titrations and handle practical data and errors.', 'titration, burette, pipette, end point, concordant, apparatus, measure'],
  ]),

  // ---- IGCSE Physics ------------------------------------------------------
  'igcse.physics/motion-forces-energy': S([
    ['motion', 'Speed & motion graphs', 'Calculate speed and acceleration and interpret distance-time and speed-time graphs.', 'speed, velocity, acceleration, distance-time, speed-time, graph, m/s, deceleration'],
    ['forces', "Forces & Newton's laws", "Apply F = ma, resultant forces, weight and friction.", 'force, newton, f = ma, resultant, mass, weight, friction, inertia, terminal velocity, accelerates at'],
    ['momentum', 'Momentum', 'Use p = mv and conservation of momentum in collisions.', 'momentum, collision, impulse, kg·m/s, conservation of momentum'],
    ['energy-work-power', 'Energy, work & power', 'Calculate work, kinetic and potential energy, power and efficiency.', 'work done, kinetic energy, potential energy, power, efficiency, joule, watt, energy store'],
    ['pressure-density', 'Density & pressure', 'Use density = m/V and pressure = F/A, including pressure in liquids.', 'density, pressure, pascal, kg/m, f/a, hydraulic, depth'],
    ['moments', 'Moments', 'Calculate moments and apply the principle of moments.', 'moment, pivot, turning, lever, equilibrium, centre of mass'],
  ]),
  'igcse.physics/thermal': S([
    ['particle-model', 'Particle model & states', 'Explain states of matter, changes of state and evaporation with the particle model.', 'particle, solid, liquid, gas, state, evaporat, boiling, melting, kinetic theory, brownian'],
    ['thermal-energy', 'Specific heat & latent heat', 'Use E = mcΔT and E = mL.', 'specific heat, latent heat, mcδt, heat capacity, temperature rise, joules per kilogram'],
    ['heat-transfer', 'Conduction, convection & radiation', 'Explain conduction, convection and radiation and how to reduce heat loss.', 'conduction, convection, radiation, insulat, infrared, thermal conductor, heat transfer'],
    ['gas-behaviour', 'Gas pressure & temperature', 'Relate gas pressure, volume and temperature, including absolute zero and Kelvin.', 'kelvin, absolute zero, gas pressure, boyle, compressed, pv, temperature scale'],
  ]),
  'igcse.physics/waves': S([
    ['wave-properties', 'Wave properties & wave equation', 'Use v = fλ and T = 1/f; distinguish transverse and longitudinal waves.', 'wavelength, frequency, amplitude, wave equation, transverse, longitudinal, period, hz, v = fλ'],
    ['sound', 'Sound', 'Describe sound waves, echoes, pitch, loudness and the speed of sound in media.', 'sound, echo, pitch, loudness, ultrasound, compression, rarefaction, 340 m/s'],
    ['light', 'Reflection, refraction & lenses', 'Apply laws of reflection and refraction, total internal reflection and lens diagrams.', 'reflection, refraction, refractive index, lens, critical angle, total internal reflection, focal, snell'],
    ['em-spectrum', 'Electromagnetic spectrum', 'Order the EM spectrum and describe uses and dangers of each region.', 'electromagnetic, radio, microwave, infrared, ultraviolet, x-ray, gamma, visible light, spectrum'],
  ]),
  'igcse.physics/electricity': S([
    ['charge-current', 'Charge & current', 'Use Q = It and describe current as a flow of charge.', 'charge, current, coulomb, ampere, electron flow, conventional current, q = it, static'],
    ['resistance', "Resistance & Ohm's law", 'Use V = IR and interpret I–V characteristics.', 'resistance, ohm, v = ir, resistor, i-v, thermistor, ldr, voltage across'],
    ['circuits', 'Series & parallel circuits', 'Calculate current, voltage and resistance in series and parallel circuits.', 'series, parallel, combined resistance, total resistance, circuit, branch, potential divider'],
    ['power-energy', 'Electrical power & energy', 'Use P = IV and E = Pt, including kWh and cost.', 'power, p = iv, energy transferred, kilowatt, kwh, watt, device runs'],
    ['safety', 'Electrical safety', 'Explain fuses, earthing, circuit breakers and double insulation.', 'fuse, earth wire, circuit breaker, insulation, live wire, neutral, plug'],
  ]),
  'igcse.physics/magnetism': S([
    ['magnetic-fields', 'Magnets & magnetic fields', 'Describe magnetic poles, field lines and induced magnetism.', 'magnet, pole, magnetic field, field line, attract, repel, compass, ferrous, induced magnetism'],
    ['electromagnetism', 'Electromagnetism & motor effect', 'Describe fields around currents, electromagnets and the motor effect.', 'electromagnet, solenoid, motor, fleming, left-hand, current-carrying, coil, force on a wire'],
    ['induction', 'Electromagnetic induction', "Explain induced EMF, Faraday's and Lenz's laws and generators.", 'induction, induced, generator, dynamo, faraday, lenz, emf, flux, alternating'],
    ['transformers', 'Transformers & transmission', 'Use the transformer equation and explain high-voltage transmission.', 'transformer, step-up, step-down, turns, primary, secondary, national grid, transmission'],
  ]),
  'igcse.physics/nuclear-space': S([
    ['atomic-model', 'Atomic model & isotopes', 'Describe the nuclear atom, isotopes and nuclide notation.', 'nucleus, isotope, nucleon, proton number, rutherford, nuclide, atomic model'],
    ['radioactivity', 'Radioactive decay & half-life', 'Describe decay, write decay equations and calculate half-life.', 'half-life, decay, radioactive, activity, becquerel, alpha decay, beta decay'],
    ['radiation-safety', 'Radiation types & safety', 'Compare alpha, beta and gamma and describe safe handling and uses.', 'alpha, beta, gamma, ionising, penetrat, background radiation, contamination, irradiation'],
    ['space', 'Earth, Solar System & stars', 'Describe orbits, the Solar System, star life cycles and redshift.', 'orbit, planet, solar system, star, galaxy, red shift, big bang, moon, sun, universe'],
  ]),

  // ---- IGCSE Mathematics -----------------------------------------------------
  'igcse.mathematics/number': S([
    ['percentages', 'Percentages & interest', 'Find percentage change, reverse percentages and simple and compound interest.', 'percent, %, interest, increase by, decrease, reduction, discount, depreciat, original price'],
    ['ratio-proportion', 'Ratio & proportion', 'Share in a ratio and solve direct and inverse proportion problems.', 'ratio, share, proportion, recipe, per, direct proportion, inverse'],
    ['standard-form-indices', 'Standard form & indices', 'Use index laws and write numbers in standard form.', 'standard form, × 10, indices, index, power, 2⁻, exponent, ⁻'],
    ['factors-primes', 'Factors, multiples & primes', 'Find HCF, LCM and prime factorisations.', 'hcf, lcm, factor, multiple, prime, highest common, lowest common'],
    ['rounding-bounds', 'Rounding, estimation & bounds', 'Round to significant figures and find upper and lower bounds.', 'significant figure, round, bound, estimate, decimal place, nearest'],
    ['fractions-surds', 'Fractions, decimals & surds', 'Calculate with fractions and simplify surds; classify rational and irrational numbers.', 'fraction, surd, √, irrational, rational, recurring, decimal'],
  ]),
  'igcse.mathematics/algebra': S([
    ['linear-equations', 'Linear equations & rearranging', 'Solve linear equations and change the subject of a formula.', 'solve for x, linear, rearrang, subject, solve:, equation'],
    ['quadratics', 'Quadratics', 'Factorise and solve quadratic equations.', 'quadratic, x², factoris, roots, completing the square'],
    ['functions', 'Functions', 'Evaluate, compose and invert functions.', 'f(x), function, inverse, composite, g(x)'],
    ['sequences', 'Sequences', 'Find nth terms of linear and simple quadratic sequences.', 'sequence, nth term, term-to-term, arithmetic, sum 1 + 2'],
    ['inequalities', 'Inequalities', 'Solve and represent linear inequalities.', 'inequalit, <, >, ≤, ≥'],
    ['graphs', 'Graphs & gradients', 'Find gradients, intercepts and equations of straight lines; sketch curves.', 'gradient, y-intercept, y = mx, straight line, graph, slope'],
    ['simultaneous', 'Simultaneous equations', 'Solve simultaneous linear equations.', 'simultaneous, two equations, system'],
  ]),
  'igcse.mathematics/geometry': S([
    ['angles', 'Angles & polygons', 'Use angle facts, parallel lines and polygon angle sums.', 'angle, polygon, parallel, interior, exterior, triangle angles, isosceles, sum to'],
    ['pythagoras-trig', 'Pythagoras & trigonometry', 'Apply Pythagoras and SOHCAHTOA in right-angled triangles.', 'hypotenuse, pythagoras, right triangle, sin, cos, tan, trigonometr, legs'],
    ['mensuration', 'Area, perimeter & volume', 'Calculate areas, perimeters, surface areas and volumes.', 'area, perimeter, volume, surface area, cylinder, circle with radius, cuboid, prism'],
    ['circles', 'Circle properties', 'Use circle theorems and arc and sector formulas.', 'circle theorem, arc, sector, tangent, chord, circumference'],
    ['coordinates', 'Coordinate geometry', 'Find midpoints, lengths and equations of lines between points.', 'midpoint, coordinate, distance between, (x, y)'],
    ['transformations', 'Transformations & vectors', 'Describe transformations and use vectors.', 'transformation, reflection in, rotation, enlargement, translation, vector'],
  ]),
  'igcse.mathematics/statistics': S([
    ['averages', 'Averages & spread', 'Calculate mean, median, mode and range, including from tables.', 'mean, median, mode, range, average, quartile, spread, mode of'],
    ['probability', 'Probability', 'Calculate probabilities of single events and expected frequency.', 'probability, likely, dice, coin, expected, p(a)'],
    ['charts', 'Charts & diagrams', 'Draw and interpret charts, histograms and scatter graphs.', 'chart, histogram, scatter, correlation, frequency, pie chart, bar'],
    ['combined-events', 'Combined & conditional probability', 'Use tree diagrams and the rules for independent and dependent events.', 'independent, and b, tree diagram, both, conditional, without replacement'],
  ]),

  // ---- IGCSE Computer Science ----------------------------------------------
  'igcse.computer-science/data-representation': S([
    ['number-systems', 'Binary, denary & hexadecimal', "Convert between number bases, add binary numbers and use two's complement and shifts.", 'binary, denary, hexadecimal, hex, bits, two’s complement, shift, overflow, nibble'],
    ['file-size', 'Images, sound & file size', 'Calculate file sizes from resolution, colour depth and sample rate.', 'file size, colour depth, resolution, pixel, sample rate, byte, kib, bit depth'],
    ['compression', 'Compression', 'Compare lossy and lossless compression and when to use each.', 'lossy, lossless, compression, run-length'],
    ['hardware', 'CPU & hardware', 'Describe the fetch-decode-execute cycle, registers and CPU performance.', 'cpu, register, program counter, fetch, clock speed, cache, core, von neumann, alu'],
    ['storage', 'Memory & storage', 'Compare primary and secondary storage, volatile and non-volatile memory.', 'ram, rom, storage, ssd, hard disk, volatile, primary, secondary, magnetic, optical'],
    ['error-detection', 'Error detection', 'Explain parity, checksums, check digits and ARQ.', 'parity, checksum, check digit, echo check, arq, error'],
  ]),
  'igcse.computer-science/networks': S([
    ['network-devices', 'Network devices & addressing', 'Describe routers, switches, IP and MAC addresses.', 'router, switch, ip address, mac address, network, nic, lan, wan'],
    ['internet-protocols', 'The internet & protocols', 'Explain the web, DNS, URLs and protocols such as HTTP(S).', 'www, http, https, dns, url, protocol, browser, web page'],
    ['transmission', 'Data transmission', 'Compare serial/parallel and simplex/duplex transmission and packet switching.', 'serial, parallel, simplex, duplex, packet, usb, transmission'],
    ['cyber-security', 'Cyber security', 'Describe threats such as phishing and malware and how to defend against them.', 'phishing, malware, firewall, virus, encryption, hacking, brute force, denial of service, proxy'],
  ]),
  'igcse.computer-science/algorithms': S([
    ['search-sort', 'Searching & sorting', 'Trace linear and binary search and bubble sort.', 'search, sort, bubble, binary search, linear search, order'],
    ['validation-testing', 'Validation, verification & testing', 'Choose validation checks and normal, boundary and erroneous test data.', 'validation, verification, range check, presence check, boundary, test data, erroneous'],
    ['trace-tables', 'Trace tables & dry runs', 'Complete trace tables to find the output or error in an algorithm.', 'trace table, dry run, output, algorithm'],
    ['computational-thinking', 'Abstraction & decomposition', 'Apply abstraction and decomposition and represent algorithms with flowcharts and pseudocode.', 'decomposition, abstraction, flowchart, pseudocode, step-by-step, algorithm is'],
  ]),
  'igcse.computer-science/programming': S([
    ['data-types', 'Data types & variables', 'Choose appropriate data types, variables and constants.', 'data type, variable, integer, string, boolean, real, constant, char'],
    ['selection-iteration', 'Selection & iteration', 'Use IF/CASE and count- and condition-controlled loops.', 'loop, for, while, repeat, if, case, iteration, selection'],
    ['arrays', 'Arrays', 'Use one- and two-dimensional arrays with loops.', 'array, index, element, 2d'],
    ['subroutines', 'Procedures & functions', 'Write and call procedures and functions with parameters.', 'procedure, function, subroutine, parameter, return'],
    ['operators', 'Operators & expressions', 'Evaluate arithmetic, logical and comparison expressions including MOD and DIV.', 'mod, div, operator, ==, comparison, logical, and, or, not'],
    ['databases-sql', 'Databases & SQL', 'Write simple SQL queries and identify primary keys.', 'sql, select, database, table, record, field, primary key, where'],
    ['errors', 'Errors & debugging', 'Distinguish syntax, logic and runtime errors.', 'syntax error, logic error, runtime, debug, bug'],
  ]),

  // ---- IGCSE Economics --------------------------------------------------------
  'igcse.economics/micro': S([
    ['scarcity-choice', 'Scarcity & opportunity cost', 'Explain scarcity, choice, opportunity cost and factors of production.', 'scarcity, opportunity cost, choice, factor of production, economic problem, unlimited wants'],
    ['elasticity', 'Price elasticity', 'Calculate and interpret price elasticity of demand and supply.', 'elasticity, ped, elastic, inelastic, responsive'],
    ['costs-revenue', 'Costs, revenue & profit', 'Calculate fixed, variable, average and total costs and revenue.', 'fixed cost, variable cost, average cost, total cost, revenue, profit, economies of scale'],
    ['labour', 'Labour market & wages', 'Explain wage differences and the role of trade unions.', 'wage, labour, trade union, occupation, worker, skilled'],
    ['decision-makers', 'Firms, banks & households', 'Describe the roles of households, firms and commercial banks.', 'commercial bank, household, firm, saving, borrowing, loan, consumer'],
  ]),
  'igcse.economics/markets': S([
    ['demand-supply', 'Demand & supply', 'Distinguish movements along and shifts of demand and supply curves.', 'demand, supply, shift, curve, substitute, complement, law of demand'],
    ['price-determination', 'Price determination', 'Find equilibrium and explain shortages and surpluses.', 'equilibrium, surplus, shortage, excess, market price, clearing'],
    ['market-failure', 'Market failure & externalities', 'Explain externalities, public goods and merit goods.', 'externalit, public good, merit good, demerit, free rider, market failure, pollution'],
    ['intervention', 'Government intervention', 'Analyse price controls, taxes and subsidies.', 'maximum price, minimum price, price ceiling, subsidy, indirect tax, regulation'],
    ['economic-systems', 'Economic systems', 'Compare market, planned and mixed economies.', 'market economy, planned economy, mixed economy, price mechanism, economic system'],
  ]),
  'igcse.economics/macro': S([
    ['fiscal-monetary', 'Fiscal & monetary policy', 'Explain how taxes, spending and interest rates affect the economy.', 'fiscal, monetary, interest rate, government spending, central bank raises, expansionary, contractionary'],
    ['inflation', 'Inflation', 'Explain causes, measurement and consequences of inflation and deflation.', 'inflation, cpi, price index, deflation, purchasing power, cost-push, demand-pull'],
    ['unemployment', 'Unemployment', 'Classify types of unemployment and their causes.', 'unemployment, structural, frictional, cyclical, seasonal, jobless'],
    ['growth', 'Economic growth', 'Measure growth with real GDP and explain its causes and costs.', 'gdp, economic growth, real gdp, recession, boom, output'],
    ['taxation', 'Taxation', 'Distinguish progressive, regressive, direct and indirect taxes.', 'tax, progressive, regressive, direct tax, indirect tax, income tax, vat'],
  ]),
  'igcse.economics/trade': S([
    ['exchange-rates', 'Exchange rates', 'Explain appreciation and depreciation and their effects on trade.', 'exchange rate, currency, depreciat, appreciat, floating'],
    ['protectionism', 'Protectionism', 'Evaluate tariffs, quotas and reasons for protection.', 'tariff, quota, protection, embargo, infant industry, import tax'],
    ['specialisation', 'Specialisation & free trade', 'Explain specialisation and the benefits of international trade.', 'specialisation, free trade, comparative, globalisation, export, import'],
    ['balance-of-payments', 'Balance of payments', 'Interpret the current account and its components.', 'current account, balance of payments, deficit, surplus, trade balance'],
    ['money', 'Money & banking', 'Describe the functions and characteristics of money.', 'money, function of money, medium of exchange, store of value, barter'],
  ]),

  // ---- IGCSE English --------------------------------------------------------
  'igcse.english/reading': S([
    ['explicit-meaning', 'Explicit information', 'Locate and retrieve explicit information from a text.', 'according to, how long, what does the passage state, according, the passage says, skimming, scanning'],
    ['inference', 'Inference', 'Infer attitudes, feelings and meanings that are implied.', 'suggest, infer, imply, implicit, character, attitude, implicit, bias, reliable source, tone of a passage'],
    ['summary', 'Summary', 'Select and concisely rephrase the key points of a text.', 'summary, main idea, summarise, key points, a summary should'],
    ['writers-effects', "Writer's effects", 'Analyse how a writer uses language to create effects.', 'effect, writer uses, language choice, connotation, why does the writer, quotation'],
  ]),
  'igcse.english/writing': S([
    ['argument', 'Argument & persuasion', 'Build a clear argument with evidence and counter-argument.', 'argument, persuasive, counter-argument, discursive, rhetorical question, evidence'],
    ['structure', 'Structure & paragraphing', 'Organise writing with topic sentences, paragraphs and cohesive links.', 'paragraph, topic sentence, conclusion, introduction, structure, cohesive'],
    ['audience-purpose', 'Audience, purpose & register', 'Adapt tone, form and register for audience and purpose.', 'audience, purpose, register, formal, informal, tone, letter, speech, article'],
    ['descriptive-narrative', 'Descriptive & narrative writing', 'Use sensory detail, varied sentences and narrative structure.', 'descriptive, narrative, sensory, story, setting, imagery in writing'],
  ]),
  'igcse.english/language': S([
    ['punctuation', 'Punctuation', 'Use commas, apostrophes, colons and semicolons accurately.', 'comma, apostrophe, semicolon, colon, punctuation, quotation mark, dash'],
    ['sentence-structure', 'Sentence structure', 'Identify and write simple, compound and complex sentences.', 'compound sentence, complex sentence, clause, subordinate, conjunction, simple sentence'],
    ['grammar-usage', 'Grammar & usage', 'Use tenses, agreement and parts of speech correctly.', 'noun, verb, adjective, adverb, pronoun, tense, subject-verb, preposition, grammar, passive voice, dangling, choose the correct word'],
    ['vocabulary', 'Vocabulary & spelling', 'Choose precise vocabulary and spell commonly confused words.', 'synonym, antonym, vocabulary, spelling, meaning of the word, prefix'],
  ]),
  'igcse.english/techniques': S([
    ['figurative', 'Figurative language', 'Identify and explain metaphor, simile and personification.', 'metaphor, simile, personification, hyperbole, imagery, figurative'],
    ['sound-devices', 'Sound devices', 'Identify alliteration, onomatopoeia, rhyme and rhythm.', 'alliteration, onomatopoeia, rhyme, rhythm, assonance, sibilance, iambic, pentameter, stressed beats'],
    ['narrative-perspective', 'Narrative & perspective', 'Explain first- and third-person narration and point of view.', 'first person, third person, narrator, point of view, perspective, protagonist, soliloquy, monologue'],
    ['tone-mood', 'Tone, mood & irony', 'Identify tone, mood, irony and symbolism.', 'tone, mood, irony, symbol, foreshadow, atmosphere, theme'],
  ]),

  // ---- IGCSE Business -----------------------------------------------------
  'igcse.business/enterprise': S([
    ['ownership', 'Business ownership', 'Compare sole traders, partnerships and companies, including liability.', 'sole trader, partnership, limited company, liability, shareholder, franchise, ownership'],
    ['sectors', 'Economic sectors', 'Classify primary, secondary and tertiary activity.', 'primary sector, secondary sector, tertiary, sector'],
    ['stakeholders', 'Stakeholders & objectives', 'Identify stakeholders and conflicts between their objectives.', 'stakeholder, objective, shareholder, employee, customer, community'],
    ['growth', 'Business growth', 'Explain internal and external growth, mergers and integration.', 'merger, takeover, integration, horizontal, vertical, growth'],
    ['entrepreneurs', 'Entrepreneurs & added value', 'Describe entrepreneurs, business plans and added value.', 'entrepreneur, business plan, added value, start-up, risk, fail'],
  ]),
  'igcse.business/marketing': S([
    ['market-research', 'Market research', 'Compare primary and secondary research methods.', 'market research, survey, primary research, secondary research, questionnaire, sample'],
    ['segmentation', 'Market segmentation', 'Segment markets and identify target customers.', 'segment, target market, niche, mass market, demographic'],
    ['marketing-mix', 'Marketing mix', 'Apply the 4Ps and promotion methods.', '4 ps, marketing mix, promotion, place, product, advertis, branding, e-commerce'],
    ['product-life-cycle', 'Product life cycle', 'Describe life-cycle stages and extension strategies.', 'life cycle, introduction, growth stage, maturity, decline, extension strategy'],
    ['pricing', 'Pricing strategies', 'Choose between penetration, skimming, cost-plus and competitive pricing.', 'penetration, skimming, cost-plus, competitive pricing, price'],
  ]),
  'igcse.business/operations': S([
    ['production-methods', 'Production methods', 'Compare job, batch and flow production.', 'job production, batch, flow production, mass production'],
    ['productivity-quality', 'Productivity & quality', 'Measure productivity and compare quality control and TQM.', 'productivity, quality control, quality assurance, tqm, output per worker'],
    ['break-even', 'Break-even', 'Calculate break-even output, contribution and margin of safety.', 'break-even, contribution, margin of safety, fixed costs are'],
    ['inventory-lean', 'Inventory & lean production', 'Explain JIT and lean production.', 'just-in-time, jit, inventory, stock, lean, kaizen'],
    ['scale', 'Economies of scale', 'Distinguish economies and diseconomies of scale.', 'economies of scale, diseconomies, bulk-buying, large scale'],
  ]),
  'igcse.business/finance': S([
    ['profit-margins', 'Profit & margins', 'Calculate gross and net profit and margins.', 'gross profit, net profit, margin, revenue minus, profitability'],
    ['cash-flow', 'Cash flow', 'Interpret cash-flow forecasts and explain why profitable firms fail.', 'cash flow, cash-flow forecast, liquidity, run out of cash, insolvent'],
    ['sources-of-finance', 'Sources of finance', 'Compare internal and external finance.', 'retained profit, loan, share issue, source of finance, overdraft, grant, internal source'],
    ['accounts-ratios', 'Accounts & ratios', 'Interpret financial statements and liquidity ratios.', 'current ratio, asset, liability, balance sheet, income statement, acid test'],
  ]),

  // ---- SAT Math ----------------------------------------------------------------
  'sat.math/algebra': S([
    ['linear-equations', 'Linear equations', 'Solve linear equations in one variable, including with infinitely many or no solutions.', 'solve for x, what is the value of x, linear equation, infinitely many solutions, value of c'],
    ['linear-functions', 'Linear functions & models', 'Interpret slope and intercept in context and write linear models.', 'slope, intercept, line, y = mx, parallel, per month, fee, rate per'],
    ['systems', 'Systems of equations', 'Solve systems of linear equations and determine their number of solutions.', 'system, two equations, 2x + y, infinitely many, and x −, x − y'],
    ['inequalities', 'Linear inequalities', 'Solve and interpret linear inequalities.', 'inequality, >, <, satisfies'],
  ]),
  'sat.math/advanced-math': S([
    ['quadratics', 'Quadratics', 'Solve quadratics, use the discriminant and vertex form.', 'quadratic, x², vertex, discriminant, parabola, solutions of'],
    ['functions', 'Function notation & transformations', 'Evaluate functions and describe graph transformations.', 'f(x), f(−, function, shifted, transformation, graph of y = f'],
    ['exponential', 'Exponential models', 'Interpret growth and decay factors in exponential models.', 'exponential, doubles, (0.9), growth factor, decay, percent per year'],
    ['expressions', 'Equivalent expressions', 'Rewrite polynomial, rational and exponent expressions.', 'equivalent, expression, exponent, (x +, polynomial, simplify, simplify:'],
  ]),
  'sat.math/problem-solving': S([
    ['ratios-rates', 'Ratios, rates & percentages', 'Solve ratio, rate, unit-conversion and percentage problems.', 'ratio, rate, per, percent, discount, recipe, miles, hours, speed'],
    ['statistics', 'Statistics & data', 'Use mean, median, spread and outliers to interpret data.', 'mean, median, data set, outlier, average, standard deviation'],
    ['probability', 'Probability', 'Calculate probabilities, including from two-way tables and without replacement.', 'probability, drawn, marbles, random, chance'],
    ['sampling-inference', 'Sampling & inference', 'Draw conclusions from random samples and margins of error.', 'survey, sample, randomly chosen, estimate, about how many, margin of error'],
  ]),
  'sat.math/geometry-trig': S([
    ['right-triangles', 'Right triangles', 'Apply Pythagoras and special right triangles.', 'right triangle, hypotenuse, legs, pythagor, 30-60-90, 45-45'],
    ['trigonometry', 'Trigonometry & radians', 'Use sine, cosine, tangent and convert between degrees and radians.', 'sin, cos, tan, radian, trigonometr'],
    ['circles', 'Circles', 'Use circle equations, arc length and sector area.', 'circle, radius, arc, sector, (x −, centre, center'],
    ['area-volume', 'Area, volume & similarity', 'Calculate area and volume and use scale factors for similar figures.', 'area, volume, similar, scale factor, cylinder, angle of a triangle, triangle measure'],
  ]),

  // ---- SAT Reading & Writing ------------------------------------------------------
  'sat.reading-writing/information-ideas': S([
    ['central-ideas', 'Central ideas & details', 'Identify the main idea and key supporting details of a short text.', 'main finding, main idea, best states, central, primarily, implicit, skimming, tone, reliable source, bias, summary'],
    ['command-of-evidence', 'Command of evidence', 'Choose evidence that best supports or weakens a claim.', 'support the claim, most directly support, finding would, evidence, weaken'],
    ['inferences', 'Inferences', 'Draw logical conclusions supported by the text.', 'supported by the text, most logically, infer, suggests, best describes'],
    ['quantitative-evidence', 'Quantitative evidence', 'Use data from tables and graphs to complete an argument.', 'table, graph, data, rainfall, supported by the data, percent of'],
  ]),
  'sat.reading-writing/craft-structure': S([
    ['words-in-context', 'Words in context', 'Choose the most logical and precise word for the context.', 'most nearly means, most logically completes the text, which word, as used here'],
    ['text-structure', 'Text structure & purpose', 'Describe the function of a sentence and the overall structure of a text.', 'function of, overall structure, best describes the structure, purpose'],
    ['cross-text', 'Cross-text connections', 'Compare the views in two related texts.', 'text 1, text 2, respond, author of text'],
  ]),
  'sat.reading-writing/expression-ideas': S([
    ['transitions', 'Transitions', 'Choose the transition that expresses the logical relationship between ideas.', 'transition, however, as a result, for example, therefore, yet, nevertheless'],
    ['rhetorical-synthesis', 'Rhetorical synthesis', "Use notes to write a sentence that achieves a stated goal.", 'student wants, notes, achieves the goal, accomplishes this, emphasise'],
  ]),
  'sat.reading-writing/standard-english': S([
    ['boundaries', 'Sentence boundaries', 'Join clauses correctly and punctuate lists and nonessential elements.', 'semicolon, colon, comma splice, completes the text so that, punctuation, clause'],
    ['agreement', 'Agreement', 'Make verbs agree with subjects and pronouns agree with antecedents.', 'each of, agree, its, their, is, are, pronoun'],
    ['form-structure-sense', 'Form, structure & sense', 'Use correct verb forms and avoid dangling modifiers.', 'modifier, having finished, verb form, tense, dangling'],
  ]),
};

export function skillsFor(subjectKey: string, topicKey: string): Skill[] {
  return SKILLS[`${subjectKey}/${topicKey}`] ?? [];
}

export function getSkill(subjectKey: string, topicKey: string, skillKey: string | null | undefined): Skill | undefined {
  if (!skillKey) return undefined;
  return skillsFor(subjectKey, topicKey).find((s) => s.key === skillKey);
}

/**
 * Best skill for a piece of text by keyword overlap, or null when nothing
 * matches. Used only to tag legacy questions; new questions carry an
 * explicit skill.
 */
export function classifySkill(subjectKey: string, topicKey: string, text: string): string | null {
  return scoreSkills(skillsFor(subjectKey, topicKey), text)?.key ?? null;
}

const escape = (k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function scoreSkills(skills: Skill[], text: string): { key: string; score: number } | null {
  const t = text.toLowerCase();
  let best: { key: string; score: number } | null = null;
  for (const s of skills) {
    let score = 0;
    for (const k of s.keywords) {
      if (!k) continue;
      // keywords are stems: match at a word start, e.g. "denatur" matches "denatured"
      const re = /^[a-z0-9]/.test(k) ? new RegExp(`(^|[^a-z0-9])${escape(k)}`) : new RegExp(escape(k));
      if (re.test(t)) score += k.length > 5 ? 2 : 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { key: s.key, score };
  }
  return best;
}

/**
 * Classifies within the given topic first; if nothing matches, searches the
 * rest of the subject (legacy questions were filed coarsely) and returns the
 * topic it belongs to. Null means "needs a human".
 */
export function classifyQuestion(subjectKey: string, topicKey: string, text: string, topicKeys: string[]): { topicKey: string; skillKey: string } | null {
  const own = scoreSkills(skillsFor(subjectKey, topicKey), text);
  if (own) return { topicKey, skillKey: own.key };
  let best: { topicKey: string; skillKey: string; score: number } | null = null;
  for (const tk of topicKeys) {
    if (tk === topicKey) continue;
    const r = scoreSkills(skillsFor(subjectKey, tk), text);
    // require stronger evidence before moving a question to another topic
    if (r && r.score >= 2 && (!best || r.score > best.score)) best = { topicKey: tk, skillKey: r.key, score: r.score };
  }
  return best ? { topicKey: best.topicKey, skillKey: best.skillKey } : null;
}

/** Looks up a skill by its full id ("subject/topic/skill"). */
export function skillById(id: string | null | undefined): (Skill & { id: string; subjectKey: string; topicKey: string }) | undefined {
  if (!id) return undefined;
  const [subjectKey, topicKey, key] = id.split('/');
  const s = getSkill(subjectKey, topicKey, key);
  return s ? { ...s, id, subjectKey, topicKey } : undefined;
}
