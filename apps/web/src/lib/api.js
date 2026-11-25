import Cookies from 'js-cookie';

const PRODUCTION_API_URL = 'https://amzur-lead-engine-api.vercel.app';
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

// A localhost API URL can never work for visitors of the deployed site, so
// ignore one that leaks into a production build and use the live API instead.
const API_URL =
  process.env.NODE_ENV === 'production'
    ? (configuredApiUrl && !configuredApiUrl.includes('localhost') ? configuredApiUrl : PRODUCTION_API_URL)
    : (configuredApiUrl || 'http://localhost:3001');

// Get auth token from cookie
export const getToken = () => {
  return Cookies.get('auth_token');
};

// Set auth token in cookie
export const setToken = (token) => {
  Cookies.set('auth_token', token, { expires: 1 }); // 1 day
};

// Remove auth token
export const removeToken = () => {
  Cookies.remove('auth_token');
};

// Generic fetch wrapper with auth
async function fetchAPI(endpoint, options = {}) {
  const token = getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Auth API
export const authAPI = {
  login: async (email, password) => {
    const data = await fetchAPI('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (data.token) {
      setToken(data.token);
    }
    
    return data;
  },

  verify: async () => {
    return fetchAPI('/api/auth/verify');
  },

  logout: () => {
    removeToken();
  },
};

// Leads API
export const leadsAPI = {
  getAll: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/api/leads${queryString ? `?${queryString}` : ''}`);
  },

  getById: async (id) => {
    return fetchAPI(`/api/leads/${id}`);
  },

  create: async (data) => {
    return fetchAPI('/api/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id, data) => {
    return fetchAPI(`/api/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id) => {
    return fetchAPI(`/api/leads/${id}`, {
      method: 'DELETE',
    });
  },

  // Status, owner, next action, RFP checklist or a note; logged in the lead's activity.
  updateWorkflow: async (id, changes) =>
    fetchAPI(`/api/leads/${id}/workflow`, { method: 'PATCH', body: JSON.stringify(changes) }),

  teamMembers: async () => fetchAPI('/api/leads/team/members'),
};

// Apollo contacts for a lead. Search is free; reveal and company lookup use
// 1 Apollo credit each when found.
export const apolloAPI = {
  status: async () => fetchAPI('/api/leads/apollo/status'),
  findContacts: async (leadId) => fetchAPI(`/api/leads/${leadId}/contacts/search`, { method: 'POST' }),
  // type 'email' (1 credit) or 'phone' (email + phone numbers, extra credits).
  revealContact: async (leadId, personId, type = 'email') =>
    fetchAPI(`/api/leads/${leadId}/contacts/reveal`, { method: 'POST', body: JSON.stringify({ personId, type }) }),
  enrichCompany: async (leadId) => fetchAPI(`/api/leads/${leadId}/company/enrich`, { method: 'POST' }),
  // LinkedIn leads: the post's author by their LinkedIn profile ('email': 1 credit; 'phone': more).
  revealAuthor: async (leadId, type = 'email') =>
    fetchAPI(`/api/leads/${leadId}/linkedin/reveal-author`, { method: 'POST', body: JSON.stringify({ type }) }),
  // Free: the full public LinkedIn post behind a LinkedIn lead, read once.
  linkedinRefresh: async (leadId) => fetchAPI(`/api/leads/${leadId}/linkedin/refresh`, { method: 'POST' }),
  // Free: the company's own description from its website (About page), read once.
  companyAbout: async (leadId) => fetchAPI(`/api/leads/${leadId}/company/about`, { method: 'POST' }),
  // Free: recent news about the company (cached for a day).
  companyNews: async (leadId) => fetchAPI(`/api/leads/${leadId}/company/news`),
  // The team's Apollo sequences and sending mailboxes (free).
  sequences: async () => fetchAPI('/api/leads/apollo/sequences'),
  // Adds a revealed contact to a sequence: Apollo then sends its emails.
  addToSequence: async (leadId, personId, sequenceId, sequenceName, mailboxId) =>
    fetchAPI(`/api/leads/${leadId}/contacts/sequence`, {
      method: 'POST',
      body: JSON.stringify({ personId, sequenceId, sequenceName, mailboxId }),
    }),
};

// Discovery Scan API
export const scanAPI = {
  trigger: async () => {
    return fetchAPI('/api/scan/run', {
      method: 'POST',
    });
  },

  // Check for new leads. Without `force` the API skips the scan if one ran in
  // the last 60 minutes; `force: true` (the Refresh Results button) always scans.
  refresh: async ({ force = false } = {}) => {
    return fetchAPI('/api/scan/refresh', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
  },

  getHistory: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchAPI(`/api/scan/history${queryString ? `?${queryString}` : ''}`);
  },

  getLatest: async () => {
    return fetchAPI('/api/scan/latest');
  },

  getById: async (id) => {
    return fetchAPI(`/api/scan/${id}`);
  },
};

// Inbound (amzur.com visitors and form fills)
export const inboundAPI = {
  visitors: async (days = 30) => fetchAPI(`/api/inbound/visitors?days=${days}`),
  journey: async (leadId) => fetchAPI(`/api/inbound/leads/${leadId}/journey`),
};

// Health check
export const healthCheck = async () => {
  const response = await fetch(`${API_URL}/health`);
  return response.json();
};

export default {
  auth: authAPI,
  leads: leadsAPI,
  scan: scanAPI,
  healthCheck,
};
