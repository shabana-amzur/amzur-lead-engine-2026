// Only leads whose source was posted within this many days are kept and shown.
// Set LEAD_MAX_AGE_DAYS on the API to change it (default 20). Job postings are
// also re-checked and hidden once closed (see lib/jobStatus.js).
const LEAD_MAX_AGE_DAYS = Math.max(1, parseInt(process.env.LEAD_MAX_AGE_DAYS || '20', 10) || 20);

const isRecent = (isoDate, days = LEAD_MAX_AGE_DAYS) => {
  if (!isoDate) return false;
  const time = new Date(isoDate).getTime();
  return !Number.isNaN(time) && Date.now() - time <= days * 86400000;
};

module.exports = { LEAD_MAX_AGE_DAYS, isRecent };
