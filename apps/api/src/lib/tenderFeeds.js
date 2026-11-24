// Official public-tender feeds (free, no API key): open calls for tender for
// IT services and software, straight from the buyer's notice, with deadline
// and value. Results use the same shape as web search results plus `buyer`,
// `deadline`, `location` and a ready-made `requirement`.
//
//   UK Contracts Finder  councils, NHS bodies, universities, housing associations
//   EU TED               public buyers across the EU; TED_COUNTRIES picks the
//                        countries (ISO-3 codes, default IRL,MLT: English-language)
//
// Only open calls: award notices (a supplier already chosen) are never used.
// CommonJS so scripts can require it too.
const axios = require('axios');
const { TECHNOLOGY } = require('./vendorIntent');

const TIMEOUT_MS = 40000;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; AmzurLeadEngine/1.0)', Accept: 'application/json' };

// IT services (72...) and software packages (48...) CPV codes.
const IT_CPV = /^(72|48)/;
// A TED title is "Country – Category – Title"; keep real IT / software categories.
const IT_CATEGORY = /\b(it services|software|information systems?|system and support|computer|data|internet|programming|network|database|digital|consulting)\b/i;

const COUNTRY_NAMES = {
  IRL: 'Ireland', MLT: 'Malta', NLD: 'Netherlands', BEL: 'Belgium', LUX: 'Luxembourg', DNK: 'Denmark', SWE: 'Sweden',
  FIN: 'Finland', NOR: 'Norway', DEU: 'Germany', FRA: 'France', ESP: 'Spain', ITA: 'Italy', AUT: 'Austria', POL: 'Poland',
  PRT: 'Portugal', CZE: 'Czechia', EST: 'Estonia', LVA: 'Latvia', LTU: 'Lithuania', CYP: 'Cyprus', GRC: 'Greece',
};

const isoDay = (date) => date.toISOString().slice(0, 10);
const money = (amount, currency) =>
  amount ? `${currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : ''}${Number(amount).toLocaleString('en-US')}${currency && !['GBP', 'EUR'].includes(currency) ? ` ${currency}` : ''}` : null;
const firstText = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) return firstText(value[0]);
  if (typeof value === 'object') return firstText(value.eng || value.ENG || Object.values(value)[0]);
  return String(value).trim() || null;
};
const clip = (text, max = 600) => {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
};

function requirementFor({ title, description, buyer, location, deadline, value, category, procedure, from }) {
  const facts = [
    buyer && { label: 'Buyer', value: buyer },
    location && { label: 'Location', value: location },
    deadline && { label: 'Deadline', value: new Date(deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
    value && { label: 'Value', value },
    category && { label: 'Category', value: category },
    procedure && { label: 'Procedure', value: procedure },
  ].filter(Boolean);
  return { kind: 'press', headline: title, facts, summary: description ? clip(description) : null, sections: [], from };
}

/** UK Contracts Finder: open IT / software tenders published in the last `days` days. */
async function fetchContractsFinder({ days = 14 } = {}) {
  const from = new Date(Date.now() - days * 86400000);
  const { data } = await axios.get('https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search', {
    params: { publishedFrom: `${isoDay(from)}T00:00:00`, stages: 'tender', size: 100 },
    headers: HEADERS,
    timeout: TIMEOUT_MS,
  });
  const now = Date.now();
  return (data?.releases || [])
    .filter((release) => {
      const tender = release.tender || {};
      const codes = [tender.classification, ...(tender.additionalClassifications || [])].map((c) => String(c?.id || ''));
      const open = !tender.tenderPeriod?.endDate || new Date(tender.tenderPeriod.endDate).getTime() > now;
      // An IT category code AND technology work in the text (CPV codes alone let
      // e.g. a business mentoring programme through).
      return open && codes.some((code) => IT_CPV.test(code)) && TECHNOLOGY.test(`${tender.title || ''} ${tender.description || ''}`);
    })
    .map((release) => {
      const tender = release.tender || {};
      const buyerParty = (release.parties || []).find((p) => (p.roles || []).includes('buyer')) || {};
      const address = buyerParty.address || {};
      const location = [address.locality && address.locality.replace(/\b\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase()), address.countryName || 'United Kingdom']
        .filter(Boolean)
        .join(', ');
      const value = money(tender.value?.amount || tender.minValue?.amount, tender.value?.currency || tender.minValue?.currency);
      const guid = String(release.ocid || '').replace(/^ocds-[a-z0-9]+-/, '');
      const url = `https://www.contractsfinder.service.gov.uk/Notice/${guid}`;
      const buyer = release.buyer?.name || buyerParty.name || null;
      const deadline = tender.tenderPeriod?.endDate || null;
      return {
        title: tender.title,
        url,
        content: clip(tender.description || tender.title, 500),
        published_date: tender.datePublished || release.date || null,
        provider: 'contracts-finder',
        buyer,
        location,
        country: 'United Kingdom',
        deadline,
        value,
        requirement: requirementFor({
          title: tender.title,
          description: tender.description,
          buyer,
          location,
          deadline,
          value,
          category: tender.classification?.description || null,
          procedure: tender.procurementMethodDetails || null,
          from: 'UK Contracts Finder notice',
        }),
      };
    })
    .filter((item) => item.buyer && item.title);
}

/** EU TED: open calls for tender for IT services / software in TED_COUNTRIES. */
async function fetchTed({ days = 7, countries } = {}) {
  const list = (countries || process.env.TED_COUNTRIES || 'IRL,MLT')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c));
  if (!list.length) return [];
  const from = isoDay(new Date(Date.now() - days * 86400000)).replace(/-/g, '');
  const { data } = await axios.post(
    'https://api.ted.europa.eu/v3/notices/search',
    {
      // Contract notices and calls for competition only: never award notices.
      query: `classification-cpv IN (72000000 48000000) AND publication-date>=${from} AND buyer-country IN (${list.join(' ')}) AND notice-type IN (cn-standard cn-social cn-desg pin-cfc-standard pin-cfc-social)`,
      fields: ['publication-number', 'notice-title', 'buyer-name', 'buyer-country', 'buyer-city', 'title-proc', 'description-proc', 'description-lot', 'deadline-receipt-tender-date-lot', 'estimated-value-proc', 'estimated-value-cur-proc', 'publication-date', 'notice-type', 'links'],
      limit: 50,
      page: 1,
      scope: 'ACTIVE',
      paginationMode: 'PAGE_NUMBER',
    },
    { headers: { ...HEADERS, 'Content-Type': 'application/json' }, timeout: TIMEOUT_MS }
  );
  const now = Date.now();
  return (data?.notices || [])
    .map((notice) => {
      const fullTitle = firstText(notice['notice-title']) || '';
      const [, category = '', ...titleParts] = fullTitle.split(' – ');
      const title = firstText(notice['title-proc']) || titleParts.join(' – ') || fullTitle;
      const countryCode = firstText(notice['buyer-country']);
      const country = COUNTRY_NAMES[countryCode] || countryCode;
      const city = firstText(notice['buyer-city']);
      const buyer = firstText(notice['buyer-name']);
      const deadlines = [].concat(notice['deadline-receipt-tender-date-lot'] || []).map((d) => String(d).slice(0, 10)).sort();
      const deadline = deadlines[0] || null;
      const value = money(firstText(notice['estimated-value-proc']), firstText(notice['estimated-value-cur-proc']));
      const description = firstText(notice['description-proc']) || firstText(notice['description-lot']);
      const url = notice.links?.html?.ENG || `https://ted.europa.eu/en/notice/-/detail/${notice['publication-number']}`;
      const location = [city, country].filter(Boolean).join(', ');
      return {
        category,
        title,
        url,
        content: clip(description || title, 500),
        published_date: firstText(notice['publication-date']) ? `${String(firstText(notice['publication-date'])).slice(0, 10)}T00:00:00Z` : null,
        provider: 'ted',
        buyer,
        location,
        country,
        deadline,
        value,
        requirement: requirementFor({
          title,
          description,
          buyer,
          location,
          deadline,
          value,
          category,
          procedure: null,
          from: 'EU TED notice',
        }),
      };
    })
    .filter(
      (item) =>
        item.buyer &&
        item.title &&
        IT_CATEGORY.test(item.category) &&
        TECHNOLOGY.test(`${item.category} ${item.title} ${item.content}`) &&
        (!item.deadline || new Date(item.deadline).getTime() > now)
    );
}

module.exports = { fetchContractsFinder, fetchTed };
