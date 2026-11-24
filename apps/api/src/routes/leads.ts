import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LEAD_MAX_AGE_DAYS, isRecent } = require('../config/recency');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkIcp } = require('../lib/icp');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const apollo = require('../lib/apollo');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { scoreLead } = require('../lib/leadScore');

// ICP check + explainable score, attached to every lead the API returns.
// leadScore is replaced by the explainable score so the dashboard sorts by it.
function withChecks(lead: any) {
  const icp = checkIcp(lead);
  const score = scoreLead(lead, icp);
  return { ...lead, icp, leadScore: score.score, scoreBreakdown: score.breakdown };
}

// Apollo credits are spent only when someone clicks Reveal (email / phone)
// or Get full profile and confirms; nothing else on the lead page costs credits.

// Workflow stages a lead moves through.
const STATUSES = ['new', 'contacted', 'replied', 'meeting', 'won', 'lost', 'not_relevant'];

// Append to the lead's activity log (newest last, capped).
function logActivity(signals: any, req: AuthRequest, type: string, detail: string) {
  const activity = Array.isArray(signals.activity) ? signals.activity : [];
  return [...activity, { type, detail, by: req.user?.email || 'Lead Engine user', at: new Date().toISOString() }].slice(-200);
}
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { searchNews } = require('../lib/freeSources');

const router = Router();

// Get all leads with pagination and filters (protected route)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    
    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const lob = req.query.lob as string;
    const minScore = req.query.minScore ? parseInt(req.query.minScore as string) : undefined;
    const maxScore = req.query.maxScore ? parseInt(req.query.maxScore as string) : undefined;
    const source = req.query.source as string;
    const search = req.query.search as string;
    // Only leads posted online within the recency window, unless includeOlder=true.
    const includeOlder = req.query.includeOlder === 'true';
    const recentDays = parseInt(req.query.recentDays as string) || LEAD_MAX_AGE_DAYS;
    // Only target regions (USA, UAE, Europe, India) or unknown location, unless includeOtherRegions=true.
    const includeOtherRegions = req.query.includeOtherRegions === 'true';
    // Leads clearly outside the ideal customer profile are hidden unless includeOutsideIcp=true.
    const includeOutsideIcp = req.query.includeOutsideIcp === 'true';

    // Build filter conditions
    const where: any = {};
    
    if (lob) {
      where.lob = { contains: lob, mode: 'insensitive' };
    }
    
    if (minScore !== undefined || maxScore !== undefined) {
      where.leadScore = {};
      if (minScore !== undefined) where.leadScore.gte = minScore;
      if (maxScore !== undefined) where.leadScore.lte = maxScore;
    }
    
    if (source) {
      where.source = { contains: source, mode: 'insensitive' };
    }
    
    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { industry: { contains: search, mode: 'insensitive' } },
        { hq: { contains: search, mode: 'insensitive' } },
      ];
    }

    // The posting date lives in the signals JSON, so recency is filtered here
    // and pagination applied afterwards (lead volumes are small).
    const matching = await prisma.lead.findMany({ where, orderBy: { leadScore: 'desc' } });
    const recent = includeOlder
      ? matching
      : matching.filter((lead: any) => isRecent(lead.signals?.postedAt, recentDays));
    const inRegion = includeOtherRegions ? recent : recent.filter((lead: any) => lead.signals?.geography !== 'Other');
    // Job postings found to be closed are no longer worth contacting.
    const open = includeOlder ? inRegion : inRegion.filter((lead: any) => lead.signals?.jobOpen !== false);
    // Validate every lead against the ICP before it is shown (always current,
    // so older leads are covered without a backfill).
    const checked = open.map(withChecks);
    const inIcp = includeOutsideIcp ? checked : checked.filter((lead: any) => lead.icp.status !== 'outside');
    // Leads the team marked "not relevant" are hidden unless includeNotRelevant=true.
    const includeNotRelevant = req.query.includeNotRelevant === 'true';
    const visible = (includeNotRelevant ? inIcp : inIcp.filter((lead: any) => lead.signals?.workflow?.status !== 'not_relevant')).sort(
      (a: any, b: any) => b.leadScore - a.leadScore
    );
    const total = visible.length;
    const leads = visible.slice((page - 1) * limit, page * limit);

    res.json({
      leads,
      recentDays: includeOlder ? null : recentDays,
      hiddenOlder: matching.length - recent.length,
      hiddenOtherRegions: recent.length - inRegion.length,
      hiddenClosed: inRegion.length - open.length,
      hiddenOutsideIcp: checked.length - inIcp.length,
      hiddenNotRelevant: inIcp.length - visible.length,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads', code: (error as any)?.code ?? (error as any)?.errorCode ?? (error as any)?.name });
  }
});

// Get single lead (protected route)
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const lead = await prisma.lead.findUnique({ 
      where: { id } 
    });

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({ lead: withChecks(lead) });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Failed to fetch lead', code: (error as any)?.code ?? (error as any)?.errorCode ?? (error as any)?.name });
  }
});

// Create lead (protected route)
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { companyName, industry, website, employees, revenue, hq, lob, outreachEmail } = req.body;

    if (!companyName) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const newLead = await prisma.lead.create({
      data: {
        companyName,
        industry,
        website,
        employees,
        revenue,
        hq,
        lob,
        outreachEmail,
        source: 'MANUAL',
        leadScore: 50,
      },
    });

    res.status(201).json({ lead: newLead });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// Update lead (protected route)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedLead = await prisma.lead.update({ 
      where: { id }, 
      data: updateData 
    });

    res.json({ lead: updatedLead });
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// Delete lead (protected route)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.lead.delete({ where: { id } });

    res.json({ message: 'Lead deleted successfully', id });
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// ---- Apollo contacts (only when a user asks; reveals cost Apollo credits) ----

const apolloSignals = (lead: any) => {
  const signals = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
  return { signals, saved: signals.apollo || {} };
};

// The company's website only when it was actually found (profile lookup,
// Apollo, or a free check), never lead.website, which is often a guess built
// from the company name.
const verifiedWebsite = (signals: any): string | null => signals.company?.website || signals.apollo?.company?.website || null;

// Save a newly confirmed domain as the company's website (and fix the guessed
// general inbox to match).
function withVerifiedDomain(lead: any, signals: any, domain: string | null | undefined, source: string) {
  if (!domain || verifiedWebsite(signals)) return { signals, data: {} as any };
  const website = `https://${domain}`;
  const nextSignals = { ...signals, company: { ...(signals.company || {}), website, websiteSource: source } };
  const data: any = { website };
  if (!lead.outreachEmail || /^contact@/i.test(lead.outreachEmail)) data.outreachEmail = `contact@${domain}`;
  return { signals: nextSignals, data };
}

// Bumped when the contact search changes, so leads searched the old way
// (e.g. on a guessed domain that found nobody) search again.
const CONTACT_SEARCH_VERSION = 2;

const apolloFailure = (res: Response, error: any) => {
  const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
  console.error('Apollo error:', error?.message);
  res.status(status).json({ error: error?.message || 'Apollo request failed' });
};

// Whether Apollo is set up on this API.
router.get('/apollo/status', authenticateToken, (_req: AuthRequest, res: Response) => {
  res.json({ configured: apollo.isConfigured(), contactSearchVersion: CONTACT_SEARCH_VERSION });
});

// Free: find ICP decision makers at the lead's company.
router.post('/:id/contacts/search', async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { signals, saved } = apolloSignals(lead);
    const result = await apollo.findDecisionMakers({ website: verifiedWebsite(signals), companyName: lead.companyName, lob: lead.lob });
    const nextApollo = {
      ...saved,
      candidates: result.candidates,
      matchedBy: result.matchedBy,
      searchedAt: new Date().toISOString(),
      searchVersion: CONTACT_SEARCH_VERSION,
    };
    const verified = withVerifiedDomain(lead, { ...signals, apollo: nextApollo }, result.domain, 'Confirmed through Apollo');
    const updated = await prisma.lead.update({ where: { id: lead.id }, data: { ...verified.data, signals: verified.signals } });
    res.json({ apollo: (updated.signals as any).apollo });
  } catch (error) {
    apolloFailure(res, error);
  }
});

// Signed token for Apollo's phone webhook, so only Apollo calls for our own
// leads can write phone numbers.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require('crypto');
const webhookToken = (leadId: string, personId: string) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET || 'lead-engine').update(`${leadId}:${personId}`).digest('hex').slice(0, 32);

// Public address of this API, for Apollo to send phone numbers back to.
function publicApiUrl(req: AuthRequest): string | null {
  if (process.env.APOLLO_WEBHOOK_BASE_URL) return process.env.APOLLO_WEBHOOK_BASE_URL.replace(/\/$/, '');
  const host = req.get('x-forwarded-host') || req.get('host') || '';
  if (!host || /localhost|127\.0\.0\.1/.test(host)) return null;
  return `https://${host}`;
}

// Reveal one person. type 'email': 1 credit when found. type 'phone': the
// email reveal plus phone numbers (extra credits when found), which Apollo
// delivers to /api/leads/apollo/phone-webhook a few seconds later.
router.post('/:id/contacts/reveal', async (req: AuthRequest, res: Response) => {
  try {
    const { personId, type = 'email' } = req.body || {};
    if (!/^[a-f0-9]{24}$/.test(personId || '')) return res.status(400).json({ error: 'personId is required' });
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { signals, saved } = apolloSignals(lead);
    const contacts: any[] = saved.contacts || [];
    const existing = contacts.find((c) => c.id === personId);
    if (existing && (type === 'email' || existing.phoneStatus === 'found' || existing.phoneStatus === 'pending')) {
      return res.json({ apollo: saved, alreadyRevealed: true });
    }

    let webhookUrl: string | undefined;
    if (type === 'phone') {
      const base = publicApiUrl(req);
      if (!base) {
        return res.status(400).json({ error: 'Phone numbers can only be revealed on the deployed app: Apollo sends them to a public web address.' });
      }
      webhookUrl = `${base}/api/leads/apollo/phone-webhook?lead=${lead.id}&person=${personId}&token=${webhookToken(lead.id, personId)}`;
    }
    const contact = await apollo.revealContact(personId, { webhookUrl });
    if (!contact) return res.status(404).json({ error: 'Apollo could not find this person (no credit used).' });
    const merged = existing ? { ...existing, ...contact, email: contact.email || existing.email } : contact;
    const nextApollo = { ...saved, contacts: existing ? contacts.map((c) => (c.id === personId ? merged : c)) : [...contacts, merged] };
    // A revealed person's employer domain confirms the company's website.
    const verified = withVerifiedDomain(lead, { ...signals, apollo: nextApollo }, contact.organizationDomain, 'From an Apollo contact');
    verified.signals.activity = logActivity(signals, req, 'reveal', `Revealed ${contact.name}'s ${type === 'phone' ? 'email and phone' : 'email'} in Apollo`);
    const data: any = { ...verified.data, signals: verified.signals };
    // The best revealed ICP contact becomes the lead's outreach email.
    const best = [...nextApollo.contacts].filter((c) => c.email).sort((a, b) => b.icpRank - a.icpRank)[0];
    if (best) data.outreachEmail = best.email;
    const updated = await prisma.lead.update({ where: { id: lead.id }, data });
    res.json({ apollo: (updated.signals as any).apollo });
  } catch (error) {
    apolloFailure(res, error);
  }
});

// Apollo calls this (no login) with a revealed person's phone numbers.
router.post('/apollo/phone-webhook', async (req: any, res: Response) => {
  try {
    const { lead: leadId, person: personId, token } = req.query || {};
    if (!leadId || !personId || token !== webhookToken(String(leadId), String(personId))) {
      return res.status(403).json({ error: 'Invalid webhook token' });
    }
    // Apollo's payload lists people with phone_numbers; find this person's.
    const people: any[] = [];
    const collect = (value: any) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) return value.forEach(collect);
      if (Array.isArray(value.phone_numbers)) people.push(value);
      Object.values(value).forEach((child) => typeof child === 'object' && collect(child));
    };
    collect(req.body);
    const person = people.find((p) => p.id === personId) || people[0];
    const phones = apollo.phonesFrom(person);

    const lead = await prisma.lead.findUnique({ where: { id: String(leadId) } });
    if (!lead) return res.json({ ok: true });
    const { signals, saved } = apolloSignals(lead);
    const contacts = (saved.contacts || []).map((c: any) =>
      c.id === personId
        ? { ...c, phones, phone: phones[0]?.number || c.phone, phoneIsCompany: phones.length ? false : c.phoneIsCompany, phoneStatus: phones.length ? 'found' : 'none' }
        : c
    );
    await prisma.lead.update({ where: { id: lead.id }, data: { signals: { ...signals, apollo: { ...saved, contacts } } } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Apollo phone webhook error:', (error as any)?.message);
    res.status(500).json({ error: 'Webhook failed' });
  }
});

// 1 credit: company revenue, headcount and founding year for the ICP check.
router.post('/:id/company/enrich', async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { signals, saved } = apolloSignals(lead);
    const website = verifiedWebsite(signals);
    if (!website) {
      return res.status(400).json({ error: 'The company’s website isn’t confirmed yet, so Apollo can’t look it up (no credit used).' });
    }
    const company = await apollo.enrichCompany(website);
    if (!company) return res.status(404).json({ error: 'Apollo has no record of this company (no credit used).' });
    const data: any = {
      signals: {
        ...signals,
        activity: logActivity(signals, req, 'enrich', 'Got the company profile from Apollo'),
        apollo: { ...saved, company },
        company: {
          ...(signals.company || {}),
          ...(company.founded ? { founded: company.founded } : {}),
          ...(company.linkedinUrl && !signals.company?.linkedinUrl ? { linkedinUrl: company.linkedinUrl } : {}),
        },
      },
    };
    if (company.revenue) data.revenue = company.revenue;
    if (company.employees) data.employees = company.employees;
    const updated = await prisma.lead.update({ where: { id: lead.id }, data });
    res.json({ lead: withChecks(updated) });
  } catch (error) {
    apolloFailure(res, error);
  }
});

// Free: the company's recent news from Google News (last 90 days), cached on
// the lead for a day so opening the page repeatedly costs nothing extra.
const NEWS_CACHE_HOURS = 24;
router.get('/:id/company/news', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const signals: any = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
    if (signals.leadType === 'linkedin_post') return res.json({ items: [], skipped: 'Company not identified' });
    const cached = signals.companyNews;
    if (cached?.fetchedAt && Date.now() - new Date(cached.fetchedAt).getTime() < NEWS_CACHE_HOURS * 3600000) {
      return res.json(cached);
    }
    const name = lead.companyName.replace(/,?\s+(inc|llc|ltd|corp|corporation|co)\.?$/i, '').trim();
    const results = await searchNews(`"${name}"`, { days: 90, max: 20 });
    // Keep headlines that actually name the company, newest first, no duplicates.
    const key = name.toLowerCase();
    const seen = new Set<string>();
    const items = results
      .filter((item: any) => item.title && item.title.toLowerCase().includes(key))
      .filter((item: any) => (seen.has(item.title) ? false : (seen.add(item.title), true)))
      .sort((a: any, b: any) => new Date(b.published_date || 0).getTime() - new Date(a.published_date || 0).getTime())
      .slice(0, 6)
      .map((item: any) => ({ title: item.title, url: item.url, publisher: item.publisher, date: item.published_date }));
    const companyNews = { items, fetchedAt: new Date().toISOString() };
    await prisma.lead.update({ where: { id: lead.id }, data: { signals: { ...signals, companyNews } } });
    res.json(companyNews);
  } catch (error) {
    console.error('Company news failed:', (error as any)?.message);
    res.status(502).json({ error: 'Could not load company news right now' });
  }
});

// ---- workflow: status, owner, next action, notes, activity ----

// Update the lead's workflow. Every change is written to the activity log.
router.patch('/:id/workflow', async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const signals: any = lead.signals && typeof lead.signals === 'object' ? lead.signals : {};
    const workflow = { status: 'new', ...(signals.workflow || {}) };
    const body = req.body || {};
    const entries: [string, string][] = [];

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
      if (body.status === 'not_relevant' && !String(body.notRelevantReason || '').trim()) {
        return res.status(400).json({ error: 'Say why the lead is not relevant' });
      }
      if (body.status !== workflow.status) {
        entries.push(['status', `Status: ${workflow.status.replace('_', ' ')} → ${body.status.replace('_', ' ')}${body.status === 'not_relevant' ? ` (${String(body.notRelevantReason).trim()})` : ''}`]);
      }
      workflow.status = body.status;
      workflow.notRelevantReason = body.status === 'not_relevant' ? String(body.notRelevantReason).trim() : null;
    }
    if (body.owner !== undefined) {
      const owner = String(body.owner || '').trim() || null;
      if (owner !== (workflow.owner || null)) entries.push(['owner', owner ? `Assigned to ${owner}` : 'Unassigned']);
      workflow.owner = owner;
    }
    if (body.nextAction !== undefined || body.nextActionDue !== undefined) {
      const nextAction = body.nextAction !== undefined ? String(body.nextAction || '').trim() || null : workflow.nextAction || null;
      const nextActionDue = body.nextActionDue !== undefined ? body.nextActionDue || null : workflow.nextActionDue || null;
      if (nextAction !== (workflow.nextAction || null) || nextActionDue !== (workflow.nextActionDue || null)) {
        entries.push(['next_action', nextAction ? `Next action: ${nextAction}${nextActionDue ? ` (due ${nextActionDue})` : ''}` : 'Next action cleared']);
      }
      workflow.nextAction = nextAction;
      workflow.nextActionDue = nextActionDue;
    }
    if (body.rfp !== undefined && typeof body.rfp === 'object') {
      signals.rfp = { ...(signals.rfp || {}), ...body.rfp };
      entries.push(['rfp', 'Updated the RFP checklist']);
    }
    if (body.note !== undefined && String(body.note).trim()) entries.push(['note', String(body.note).trim().slice(0, 2000)]);
    if (!entries.length) return res.json({ lead: withChecks(lead) });

    let activity = signals.activity;
    for (const [type, detail] of entries) activity = logActivity({ activity }, req, type, detail);
    workflow.updatedAt = new Date().toISOString();
    const updated = await prisma.lead.update({ where: { id: lead.id }, data: { signals: { ...signals, workflow, activity } } });
    res.json({ lead: withChecks(updated) });
  } catch (error) {
    console.error('Workflow update failed:', error);
    res.status(500).json({ error: 'Failed to update the lead' });
  }
});

// Team members, to assign leads to.
router.get('/team/members', authenticateToken, async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({ select: { email: true }, orderBy: { email: 'asc' } });
  res.json({ members: users.map((u) => u.email) });
});

// ---- Apollo sequences ----

// The team's sequences and sending mailboxes. Free.
router.get('/apollo/sequences', authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await apollo.listSequencesAndMailboxes());
  } catch (error) {
    apolloFailure(res, error);
  }
});

// Add a revealed contact to an Apollo sequence. Apollo then sends that
// sequence's emails from the chosen mailbox, so the page confirms first.
router.post('/:id/contacts/sequence', async (req: AuthRequest, res: Response) => {
  try {
    const { personId, sequenceId, sequenceName, mailboxId } = req.body || {};
    if (!personId || !sequenceId || !mailboxId) return res.status(400).json({ error: 'personId, sequenceId and mailboxId are required' });
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { signals, saved } = apolloSignals(lead);
    const contact = (saved.contacts || []).find((c: any) => c.id === personId);
    if (!contact?.email) return res.status(400).json({ error: 'Reveal this person’s email first.' });
    if (contact.sequence?.id === sequenceId) return res.json({ lead: withChecks(lead), alreadyAdded: true });

    const apolloContactId = await apollo.addContactToSequence({ contact, companyName: lead.companyName, sequenceId, mailboxId });
    const contacts = saved.contacts.map((c: any) =>
      c.id === personId ? { ...c, apolloContactId, sequence: { id: sequenceId, name: sequenceName || null, addedAt: new Date().toISOString() } } : c
    );
    const workflow = { status: 'new', ...(signals.workflow || {}) };
    if (workflow.status === 'new') workflow.status = 'contacted';
    const activity = logActivity(signals, req, 'sequence', `Added ${contact.name} to the Apollo sequence "${sequenceName || sequenceId}"`);
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: { signals: { ...signals, workflow, activity, apollo: { ...saved, contacts } } },
    });
    res.json({ lead: withChecks(updated) });
  } catch (error) {
    apolloFailure(res, error);
  }
});

export default router;
