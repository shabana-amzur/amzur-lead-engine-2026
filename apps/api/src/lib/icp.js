// Check a lead against Amzur's ideal customer profile (ICP) before it is shown:
//
//   Size      Annual revenue $10M–$200M (Amzur's existing research). When
//             revenue is unknown, headcount is used as a proxy (~50–1,000
//             employees is roughly that revenue band).
//   Maturity  An established business with existing systems, operational
//             complexity and technology investments, not an early-stage startup.
//   Role      The person to engage is a CTO, COO, CIO, VP of Technology, Head of
//             Digital Transformation or a senior operational leader. For
//             LinkedIn posts the author is the contact, so their role is checked.
//
// Each check is 'match', 'outside' or 'unknown'. Overall:
//   outside     any check is outside: hidden from the dashboard
//   match       size and maturity match (and role, for LinkedIn posts)
//   unverified  nothing fails but something couldn't be confirmed: shown, flagged
// CommonJS so scripts can require it too.
const { largeEnterpriseReason } = require('./largeEnterprise');

const ICP = {
  minRevenue: 10e6,
  maxRevenue: 200e6,
  // Headcount proxy for the revenue band.
  minEmployees: 50,
  maxEmployees: 1000,
  // Clearly too small / too large when only headcount is known.
  tooFewEmployees: 20,
  tooManyEmployees: 2000,
  minYearsInBusiness: 5,
};

const ROLES_TEXT = 'CTO, COO, CIO, VP of Technology, Head of Digital Transformation or a senior operational leader';

// Senior leaders who own technology or operational change.
const ICP_ROLE =
  /\b(cto|coo|cio|cdo|ceo|chief (technology|technical|operating|operations|information|digital|executive|transformation|data|product) officer|vp,? (of )?(technology|engineering|it|information technology|operations|digital|product|transformation)|vice president,? (of )?(technology|engineering|it|information technology|operations|digital|transformation)|svp|evp|head of (digital( transformation)?|technology|it|engineering|operations|transformation|innovation)|director of (it|technology|operations|digital|engineering|information technology|business systems)|it director|managing director|founder|co-founder|business owner|company owner|president|general manager)\b/i;

const STARTUP =
  /\b(stealth|pre-seed|seed (round|stage|funding)|series a\b|early[- ]stage|startup|start-up|founded (in )?(this|last) year|just launched|newly (formed|founded|launched))\b/i;

// Signs of existing systems / operational complexity worth modernizing.
const EXISTING_SYSTEMS =
  /\b(legacy|existing (system|platform|erp|crm|infrastructure)|current (system|platform|erp)|replace|replacement|migrat\w+|moderni[sz]\w*|upgrade|integrat\w+|erp|netsuite|sap|oracle|mainframe|on-?prem\w*|data cent(er|re)|multiple (sites|locations|systems|entities)|subsidiaries|operations across)\b/i;

// National / federal bodies: far larger than the ICP even though revenue doesn't apply.
const LARGE_PUBLIC_BODY =
  // "national" alone is too broad: a National Park Authority is a small local body.
  /\b(department of|ministry|federal|national (government|security|guard|health service|police)|central bank|army|navy|air force|marine corps|space force|pentagon|dod|dhs|nga|nasa|nhs england|\bva\b|veterans affairs|u\.?s\.? government|european commission|eu commission|government of|home office|cabinet office|hm treasury|hmrc|hm revenue)\b/i;
const PUBLIC_BODY =
  /\b(city of|county|municipal\w*|municipality|council|borough|state of|province|public works|pwd|nagar (palika|nigam)|panchayat|authority|commission|agency|school district|university|college|government|govt|port of|transit)\b/i;

const money = (value) => (value >= 1e9 ? `$${(value / 1e9).toFixed(1)}B` : `$${Math.round(value / 1e6)}M`);

/**
 * @param {object} lead A lead row (companyName, employees, revenue, industry, signals).
 * @returns {{ status: 'match'|'outside'|'unverified', checks: { size: object, maturity: object, role: object }, summary: string }}
 */
function checkIcp(lead) {
  const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
  const profile = signals.company || {};
  const name = lead.companyName || '';
  const linkedIn = signals.leadType === 'linkedin_post';
  const revenue = lead.revenue ?? profile.revenue ?? null;
  const employees = lead.employees ?? profile.employees ?? null;
  const sourceText = `${signals.sourceTitle || ''} ${signals.searchContext || ''} ${signals.requirement?.summary || ''}`;
  const profileText = `${profile.description || ''} ${profile.linkedinIndustry || ''}`;
  const publicSector = lead.industry === 'Public Sector' || PUBLIC_BODY.test(name) || LARGE_PUBLIC_BODY.test(name);

  // ---- size ----
  let size;
  const tooLarge = largeEnterpriseReason(name);
  if (tooLarge) size = { status: 'outside', reason: 'Large enterprise, well above $200M revenue' };
  else if (LARGE_PUBLIC_BODY.test(name)) size = { status: 'outside', reason: 'National / federal public body, far larger than the ICP' };
  else if (typeof revenue === 'number' && revenue > 0) {
    if (revenue < ICP.minRevenue) size = { status: 'outside', reason: `Revenue ${money(revenue)} is below $10M` };
    else if (revenue > ICP.maxRevenue) size = { status: 'outside', reason: `Revenue ${money(revenue)} is above $200M` };
    else size = { status: 'match', reason: `Revenue ${money(revenue)} is within $10M–$200M` };
  } else if (typeof employees === 'number' && employees > 0) {
    const count = employees.toLocaleString('en-US');
    if (employees < ICP.tooFewEmployees) size = { status: 'outside', reason: `${count} employees: likely under $10M revenue` };
    else if (employees > ICP.tooManyEmployees) size = { status: 'outside', reason: `${count} employees: likely over $200M revenue` };
    else if (employees >= ICP.minEmployees && employees <= ICP.maxEmployees)
      size = { status: 'match', reason: `${count} employees: consistent with $10M–$200M revenue (revenue not confirmed)` };
    else size = { status: 'unknown', reason: `${count} employees: borderline for $10M–$200M, so confirm revenue` };
  } else if (linkedIn) size = { status: 'unknown', reason: 'Company not identified yet, so size is unknown' };
  else if (signals.leadType === 'inbound_form' && !signals.inbound?.businessEmail)
    size = { status: 'unknown', reason: 'Used a personal email address, so the company isn’t known yet' };
  else if (publicSector) size = { status: 'unknown', reason: 'Public body: revenue doesn’t apply, so check budget and contract size' };
  else size = { status: 'unknown', reason: 'Revenue and headcount not found, so confirm $10M–$200M revenue' };

  // ---- maturity ----
  let maturity;
  const year = new Date().getFullYear();
  const founded = parseInt(profile.founded, 10);
  if (STARTUP.test(profileText) || STARTUP.test(sourceText)) maturity = { status: 'outside', reason: 'Early-stage startup, not an established business' };
  else if (founded && year - founded < ICP.minYearsInBusiness)
    maturity = { status: 'outside', reason: `Founded ${founded}: under ${ICP.minYearsInBusiness} years in business` };
  else if (founded) {
    const systems = EXISTING_SYSTEMS.test(sourceText);
    maturity = { status: 'match', reason: `Founded ${founded} (${year - founded} years)${systems ? ', with existing systems to change' : ''}` };
  } else if (publicSector) maturity = { status: 'match', reason: 'Established public body with existing systems' };
  else if (typeof employees === 'number' && employees >= ICP.minEmployees)
    maturity = { status: 'match', reason: `${employees.toLocaleString('en-US')} employees: established operations` };
  else if (EXISTING_SYSTEMS.test(sourceText))
    maturity = { status: 'unknown', reason: 'Mentions existing systems, but company age not confirmed' };
  else maturity = { status: 'unknown', reason: 'Company age and maturity not confirmed' };

  // ---- role ----
  let role;
  if (linkedIn) {
    // The author's headline, or the snippet text before the post body starts
    // ("Jane Doe – CTO at Acme | 12 comments ..."), never the ask itself.
    const head = (signals.searchContext || '').split(/\b(looking for|seeking|can anyone|could anyone|any recommendations|does anyone|i'?m|we'?re|hi|hello)\b/i)[0].slice(0, 160);
    // Title from Apollo once the author is revealed, else the snippet's headline area.
    const author = `${signals.apollo?.author?.title || ''} ${signals.authorTitle || ''} ${head}`;
    const title = author.match(ICP_ROLE);
    role = title
      ? { status: 'match', reason: `Author appears to be ${title[0]}` }
      : { status: 'unknown', reason: `Author’s role not confirmed. ICP contacts are a ${ROLES_TEXT}` };
  } else if (signals.leadType === 'inbound_form') {
    // The person who filled in the form: their title, if they gave one or Apollo found it.
    const given = `${signals.inbound?.jobTitle || ''} ${(signals.apollo?.contacts || []).find((c) => c.email && c.email === signals.inbound?.email)?.title || ''}`;
    const title = given.match(ICP_ROLE);
    role = title
      ? { status: 'match', reason: `Contact is ${title[0]}` }
      : { status: 'unknown', reason: `Contact’s role not confirmed. ICP contacts are a ${ROLES_TEXT}` };
  } else {
    role = { status: 'match', reason: `Engage the ${ROLES_TEXT}` };
  }

  const checks = { size, maturity, role };
  const values = Object.values(checks);
  const status = values.some((c) => c.status === 'outside')
    ? 'outside'
    : values.every((c) => c.status === 'match')
      ? 'match'
      : 'unverified';
  const summary =
    status === 'outside'
      ? values.find((c) => c.status === 'outside').reason
      : status === 'match'
        ? 'Matches the ICP'
        : values.filter((c) => c.status === 'unknown').map((c) => c.reason).join(' · ');
  return { status, checks, summary };
}

module.exports = { checkIcp, ICP, ICP_ROLE, ROLES_TEXT };
