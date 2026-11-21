export const INDUSTRIES = [
  'Healthcare',
  'Retail',
  'Technology',
  'Financial Services',
  'Hospitality',
  'Manufacturing',
  'Food Services',
  'Transportation & Logistics',
  'Sales',
  'General',
] as const;

export type Industry = (typeof INDUSTRIES)[number];

const BASE_QUERIES: Record<Industry, string[]> = {
  Healthcare: [
    'What is it like to work at {company} as a nurse?',
    'Does {company} pay well for entry-level healthcare roles?',
    "What's the work-life balance like at {company}?",
    'How does {company} compare to other hospitals in terms of culture?',
    'What are the biggest complaints from employees at {company}?',
    'Is {company} a good place to start a healthcare career?',
    'What benefits does {company} offer its employees?',
    'How is the management at {company}?',
    'Would you recommend working at {company}?',
    "What's the hiring process like at {company}?",
  ],
  Retail: [
    'What is it like to work at {company} as a store associate?',
    'Does {company} pay competitively for retail workers?',
    'How are the hours and scheduling at {company}?',
    'How does {company} compare to other major retailers as an employer?',
    'What do current and former employees say about working at {company}?',
    'Is {company} a good first job for someone in retail?',
    'What benefits does {company} offer hourly employees?',
    'How is store management at {company}?',
    'Would you recommend working at {company}?',
    "What's the application and interview process like at {company}?",
  ],
  Technology: [
    'What is it like to work as a software engineer at {company}?',
    'Does {company} pay competitively for engineers and product roles?',
    "What's the engineering culture like at {company}?",
    'How does {company} compare to other tech companies for career growth?',
    'What are the biggest complaints from employees at {company}?',
    'Is {company} a good place for a new grad in tech?',
    'What benefits and perks does {company} offer?',
    'How is leadership and management at {company}?',
    'Would you recommend working at {company}?',
    "What's the interview process like at {company}?",
  ],
  'Financial Services': [
    'What is it like to work at {company} in finance?',
    'Does {company} pay well for analyst and associate roles?',
    "What's the work-life balance like at {company}?",
    'How does {company} compare to other banks or financial firms as an employer?',
    'What are the biggest complaints from employees at {company}?',
    'Is {company} a good place to start a finance career?',
    'What benefits does {company} offer employees?',
    'How is the management culture at {company}?',
    'Would you recommend working at {company}?',
    "What's the recruiting process like at {company}?",
  ],
  Hospitality: [
    'What is it like to work at {company} in hospitality?',
    'Does {company} pay well for front-of-house staff?',
    'How are the hours and scheduling at {company}?',
    'How does {company} compare to other hotels or hospitality brands as an employer?',
    'What do employees say about working at {company}?',
    'Is {company} a good place to start a hospitality career?',
    'What benefits does {company} offer hourly employees?',
    'How is management at {company} properties?',
    'Would you recommend working at {company}?',
    "What's the hiring process like at {company}?",
  ],
  Manufacturing: [
    'What is it like to work on the production floor at {company}?',
    'Does {company} pay well for manufacturing and plant roles?',
    'How are the shifts and schedules at {company}?',
    'How does {company} compare to other manufacturers as an employer?',
    'What are the biggest complaints from employees at {company}?',
    'Is {company} a safe place to work?',
    'What benefits does {company} offer plant employees?',
    'How is plant management at {company}?',
    'Would you recommend working at {company}?',
    "What's the application process like at {company}?",
  ],
  'Food Services': [
    'What is it like to work at {company} in a restaurant or kitchen role?',
    'Does {company} pay well for hourly food service workers?',
    'How are the hours and scheduling at {company}?',
    'How does {company} compare to other restaurant chains as an employer?',
    'What do employees say about working at {company}?',
    'Is {company} a good first job?',
    'What benefits does {company} offer hourly employees?',
    'How is store or restaurant management at {company}?',
    'Would you recommend working at {company}?',
    "What's the hiring process like at {company}?",
  ],
  'Transportation & Logistics': [
    'What is it like to work as a driver at {company}?',
    'Does {company} pay well for drivers and warehouse staff?',
    'How are the hours and routes at {company}?',
    'How does {company} compare to other logistics employers?',
    'What are the biggest complaints from employees at {company}?',
    'Is {company} a good place to start a driving or logistics career?',
    'What benefits does {company} offer drivers and warehouse workers?',
    'How is management at {company} terminals or facilities?',
    'Would you recommend working at {company}?',
    "What's the hiring process like at {company}?",
  ],
  Sales: [
    'What is it like to work in sales at {company}?',
    'Does {company} pay competitively in base salary and commission?',
    "What's the sales culture like at {company}?",
    'How does {company} compare to other sales organizations as an employer?',
    'What are the biggest complaints from sales employees at {company}?',
    'Is {company} a good place to start a sales career?',
    'What benefits and incentives does {company} offer sales reps?',
    'How is sales leadership and management at {company}?',
    'Would you recommend working at {company}?',
    "What's the interview process for sales roles at {company}?",
  ],
  // Fallback for employers that don't fit the categories above (universities,
  // law firms, agencies, nonprofits…) or when classification fails.
  General: [
    'What is it like to work at {company}?',
    'Does {company} pay competitively?',
    "What's the work-life balance like at {company}?",
    'How does {company} compare to similar employers?',
    'What are the biggest complaints from employees at {company}?',
    'Is {company} a good place to grow your career?',
    'What benefits does {company} offer employees?',
    'How is leadership and management at {company}?',
    'Would you recommend working at {company}?',
    "What's the hiring and interview process like at {company}?",
  ],
};

export const QUERIES_PER_PLATFORM = 10;

export function isIndustry(value: string): value is Industry {
  return (INDUSTRIES as readonly string[]).includes(value);
}

export function generateQueries(company: string, industry: Industry): string[] {
  // Replacer function, not a string: "$&" / "$'" in a name are replacement patterns.
  return BASE_QUERIES[industry].map((q) => q.replace(/\{company\}/g, () => company));
}

/**
 * A competitor and the other names it goes by. Matching any variant counts as a
 * single mention, so "Kaiser Permanente" no longer scores for both
 * "Kaiser Permanente" and "Kaiser".
 */
export interface CompetitorGroup {
  name: string;
  aliases?: string[];
}

/**
 * Static fallback lists, used only when the company-profile step can't produce
 * a tailored competitor set. Entries are matched case-sensitively, so brand
 * names that are also common words ("Target", "Subway") only match when
 * capitalised.
 */
export const COMPETITORS_BY_INDUSTRY: Record<Industry, CompetitorGroup[]> = {
  Healthcare: [
    { name: 'Kaiser Permanente', aliases: ['Kaiser'] },
    { name: 'Mayo Clinic' },
    { name: 'Cleveland Clinic' },
    { name: 'HCA Healthcare', aliases: ['HCA'] },
    { name: 'Ascension' },
    { name: 'Providence Health', aliases: ['Providence St. Joseph', 'Providence Health & Services'] },
    { name: 'CommonSpirit Health', aliases: ['CommonSpirit'] },
    { name: 'AdventHealth' },
    { name: 'Tenet Healthcare', aliases: ['Tenet'] },
    { name: 'UnitedHealth Group', aliases: ['UnitedHealth', 'UnitedHealthcare', 'Optum'] },
    { name: 'CVS Health', aliases: ['CVS'] },
  ],
  Retail: [
    { name: 'Walmart' },
    { name: 'Target' },
    { name: 'Costco' },
    { name: 'Amazon' },
    { name: 'Home Depot' },
    { name: "Lowe's", aliases: ['Lowes'] },
    { name: 'Kroger' },
    { name: 'Best Buy' },
    { name: "Macy's", aliases: ['Macys'] },
    { name: 'Nordstrom' },
    { name: 'TJX', aliases: ['TJ Maxx', 'T.J. Maxx', 'Marshalls'] },
    { name: 'Aldi' },
  ],
  Technology: [
    { name: 'Google', aliases: ['Alphabet'] },
    { name: 'Meta', aliases: ['Facebook'] },
    { name: 'Apple' },
    { name: 'Microsoft' },
    { name: 'Amazon', aliases: ['AWS'] },
    { name: 'Netflix' },
    { name: 'Salesforce' },
    { name: 'Oracle' },
    { name: 'IBM' },
    { name: 'Adobe' },
    { name: 'Stripe' },
    { name: 'Airbnb' },
    { name: 'Uber' },
  ],
  'Financial Services': [
    { name: 'JPMorgan Chase', aliases: ['JPMorgan', 'J.P. Morgan', 'JP Morgan'] },
    { name: 'Goldman Sachs' },
    { name: 'Morgan Stanley' },
    { name: 'Bank of America', aliases: ['BofA'] },
    { name: 'Citigroup', aliases: ['Citi', 'Citibank'] },
    { name: 'Wells Fargo' },
    { name: 'BlackRock' },
    { name: 'Fidelity Investments', aliases: ['Fidelity'] },
    { name: 'Charles Schwab', aliases: ['Schwab'] },
    { name: 'Capital One' },
    { name: 'American Express', aliases: ['Amex'] },
  ],
  Hospitality: [
    { name: 'Marriott' },
    { name: 'Hilton' },
    { name: 'Hyatt' },
    { name: 'IHG', aliases: ['InterContinental'] },
    { name: 'Wyndham' },
    { name: 'Choice Hotels' },
    { name: 'Four Seasons' },
    { name: 'Accor' },
    { name: 'MGM Resorts', aliases: ['MGM'] },
    { name: 'Caesars Entertainment', aliases: ['Caesars'] },
  ],
  Manufacturing: [
    { name: 'General Motors', aliases: ['GM'] },
    { name: 'Ford', aliases: ['Ford Motor'] },
    { name: 'Toyota' },
    { name: 'Boeing' },
    { name: 'Caterpillar' },
    { name: 'John Deere', aliases: ['Deere & Company', 'Deere'] },
    { name: '3M' },
    { name: 'Honeywell' },
    { name: 'GE', aliases: ['General Electric', 'GE Aerospace'] },
    { name: 'Lockheed Martin' },
    { name: 'RTX', aliases: ['Raytheon'] },
  ],
  'Food Services': [
    { name: "McDonald's", aliases: ['McDonalds'] },
    { name: 'Starbucks' },
    { name: 'Chipotle' },
    { name: 'Chick-fil-A' },
    { name: 'Subway' },
    { name: 'Taco Bell' },
    { name: "Wendy's", aliases: ['Wendys'] },
    { name: 'Burger King' },
    { name: "Domino's", aliases: ['Dominos'] },
    { name: 'Panera', aliases: ['Panera Bread'] },
    { name: 'Olive Garden' },
    { name: 'Darden' },
  ],
  'Transportation & Logistics': [
    { name: 'UPS' },
    { name: 'FedEx' },
    { name: 'Amazon Logistics' },
    { name: 'DHL' },
    { name: 'XPO' },
    { name: 'J.B. Hunt', aliases: ['JB Hunt'] },
    { name: 'Schneider' },
    { name: 'Werner' },
    { name: 'Old Dominion' },
    { name: 'Knight-Swift', aliases: ['Swift Transportation'] },
  ],
  Sales: [
    { name: 'Salesforce' },
    { name: 'Oracle' },
    { name: 'HubSpot' },
    { name: 'ADP' },
    { name: 'Paycom' },
    { name: 'Cisco' },
    { name: 'Dell' },
    { name: 'IBM' },
    { name: 'SAP' },
    { name: 'ServiceNow' },
    { name: 'Workday' },
  ],
  General: [],
};
