// Inbound leads from amzur.com: how a website visit is classified (where the
// visitor came from) and how a contact-form fill becomes a lead.
// Used by routes/inbound.ts. CommonJS so scripts can require it too.

// Sites the tracker accepts events from. INBOUND_ALLOWED_HOSTS (comma-separated)
// overrides it, e.g. to add a staging site or localhost for testing.
const ALLOWED_HOSTS = (process.env.INBOUND_ALLOWED_HOSTS || 'amzur.com,www.amzur.com')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

const isAllowedPage = (url) => ALLOWED_HOSTS.includes(hostOf(url));

const SEARCH_ENGINES = [
  [/(^|\.)google\./, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)yandex\./, 'Yandex'],
  [/(^|\.)baidu\.com$/, 'Baidu'],
  [/(^|\.)ecosia\.org$/, 'Ecosia'],
];
const AI_ASSISTANTS = [
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
  [/(^|\.)claude\.ai$/, 'Claude'],
  [/(^|\.)gemini\.google\.com$/, 'Gemini'],
  [/(^|\.)copilot\.microsoft\.com$/, 'Copilot'],
];
const SOCIAL = [
  [/(^|\.)linkedin\.com$|(^|\.)lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(x|twitter)\.com$|(^|\.)t\.co$/, 'X (Twitter)'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
];

/**
 * Where a visit came from, from its UTM tags or else its referrer.
 * @returns {{ source: string, medium: string, campaign: string|null }}
 *   medium: paid | organic | ai | social | email | referral | direct
 */
function classifySource({ referrer, utm = {}, pageUrl }) {
  // UTM tags sent separately, else read from the page address.
  if (!utm.source && !utm.medium) {
    try {
      const params = new URL(pageUrl).searchParams;
      utm = { source: params.get('utm_source'), medium: params.get('utm_medium'), campaign: params.get('utm_campaign') };
    } catch {
      // not a URL
    }
  }
  const utmSource = (utm.source || '').trim();
  const utmMedium = (utm.medium || '').trim().toLowerCase();
  const campaign = (utm.campaign || '').trim() || null;
  if (utmSource || utmMedium) {
    const medium = /cpc|ppc|paid|display|ads?$/.test(utmMedium)
      ? 'paid'
      : /e-?mail|newsletter/.test(utmMedium)
        ? 'email'
        : /social/.test(utmMedium)
          ? 'social'
          : utmMedium || 'referral';
    const known = [...SEARCH_ENGINES, ...AI_ASSISTANTS, ...SOCIAL].find(([, name]) => name.toLowerCase().startsWith(utmSource.toLowerCase().split(/[ ._-]/)[0]) && utmSource);
    return { source: known ? known[1] : utmSource || 'Unknown', medium, campaign };
  }
  // Google Ads auto-tagging without UTM tags.
  if (/[?&](gclid|gbraid|wbraid)=/.test(pageUrl || '')) return { source: 'Google', medium: 'paid', campaign };
  if (/[?&]li_fat_id=/.test(pageUrl || '')) return { source: 'LinkedIn', medium: 'paid', campaign };

  const host = hostOf(referrer).replace(/^www\./, '');
  if (!host || ALLOWED_HOSTS.includes(host) || ALLOWED_HOSTS.includes(`www.${host}`)) {
    return { source: 'Direct', medium: 'direct', campaign };
  }
  for (const [pattern, name] of AI_ASSISTANTS) if (pattern.test(host)) return { source: name, medium: 'ai', campaign };
  for (const [pattern, name] of SEARCH_ENGINES) if (pattern.test(host)) return { source: name, medium: 'organic', campaign };
  for (const [pattern, name] of SOCIAL) if (pattern.test(host)) return { source: name, medium: 'social', campaign };
  if (/mail\./.test(host) || /outlook\.|mail\.google\./.test(host)) return { source: host, medium: 'email', campaign };
  return { source: host, medium: 'referral', campaign };
}

const MEDIUM_LABELS = {
  paid: 'paid ad',
  organic: 'search',
  ai: 'AI assistant',
  social: 'social',
  email: 'email',
  referral: 'link',
  direct: 'direct',
};

/** "Google search", "LinkedIn (social)", "Direct". */
function sourceLabel({ source, medium } = {}) {
  if (!source) return 'Unknown';
  if (medium === 'direct') return 'Direct (typed the address or a bookmark)';
  if (medium === 'organic') return `${source} search`;
  if (medium === 'paid') return `${source} (paid ad)`;
  return `${source} (${MEDIUM_LABELS[medium] || medium})`;
}

// Country (ISO code from the hosting provider's location header) to the
// engine's regions; see lib/geography.js.
const EUROPE = new Set(
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE GB UK NO CH IS LI UA RS'.split(' ')
);
function regionOfCountry(code) {
  const c = String(code || '').toUpperCase();
  if (!c) return 'Unknown';
  if (c === 'US') return 'USA';
  if (c === 'AE') return 'UAE';
  if (c === 'IN') return 'India';
  if (c === 'KE') return 'Kenya';
  if (EUROPE.has(c)) return 'Europe';
  return 'Other';
}

// Personal email providers: the company can't be read from the address.
const FREE_EMAIL = new Set(
  (
    'gmail.com googlemail.com yahoo.com yahoo.co.in yahoo.co.uk ymail.com outlook.com hotmail.com live.com msn.com ' +
    'icloud.com me.com mac.com aol.com proton.me protonmail.com gmx.com gmx.de mail.com yandex.com yandex.ru ' +
    'mail.ru rediffmail.com zoho.in qq.com 163.com web.de'
  ).split(' ')
);

const emailDomain = (email) => String(email || '').split('@')[1]?.toLowerCase().trim() || '';
const isBusinessEmail = (email) => {
  const domain = emailDomain(email);
  return !!domain && !FREE_EMAIL.has(domain);
};

/** "acme-foods.co.uk" -> "Acme Foods" (a best guess until the company is confirmed). */
function companyFromDomain(domain) {
  const label = String(domain || '')
    .replace(/^www\./, '')
    .split('.')[0];
  if (!label) return null;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => (word.length <= 3 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}

const clip = (text, max) => {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

/** First sentence of the message, as the lead's headline. */
function headlineFrom(message, fallback) {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  const first = text.split(/(?<=[.?!])\s/)[0];
  return clip(first, 140);
}

// Amzur's own addresses: a form sent from these is a test, never a lead.
const INTERNAL_DOMAINS = (process.env.INBOUND_INTERNAL_DOMAINS || 'amzur.com')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// Messages that carry no request: "test", "hi", "asdf", "123".
const TEST_MESSAGE = /^(test(ing)?|this is a test|test (message|enquiry|inquiry|submission|form)|hi+|hello|hey|asdf\w*|qwerty|sample|demo|check(ing)?|ok(ay)?|abc|xyz|na|n\/a|none|nil|\.+|-+|\d+)[\s.!?]*$/i;
// Vendors selling to Amzur through the contact form.
const SALES_PITCH =
  /\b(seo (services|agency|expert)|backlinks?|link[- ]building|guest post(ing)?|rank (your|on) (website|google|the first page)|first page of google|increase your (traffic|sales|leads)|lead generation services|web design services|white[- ]label|we (offer|provide) (affordable|cheap|dedicated|skilled|top)|(i|we) (am|are) reaching out to offer|our company (offers|provides)|hire (our )?(dedicated )?developers from us|outsourc\w+ partner for your|crypto|casino|forex|loan offer)\b/i;

/**
 * Judge a website enquiry: an internal test, a test / junk message, a vendor
 * selling to Amzur, or a genuine enquiry.
 * @returns {{ status: 'internal'|'junk'|'pitch'|'genuine', reason: string }}
 */
function assessEnquiry(signals = {}) {
  const inbound = signals.inbound || {};
  const domain = emailDomain(inbound.email);
  if (INTERNAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { status: 'internal', reason: `Sent from an Amzur address (${domain}): an internal test enquiry` };
  }
  const message = String(inbound.message || '').replace(/\s+/g, ' ').trim();
  const words = message.split(' ').filter((w) => /[a-z]{2,}/i.test(w));
  if (!message || TEST_MESSAGE.test(message) || /^(test|asdf|qwerty)/i.test(inbound.name || '') || words.length < 4) {
    return { status: 'junk', reason: message ? 'Message too short to be a real request; looks like a test or spam' : 'No message' };
  }
  if (SALES_PITCH.test(message)) return { status: 'pitch', reason: 'Reads like a vendor selling to Amzur, not a buyer' };
  return { status: 'genuine', reason: 'Genuine enquiry' };
}

/**
 * Device, operating system and browser from a browser's user-agent string.
 * @returns {{ device: 'Mobile'|'Tablet'|'Desktop'|null, os: string|null, browser: string|null }}
 */
function parseUserAgent(ua) {
  const text = String(ua || '');
  if (!text) return { device: null, os: null, browser: null };
  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(text)
    ? 'Tablet'
    : /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(text)
      ? 'Mobile'
      : 'Desktop';
  const os = /Windows NT/i.test(text)
    ? 'Windows'
    : /iPhone|iPad|iPod/i.test(text)
      ? 'iOS'
      : /Mac OS X|Macintosh/i.test(text)
        ? 'macOS'
        : /Android/i.test(text)
          ? 'Android'
          : /CrOS/i.test(text)
            ? 'ChromeOS'
            : /Linux/i.test(text)
              ? 'Linux'
              : null;
  const browser = /Edg\//i.test(text)
    ? 'Edge'
    : /OPR\/|Opera/i.test(text)
      ? 'Opera'
      : /SamsungBrowser/i.test(text)
        ? 'Samsung Internet'
        : /Firefox|FxiOS/i.test(text)
          ? 'Firefox'
          : /Chrome|CriOS/i.test(text)
            ? 'Chrome'
            : /Safari/i.test(text)
              ? 'Safari'
              : null;
  return { device, os, browser };
}

// Legal pages: people rarely open these on their own, but email security
// scanners (e.g. Microsoft Defender Safe Links) open every link in an email,
// and the contact form's consent text links to the privacy policy.
const LEGAL_PAGE = /^\/(privacy|privacy-policy|cookie|cookies|cookie-policy|terms|terms-of-use|terms-and-conditions|legal|disclaimer|gdpr)(\/|$)/i;

/**
 * A visitor that looks automated, not a person: only legal pages, arrived with
 * no referrer, and never filled in the form.
 * @param {{ path: string, referrer?: string|null, leadId?: string|null }[]} visits one visitor's page views
 */
function looksAutomated(visits) {
  if (!visits.length || visits.some((v) => v.leadId)) return false;
  return visits.every((v) => LEGAL_PAGE.test(v.path || '')) && !visits[0].referrer;
}

/** A lead someone created by contacting Amzur (never hidden or deleted by the outbound rules). */
const isInbound = (signals) => !!signals && signals.leadType === 'inbound_form';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Pick the contact details out of a submitted form, whatever its field labels.
 * @param {{ label?: string, type?: string, value: string }[]} fields
 */
function readFormFields(fields = []) {
  const out = { name: '', email: '', phone: '', company: '', message: '', jobTitle: '', country: '' };
  for (const field of fields) {
    const label = String(field.label || '').toLowerCase();
    const type = String(field.type || '').toLowerCase();
    const value = clip(field.value, type === 'textarea' ? 4000 : 200);
    if (!value) continue;
    if (!out.email && (type === 'email' || (/e-?mail/.test(label) && EMAIL.test(value)))) out.email = value.toLowerCase();
    else if (!out.phone && (type === 'tel' || /phone|mobile/.test(label))) out.phone = value;
    else if (!out.company && /company|organi[sz]ation|business name|employer/.test(label)) out.company = value;
    else if (!out.jobTitle && /title|role|designation|position/.test(label)) out.jobTitle = value;
    else if (!out.country && /country|location/.test(label)) out.country = value;
    else if (!out.message && (type === 'textarea' || /message|requirement|how can we help|details|comment/.test(label))) out.message = value;
    else if (/first name/.test(label)) out.name = out.name ? `${value} ${out.name}` : value;
    else if (/last name|surname/.test(label)) out.name = out.name ? `${out.name} ${value}` : value;
    else if (!out.name && /name/.test(label)) out.name = value;
  }
  return out;
}

module.exports = {
  isInbound,
  looksAutomated,
  parseUserAgent,
  assessEnquiry,
  INTERNAL_DOMAINS,
  ALLOWED_HOSTS,
  isAllowedPage,
  classifySource,
  sourceLabel,
  regionOfCountry,
  emailDomain,
  isBusinessEmail,
  companyFromDomain,
  headlineFrom,
  readFormFields,
  EMAIL,
  clip,
};
