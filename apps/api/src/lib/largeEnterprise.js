// Very large enterprises are not reachable prospects for Amzur outreach, so
// discovery skips them (see config/large-enterprises.json). CommonJS so
// scripts can require it too.
const list = require('../config/large-enterprises.json');

const MAX_COMPANY_EMPLOYEES = Math.max(1, parseInt(process.env.MAX_COMPANY_EMPLOYEES || '10000', 10) || 10000);

// Must match companyKey() in services/discoveryEngine.js.
function companyKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|technologies|technology)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const normalize = (name) =>
  (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9&\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const COMPANIES = new Set(list.companies);
const BRANDS = list.brands.map(normalize);

/**
 * Why a company counts as a large enterprise, or null.
 * @param {string} name Company name.
 * @param {number|null} [employees] Employee count from the company profile, when known.
 */
function largeEnterpriseReason(name, employees) {
  const key = companyKey(name);
  if (COMPANIES.has(key)) return 'large enterprise';
  const words = normalize(name);
  // "Google Cloud", "Microsoft India", "SAP Fioneer"; not "Applegate" or "Tatarstan".
  if (BRANDS.some((brand) => words === brand || words.startsWith(`${brand} `))) return 'large enterprise';
  if (typeof employees === 'number' && employees > MAX_COMPANY_EMPLOYEES) return `${employees.toLocaleString('en-US')} employees`;
  return null;
}

module.exports = { largeEnterpriseReason, MAX_COMPANY_EMPLOYEES };
