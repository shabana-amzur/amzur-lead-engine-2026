import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LEAD_MAX_AGE_DAYS, isRecent } = require('../config/recency');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkIcp } = require('../lib/icp');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const apollo = require('../lib/apollo');

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
    const checked = open.map((lead: any) => ({ ...lead, icp: checkIcp(lead) }));
    const visible = includeOutsideIcp ? checked : checked.filter((lead: any) => lead.icp.status !== 'outside');
    const total = visible.length;
    const leads = visible.slice((page - 1) * limit, page * limit);

    res.json({
      leads,
      recentDays: includeOlder ? null : recentDays,
      hiddenOlder: matching.length - recent.length,
      hiddenOtherRegions: recent.length - inRegion.length,
      hiddenClosed: inRegion.length - open.length,
      hiddenOutsideIcp: checked.length - visible.length,
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

    res.json({ lead: { ...lead, icp: checkIcp(lead) } });
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

const apolloFailure = (res: Response, error: any) => {
  const status = error?.status && error.status >= 400 && error.status < 600 ? error.status : 500;
  console.error('Apollo error:', error?.message);
  res.status(status).json({ error: error?.message || 'Apollo request failed' });
};

// Whether Apollo is set up on this API.
router.get('/apollo/status', authenticateToken, (_req: AuthRequest, res: Response) => {
  res.json({ configured: apollo.isConfigured() });
});

// Free: find ICP decision makers at the lead's company.
router.post('/:id/contacts/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { signals, saved } = apolloSignals(lead);
    const website = signals.company?.website || lead.website;
    const result = await apollo.findDecisionMakers({ website, companyName: lead.companyName, lob: lead.lob });
    const nextApollo = { ...saved, candidates: result.candidates, matchedBy: result.matchedBy, searchedAt: new Date().toISOString() };
    const updated = await prisma.lead.update({ where: { id: lead.id }, data: { signals: { ...signals, apollo: nextApollo } } });
    res.json({ apollo: (updated.signals as any).apollo });
  } catch (error) {
    apolloFailure(res, error);
  }
});

// 1 credit: reveal one person's email and profile. Already revealed people are
// returned from the lead without calling Apollo again.
router.post('/:id/contacts/reveal', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { personId } = req.body || {};
    if (!/^[a-f0-9]{24}$/.test(personId || '')) return res.status(400).json({ error: 'personId is required' });
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { signals, saved } = apolloSignals(lead);
    const contacts: any[] = saved.contacts || [];
    if (contacts.some((c) => c.id === personId)) return res.json({ apollo: saved, alreadyRevealed: true });

    const contact = await apollo.revealContact(personId);
    if (!contact) return res.status(404).json({ error: 'Apollo could not find this person (no credit used).' });
    const nextApollo = { ...saved, contacts: [...contacts, contact] };
    const data: any = { signals: { ...signals, apollo: nextApollo } };
    // The best revealed ICP contact becomes the lead's outreach email.
    const best = [...nextApollo.contacts].filter((c) => c.email).sort((a, b) => b.icpRank - a.icpRank)[0];
    if (best) data.outreachEmail = best.email;
    const updated = await prisma.lead.update({ where: { id: lead.id }, data });
    res.json({ apollo: (updated.signals as any).apollo });
  } catch (error) {
    apolloFailure(res, error);
  }
});

// 1 credit: company revenue, headcount and founding year for the ICP check.
router.post('/:id/company/enrich', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const { signals, saved } = apolloSignals(lead);
    const company = await apollo.enrichCompany(signals.company?.website || lead.website);
    if (!company) return res.status(404).json({ error: 'Apollo has no record of this company (no credit used).' });
    const data: any = {
      signals: {
        ...signals,
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
    res.json({ lead: { ...updated, icp: checkIcp(updated) } });
  } catch (error) {
    apolloFailure(res, error);
  }
});

export default router;
