// Only leads whose source was posted within this many days are kept and shown.
// Set LEAD_MAX_AGE_DAYS on the API to change it (default 20). Job postings are
// also re-checked and hidden once closed (see lib/jobStatus.js).
const LEAD_MAX_AGE_DAYS = Math.max(1, parseInt(process.env.LEAD_MAX_AGE_DAYS || '20', 10) || 20);
// Leads posted LEAD_MAX_AGE_DAYS to LEAD_ARCHIVE_DAYS (default 30) days ago are
// kept and shown in the dashboard's "Older leads" tab instead of disappearing.
// Scans save finds up to this age. Nothing is deleted for being old.
const LEAD_ARCHIVE_DAYS = Math.max(LEAD_MAX_AGE_DAYS, parseInt(process.env.LEAD_ARCHIVE_DAYS || '30', 10) || 30);

const isRecent = (isoDate, days = LEAD_MAX_AGE_DAYS) => {
  if (!isoDate) return false;
  const time = new Date(isoDate).getTime();
  return !Number.isNaN(time) && Date.now() - time <= days * 86400000;
};

// Days since posting (null when unknown).
const ageInDays = (isoDate) => {
  if (!isoDate) return null;
  const time = new Date(isoDate).getTime();
  return Number.isNaN(time) ? null : (Date.now() - time) / 86400000;
};

module.exports = { LEAD_MAX_AGE_DAYS, LEAD_ARCHIVE_DAYS, isRecent, ageInDays };
