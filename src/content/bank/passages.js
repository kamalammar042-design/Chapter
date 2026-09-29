export const PASSAGES = [
    {
        id: 'lighthouse',
        title: 'The Lighthouse Keeper',
        level: 'foundation',
        text: 'For forty years, Maren had kept the lighthouse on Skell Rock. Every night she climbed the ' +
            'one hundred and twelve steps to light the great lamp, and every morning she climbed them ' +
            'again to put it out. The villagers on the mainland rarely saw her, but they always saw her ' +
            'light. When a storm took the bridge in her thirtieth year, she stayed anyway, rowing to shore ' +
            'only once a month for supplies. People called her stubborn. Maren called it duty.',
        questions: [
            {
                q: 'How long had Maren kept the lighthouse?',
                options: ['Thirty years', 'Forty years', 'One hundred years', 'Twelve years'],
                correct: 1,
                exp: 'The passage opens by stating she had kept it "for forty years."',
            },
            {
                q: 'What does the passage suggest about Maren\u2019s character?',
                options: ['She was lazy', 'She was sociable', 'She was dedicated', 'She was fearful'],
                correct: 2,
                exp: 'She stayed through storms and saw her work as "duty" — this shows dedication.',
            },
            {
                q: 'Why did the villagers rarely see Maren?',
                options: ['She lived on an isolated rock', 'She was hiding', 'She left the country', 'She worked in the village'],
                correct: 0,
                exp: 'She lived on Skell Rock, separated from the mainland — especially after the bridge was lost.',
            },
        ],
    },
    {
        id: 'rivers',
        title: 'How Rivers Shape the Land',
        level: 'intermediate',
        text: 'Rivers are among the most powerful sculptors of the Earth\u2019s surface. As water flows ' +
            'downhill, it carries sediment — tiny fragments of rock and soil. Over thousands of years, ' +
            'this moving water carves valleys, widens them into floodplains, and deposits the sediment ' +
            'far downstream, often building fertile deltas where a river meets the sea. The faster a ' +
            'river flows, the more material it can carry; when it slows, it drops its load. This endless ' +
            'cycle of erosion and deposition reshapes landscapes long after the people who lived beside ' +
            'them are forgotten.',
        questions: [
            {
                q: 'What does a river carry as it flows downhill?',
                options: ['Only water', 'Sediment', 'Air', 'Heat'],
                correct: 1,
                exp: 'The passage states the water "carries sediment — tiny fragments of rock and soil."',
            },
            {
                q: 'When does a river drop the material it carries?',
                options: ['When it speeds up', 'When it slows down', 'When it freezes', 'When it rains'],
                correct: 1,
                exp: '"When it slows, it drops its load" — slower water carries less.',
            },
            {
                q: 'What is the main idea of the passage?',
                options: [
                    'Rivers are dangerous',
                    'Rivers slowly reshape the land through erosion and deposition',
                    'Rivers are always fast',
                    'People forget rivers',
                ],
                correct: 1,
                exp: 'The whole passage describes how rivers sculpt the land over time.',
            },
        ],
    },
];
export function passagesForLevel(level) {
    const order = ['foundation', 'intermediate', 'advanced'];
    const maxIdx = order.indexOf(level);
    return PASSAGES.filter((p) => order.indexOf(p.level) <= Math.max(0, maxIdx));
}
