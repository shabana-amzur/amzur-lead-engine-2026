// Work out which target region a lead is in: USA, UAE, Europe or India.
// Returns 'USA' | 'UAE' | 'Europe' | 'India' | 'Other' (known location outside
// these regions) | 'Unknown' (no location found).
// CommonJS so scripts can require it too.

const TARGET_REGIONS = ['USA', 'UAE', 'Europe', 'India'];

const US_STATES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
  'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland',
  'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma',
  'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming', 'district of columbia',
];
const US_STATE_CODES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
const US_CITIES = [
  'san francisco', 'los angeles', 'san diego', 'san jose', 'seattle', 'boston', 'chicago', 'austin', 'dallas',
  'houston', 'denver', 'atlanta', 'miami', 'phoenix', 'philadelphia', 'detroit', 'minneapolis', 'nashville',
  'charlotte', 'raleigh', 'pittsburgh', 'salt lake city', 'portland', 'new york city', 'nyc', 'brooklyn',
  'silicon valley', 'bay area', 'palo alto', 'mountain view', 'menlo park', 'cambridge, ma', 'el segundo', 'torrance',
  'irvine', 'san mateo', 'emeryville', 'calgary',
].filter((city) => city !== 'calgary');

const UAE_PLACES = ['united arab emirates', 'uae', 'u.a.e', 'dubai', 'abu dhabi', 'sharjah', 'ajman', 'ras al khaimah', 'fujairah'];

const INDIA_PLACES = [
  'india', 'bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai', 'chennai', 'new delhi', 'delhi', 'gurugram',
  'gurgaon', 'noida', 'kolkata', 'ahmedabad', 'kochi', 'visakhapatnam', 'vizag', 'jaipur', 'coimbatore',
  'thiruvananthapuram', 'trivandrum', 'indore', 'chandigarh', 'mysuru', 'mysore', 'nagpur', 'bhubaneswar',
];

const EUROPE_PLACES = [
  'europe', 'european union', 'united kingdom', 'uk', 'u.k.', 'england', 'scotland', 'wales', 'northern ireland',
  'ireland', 'germany', 'france', 'spain', 'portugal', 'italy', 'netherlands', 'the netherlands', 'belgium',
  'luxembourg', 'switzerland', 'austria', 'denmark', 'sweden', 'norway', 'finland', 'iceland', 'poland',
  'czech republic', 'czechia', 'slovakia', 'hungary', 'romania', 'bulgaria', 'greece', 'croatia', 'slovenia',
  'serbia', 'estonia', 'latvia', 'lithuania', 'malta', 'cyprus', 'ukraine',
  'london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'dublin', 'berlin', 'munich', 'hamburg', 'frankfurt',
  'cologne', 'stuttgart', 'paris', 'lyon', 'madrid', 'barcelona', 'lisbon', 'porto', 'rome', 'milan', 'amsterdam',
  'rotterdam', 'the hague', 'eindhoven', 'brussels', 'antwerp', 'zurich', 'geneva', 'vienna', 'copenhagen',
  'stockholm', 'oslo', 'helsinki', 'warsaw', 'krakow', 'prague', 'budapest', 'bucharest', 'athens', 'tallinn',
];

// Known places outside the target regions (to tell "Other" from "Unknown").
const OTHER_PLACES = [
  'canada', 'ontario', 'alberta', 'british columbia', 'quebec', 'toronto', 'vancouver', 'calgary', 'montreal',
  'ottawa', 'mexico', 'brazil', 'argentina', 'chile', 'colombia', 'peru', 'australia', 'new zealand', 'sydney',
  'melbourne', 'singapore', 'malaysia', 'indonesia', 'philippines', 'vietnam', 'thailand', 'china', 'hong kong',
  'japan', 'tokyo', 'south korea', 'korea', 'taiwan', 'pakistan', 'bangladesh', 'sri lanka', 'nepal',
  'saudi arabia', 'riyadh', 'qatar', 'doha', 'kuwait', 'bahrain', 'oman', 'israel', 'tel aviv', 'turkey', 'istanbul',
  'egypt', 'nigeria', 'kenya', 'south africa', 'angola', 'luanda', 'morocco', 'ghana', 'russia',
];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordList = (places) => new RegExp(`(^|[^a-z])(${places.map(escape).join('|')})([^a-z]|$)`, 'i');

const MATCHERS = [
  ['UAE', wordList(UAE_PLACES)],
  ['India', wordList(INDIA_PLACES)],
  ['USA', wordList(['united states', 'united states of america', 'usa', 'u.s.', 'u.s.a.', 'us-based', ...US_STATES, ...US_CITIES])],
  ['USA', new RegExp(`,\\s*(${US_STATE_CODES})(\\b|$)`)], // "Austin, TX"
  ['USA', /\b(remote|anywhere)\s*[-–(,]\s*(us|usa|united states)\b|\(us\)/i],
  ['Europe', wordList(EUROPE_PLACES)],
  ['Other', wordList(OTHER_PLACES)],
];

// Region of a single location string, or null.
function regionOf(text) {
  if (!text) return null;
  const value = String(text);
  // "Canada" etc. must win over a state-name collision like "Georgia" only when it's the country.
  for (const [region, pattern] of MATCHERS) {
    if (pattern.test(value)) return region;
  }
  return null;
}

/**
 * @param {{ locations?: string[], text?: string }} input
 *   locations: explicit location fields, most reliable first (job location, HQ).
 *   text: free text to scan when no explicit location is known.
 * @returns {{ region: string, location: string|null }}
 */
function classifyGeography({ locations = [], text = '' } = {}) {
  for (const location of locations.filter(Boolean)) {
    const region = regionOf(location);
    if (region) return { region, location: String(location) };
  }
  // Free text: count mentions per region and take the most mentioned.
  const counts = {};
  for (const [region, pattern] of MATCHERS) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    const hits = (String(text).match(global) || []).length;
    if (hits) counts[region] = (counts[region] || 0) + hits;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? { region: best[0], location: null } : { region: 'Unknown', location: null };
}

const isTargetRegion = (region) => TARGET_REGIONS.includes(region);

/**
 * Region of a lead from its most reliable location data: the job location,
 * the company's headquarters, the stored HQ, then the source text.
 */
function leadGeography({ requirement, profile, hq, text }) {
  const facts = (requirement && requirement.facts) || [];
  const jobLocation = (facts.find((fact) => /location|place/i.test(fact.label)) || {}).value;
  // Old leads stored "USA" as a placeholder HQ, not real data.
  const storedHq = hq && hq !== 'USA' ? hq : null;
  return classifyGeography({
    locations: [jobLocation, profile && profile.headquarters, storedHq],
    text: [text, requirement && requirement.headline, requirement && requirement.summary].filter(Boolean).join(' '),
  });
}

module.exports = { classifyGeography, leadGeography, isTargetRegion, TARGET_REGIONS };
