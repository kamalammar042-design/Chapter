const F = ['foundation', 'intermediate', 'advanced'];
const IA = ['intermediate', 'advanced'];
export const EXTRA_BANK = {
    "Computer Science": {
        "Programming": [
            { q: "What does a 'variable' do in programming?", options: ["Stores a value", "Deletes data", "Prints text", "Stops the program"], correct: 0, exp: "A variable is a named container that stores a value you can use and change.", diff: "easy", levels: F },
            { q: "Which of these is a loop structure?", options: ["if", "for", "return", "print"], correct: 1, exp: "A 'for' loop repeats a block of code a set number of times.", diff: "easy", levels: F },
            { q: "What is the output type of a comparison like 5 > 3?", options: ["Integer", "String", "Boolean", "Float"], correct: 2, exp: "Comparisons return a Boolean: true or false.", diff: "medium", levels: F },
            { q: "In code, '==' usually means:", options: ["Assignment", "Comparison (equality)", "Addition", "A comment"], correct: 1, exp: "'==' checks equality; a single '=' assigns a value.", diff: "medium", levels: F },
        ],
        "Algorithms": [
            { q: "An algorithm is best described as:", options: ["A type of computer", "A step-by-step set of instructions", "A programming language", "A storage device"], correct: 1, exp: "An algorithm is a finite sequence of steps that solves a problem.", diff: "easy", levels: F },
            { q: "Which search is faster on a sorted list?", options: ["Linear search", "Binary search", "Random search", "They're equal"], correct: 1, exp: "Binary search halves the list each step (O(log n)), far faster than linear (O(n)).", diff: "hard", levels: IA },
            { q: "Putting items in order, like A-Z, is called:", options: ["Searching", "Sorting", "Compiling", "Encrypting"], correct: 1, exp: "Sorting arranges data into a defined order.", diff: "easy", levels: F },
        ],
        "Data & Systems": [
            { q: "What does CPU stand for?", options: ["Central Processing Unit", "Computer Power Unit", "Central Print Utility", "Core Programming Unit"], correct: 0, exp: "The CPU (Central Processing Unit) executes instructions \u2014 the computer's 'brain'.", diff: "easy", levels: F },
            { q: "In binary, what is the decimal number 2?", options: ["01", "10", "11", "00"], correct: 1, exp: "Decimal 2 is '10' in binary (1\u00d72 + 0\u00d71).", diff: "medium", levels: F },
            { q: "Which is a unit of digital storage?", options: ["Hertz", "Byte", "Volt", "Watt"], correct: 1, exp: "A byte (8 bits) is the basic unit of digital storage.", diff: "easy", levels: F },
            { q: "RAM is best described as:", options: ["Permanent storage", "Temporary working memory", "A type of CPU", "A network cable"], correct: 1, exp: "RAM is fast, temporary memory cleared when power is lost.", diff: "medium", levels: F },
        ],
        "Networks": [
            { q: "What does 'WWW' stand for?", options: ["World Wide Web", "Web Wire Width", "Wide World Web", "World Web Wire"], correct: 0, exp: "WWW stands for the World Wide Web.", diff: "easy", levels: F },
            { q: "An IP address is used to:", options: ["Style a webpage", "Identify a device on a network", "Store files", "Run programs"], correct: 1, exp: "An IP address uniquely identifies a device on a network.", diff: "medium", levels: F },
        ],
    },
    "Economics": {
        "Microeconomics": [
            { q: "When demand rises and supply stays the same, price usually:", options: ["Falls", "Rises", "Stays the same", "Becomes zero"], correct: 1, exp: "Higher demand with fixed supply pushes the equilibrium price up.", diff: "medium", levels: F },
            { q: "The study of individual markets and consumer choices is:", options: ["Macroeconomics", "Microeconomics", "Statistics", "Accounting"], correct: 1, exp: "Microeconomics focuses on individual agents \u2014 consumers and firms.", diff: "easy", levels: F },
            { q: "A situation where one seller dominates a market is a:", options: ["Monopoly", "Democracy", "Surplus", "Subsidy"], correct: 0, exp: "A monopoly is a market with a single dominant supplier.", diff: "medium", levels: F },
        ],
        "Macroeconomics": [
            { q: "GDP stands for:", options: ["Gross Domestic Product", "General Demand Price", "Global Data Point", "Gross Debt Percentage"], correct: 0, exp: "GDP (Gross Domestic Product) measures the total value of goods and services produced.", diff: "easy", levels: F },
            { q: "A general rise in prices across an economy is called:", options: ["Deflation", "Inflation", "Recession", "Surplus"], correct: 1, exp: "Inflation is a sustained increase in the general price level.", diff: "easy", levels: F },
            { q: "A period of falling economic output and rising unemployment is a:", options: ["Boom", "Recession", "Surplus", "Subsidy"], correct: 1, exp: "A recession is a significant, sustained decline in economic activity.", diff: "medium", levels: F },
        ],
        "Markets": [
            { q: "The point where supply equals demand is called:", options: ["Surplus", "Shortage", "Equilibrium", "Deficit"], correct: 2, exp: "Equilibrium is where the quantity supplied equals the quantity demanded.", diff: "medium", levels: F },
            { q: "If a product's price rises, quantity demanded usually:", options: ["Rises", "Falls", "Stays the same", "Doubles"], correct: 1, exp: "The law of demand: higher prices usually reduce quantity demanded.", diff: "easy", levels: F },
        ],
        "Money & Trade": [
            { q: "The body that typically controls a country's money supply is the:", options: ["Stock market", "Central bank", "Supermarket", "Parliament"], correct: 1, exp: "The central bank manages money supply and interest rates.", diff: "medium", levels: F },
            { q: "Buying goods from another country is called:", options: ["Exporting", "Importing", "Tariffing", "Subsidizing"], correct: 1, exp: "Importing is purchasing goods or services from abroad.", diff: "easy", levels: F },
        ],
    },
    "Business": {
        "Marketing": [
            { q: "The 'target market' refers to:", options: ["All people everywhere", "The specific group a product is aimed at", "The factory", "The competitors"], correct: 1, exp: "A target market is the specific customer group a business aims to serve.", diff: "easy", levels: F },
            { q: "Which is one of the classic '4 Ps' of marketing?", options: ["Profit", "Price", "People", "Polish"], correct: 1, exp: "The 4 Ps are Product, Price, Place, and Promotion.", diff: "medium", levels: F },
            { q: "Building a recognizable name and image is called:", options: ["Branding", "Auditing", "Importing", "Hedging"], correct: 0, exp: "Branding creates a distinct identity for a product or company.", diff: "easy", levels: F },
        ],
        "Finance": [
            { q: "Revenue minus costs equals:", options: ["Profit", "Tax", "Equity", "Debt"], correct: 0, exp: "Profit = revenue \u2212 costs. It's what remains after expenses.", diff: "easy", levels: F },
            { q: "Money a business owes to others is its:", options: ["Asset", "Liability", "Revenue", "Profit"], correct: 1, exp: "A liability is a debt or obligation the business owes.", diff: "medium", levels: F },
            { q: "Cash flow refers to:", options: ["Total profit", "Money moving in and out of a business", "The number of staff", "The brand value"], correct: 1, exp: "Cash flow is the movement of money into and out of a business over time.", diff: "medium", levels: F },
        ],
        "Operations": [
            { q: "Producing goods at lower cost per unit by making more is called economies of:", options: ["Scale", "Scope", "Time", "Trade"], correct: 0, exp: "Economies of scale reduce per-unit cost as output increases.", diff: "hard", levels: IA },
            { q: "Quality control is mainly about:", options: ["Advertising", "Ensuring products meet standards", "Hiring staff", "Setting prices"], correct: 1, exp: "Quality control checks that products meet defined standards.", diff: "easy", levels: F },
        ],
        "Enterprise": [
            { q: "A person who starts and runs a business, taking on risk, is an:", options: ["Employee", "Entrepreneur", "Accountant", "Investor"], correct: 1, exp: "An entrepreneur starts a venture and bears its financial risk.", diff: "easy", levels: F },
            { q: "A business owned by one person is a:", options: ["Partnership", "Sole trader", "Corporation", "Cooperative"], correct: 1, exp: "A sole trader (sole proprietorship) is owned and run by one individual.", diff: "medium", levels: F },
        ],
    },
};
