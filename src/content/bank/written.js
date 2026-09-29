export const WRITTEN_QUESTIONS = [
    // ---------- English ----------
    {
        kind: 'written', subjectId: 5, topic: 'Grammar',
        q: 'Write a compound sentence joining two complete ideas.',
        prompt: 'Use a connecting word like and, but, or, so.',
        connectorsAnyOf: ['and', 'but', 'or', 'so', 'yet', 'for', 'nor'],
        minWords: 6, mustStartCapital: true, mustEndPunctuation: true,
        sampleAnswer: 'I wanted to go outside, but it was raining heavily.',
        exp: 'A compound sentence joins two independent clauses with a coordinating conjunction (and, but, or, so, yet, for, nor).',
        diff: 'medium', levels: ['foundation', 'intermediate', 'advanced'],
    },
    {
        kind: 'written', subjectId: 5, topic: 'Grammar',
        q: 'Write a complex sentence that begins with a subordinate clause.',
        prompt: 'Start with a word like Although, Because, When, While, or Since.',
        anyOf: [['although', 'because', 'when', 'while', 'since', 'if', 'after', 'before']],
        minWords: 7, mustStartCapital: true, mustEndPunctuation: true,
        sampleAnswer: 'Although she was tired, she finished her homework.',
        exp: 'A complex sentence has an independent clause and at least one dependent (subordinate) clause.',
        diff: 'hard', levels: ['intermediate', 'advanced'],
    },
    {
        kind: 'written', subjectId: 5, topic: 'Literature',
        q: 'In one sentence, explain what a metaphor is and give an example.',
        mustInclude: ['is'],
        anyOf: [['comparison', 'compares', 'comparing']],
        minWords: 8, mustEndPunctuation: true,
        sampleAnswer: 'A metaphor is a direct comparison that says one thing is another, such as "time is a thief."',
        exp: 'A metaphor compares two things by stating one IS the other, without using like or as.',
        diff: 'medium', levels: ['foundation', 'intermediate', 'advanced'],
    },
    {
        kind: 'written', subjectId: 5, topic: 'Essay Writing',
        q: 'Write a clear topic sentence for an essay arguing that reading improves empathy.',
        mustInclude: ['reading'],
        anyOf: [['empathy', 'understand', 'compassion', 'others']],
        minWords: 8, mustStartCapital: true, mustEndPunctuation: true,
        sampleAnswer: 'Reading fiction builds empathy because it lets us experience the world through other people\u2019s eyes.',
        exp: 'A strong topic sentence states the main argument clearly and previews the reasoning.',
        diff: 'hard', levels: ['intermediate', 'advanced'],
    },
    // ---------- Biology (definitions in own words) ----------
    {
        kind: 'written', subjectId: 4, topic: 'Cell Biology',
        q: 'In your own words, describe what photosynthesis is.',
        mustInclude: ['light'],
        anyOf: [['chlorophyll', 'chloroplast'], ['glucose', 'sugar', 'food', 'energy']],
        minWords: 6,
        sampleAnswer: 'Photosynthesis is how plants use light energy and chlorophyll to turn carbon dioxide and water into glucose.',
        exp: 'Photosynthesis converts light energy into chemical energy (glucose) using chlorophyll in chloroplasts.',
        diff: 'medium', levels: ['foundation', 'intermediate', 'advanced'],
    },
    {
        kind: 'written', subjectId: 4, topic: 'Genetics',
        q: 'Explain the difference between a dominant and a recessive allele.',
        mustInclude: ['dominant', 'recessive'],
        minWords: 10,
        sampleAnswer: 'A dominant allele is expressed even with one copy, while a recessive allele is only expressed when both copies are recessive.',
        exp: 'Dominant alleles mask recessive ones; recessive traits appear only when both alleles are recessive.',
        diff: 'hard', levels: ['intermediate', 'advanced'],
    },
    // ---------- Physics (explain in words) ----------
    {
        kind: 'written', subjectId: 1, topic: 'Mechanics',
        q: "State Newton's first law of motion in your own words.",
        anyOf: [['rest', 'stationary', 'still'], ['force', 'unbalanced']],
        minWords: 8,
        sampleAnswer: 'An object stays at rest or moving at constant velocity unless an unbalanced force acts on it.',
        exp: "Newton's first law: an object's motion doesn't change unless a net (unbalanced) force acts on it.",
        diff: 'medium', levels: ['foundation', 'intermediate', 'advanced'],
    },
    // ---------- Chemistry ----------
    {
        kind: 'written', subjectId: 2, topic: 'Physical Chemistry',
        q: 'Describe the difference between an exothermic and an endothermic reaction.',
        mustInclude: ['exothermic', 'endothermic'],
        anyOf: [['heat', 'energy']],
        minWords: 10,
        sampleAnswer: 'An exothermic reaction releases heat to the surroundings, while an endothermic reaction absorbs heat from them.',
        exp: 'Exothermic = releases energy (gets hot); endothermic = absorbs energy (gets cold).',
        diff: 'medium', levels: ['foundation', 'intermediate', 'advanced'],
    },
];
export function writtenForSubject(subjectId, levelTag) {
    return WRITTEN_QUESTIONS.filter((w) => w.subjectId === subjectId && w.levels.includes(levelTag));
}
