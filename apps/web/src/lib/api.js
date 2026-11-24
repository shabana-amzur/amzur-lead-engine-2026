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
};

// Apollo contacts for a lead. Search is free; reveal and company lookup use
// 1 Apollo credit each when found.
export const apolloAPI = {
  status: async () => fetchAPI('/api/leads/apollo/status'),
  findContacts: async (leadId) => fetchAPI(`/api/leads/${leadId}/contacts/search`, { method: 'POST' }),
  revealContact: async (leadId, personId) =>
    fetchAPI(`/api/leads/${leadId}/contacts/reveal`, { method: 'POST', body: JSON.stringify({ personId }) }),
  enrichCompany: async (leadId) => fetchAPI(`/api/leads/${leadId}/company/enrich`, { method: 'POST' }),
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
