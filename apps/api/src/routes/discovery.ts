import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();

// Lead scans spend paid web-search credits (Tavily / Serper / You.com), so
// per calendar day there is ONE full scan (the first dashboard visit of the
// day) and ONE LinkedIn-only refresh, at least LINKEDIN_REFRESH_HOURS
// (default 12) after the full scan, so fresh LinkedIn posts are caught the
// same day. Any other visit, Refresh Results or /run just reloads the saved
// leads. The day follows SCAN_TIMEZONE (default Asia/Kolkata). Set
// ALLOW_EXTRA_SCANS=true to lift the limit.
const SCAN_TIMEZONE = process.env.SCAN_TIMEZONE || 'Asia/Kolkata';
const ALLOW_EXTRA_SCANS = process.env.ALLOW_EXTRA_SCANS === 'true';
const LINKEDIN_REFRESH_HOURS = Math.max(1, parseInt(process.env.LINKEDIN_REFRESH_HOURS || '12', 10) || 12);
// A scan that started this recently and hasn't completed is assumed to still be running.
const IN_PROGRESS_WINDOW_MINUTES = 5;

// Calendar day (YYYY-MM-DD) of a moment in the scan timezone.
const scanDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SCAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

/**
 * Whether a scan may run now, and which: 'full' (first of the day) or
 * 'linkedin' (the afternoon LinkedIn refresh). Scans count once completed, or
 * while they may still be running; one that crashed part-way doesn't count.
 */
async function dailyScanGate(): Promise<
  { allowed: true; mode: 'full' | 'linkedin' } | { allowed: false; status: string; lastScanAt: Date }
> {
  const latest = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } });
  if (!latest) return { allowed: true, mode: 'full' };
  const minutesSinceStart = (Date.now() - new Date(latest.startedAt).getTime()) / 60000;
  if (!latest.completedAt && minutesSinceStart < IN_PROGRESS_WINDOW_MINUTES) {
    return { allowed: false, status: 'in_progress', lastScanAt: latest.startedAt };
  }
  if (ALLOW_EXTRA_SCANS) return { allowed: true, mode: 'full' };

  const recent = await prisma.scanRun.findMany({
    where: { completedAt: { not: null }, startedAt: { gte: new Date(Date.now() - 36 * 3600000) } },
    orderBy: { startedAt: 'desc' },
  });
  const today = scanDay(new Date());
  const todays = recent.filter((scan) => scanDay(scan.startedAt) === today);
  const modeOf = (scan: any) => (scan.sources && scan.sources.__mode === 'linkedin' ? 'linkedin' : 'full');
  const fullToday = todays.find((scan) => modeOf(scan) === 'full');
  if (!fullToday) return { allowed: true, mode: 'full' };

  const linkedinToday = todays.some((scan) => modeOf(scan) === 'linkedin');
  const hoursSinceLast = (Date.now() - new Date(todays[0].startedAt).getTime()) / 3600000;
  if (!linkedinToday && hoursSinceLast >= LINKEDIN_REFRESH_HOURS) return { allowed: true, mode: 'linkedin' };

  return { allowed: false, status: 'skipped', lastScanAt: todays[0].startedAt };
}

const skippedResponse = (gate: any) => ({
  status: gate.status,
  newLeadsFound: 0,
  lastScanAt: gate.lastScanAt,
  dailyLimit: true,
  timezone: SCAN_TIMEZONE,
});

// Trigger a lead discovery scan (protected route). Subject to the daily limit.
router.post('/run', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const gate = await dailyScanGate();
    if (!gate.allowed) return res.json({ message: 'Leads were already refreshed today', ...skippedResponse(gate) });
    console.log('🚀 Manual lead discovery triggered by:', req.user?.email);

    const { discoverLeads } = await import('../services/discoveryEngine.js');
    // Run to completion before responding: on Vercel, work left running
    // after the response is sent gets frozen and never finishes.
    const summary = await discoverLeads({ mode: gate.mode });
    console.log('Discovery completed:', summary);

    res.json({
      message: 'Lead discovery scan completed',
      status: 'completed',
      summary,
    });
  } catch (error) {
    console.error('Error starting discovery:', error);
    res.status(500).json({ error: 'Failed to start lead discovery' });
  }
});

// Dashboard refresh: the first visit of the day scans; after that it only
// reports today's scan. Public route (the dashboard has no login).
router.post('/refresh', async (req, res: Response) => {
  try {
    const gate = await dailyScanGate();
    if (!gate.allowed) return res.json(skippedResponse(gate));

    console.log(`🔄 Lead discovery (${gate.mode === 'linkedin' ? 'afternoon LinkedIn refresh' : 'daily scan'})`);
    const { discoverLeads } = await import('../services/discoveryEngine.js');
    const summary = await discoverLeads({ mode: gate.mode });
    if (summary.searchUnavailable) {
      return res.json({ status: 'search_unavailable', newLeadsFound: 0, error: summary.searchUnavailable, summary });
    }
    res.json({
      status: 'completed',
      mode: gate.mode,
      newLeadsFound: summary.newLeadsFound,
      webSearchUnavailable: summary.webSearchUnavailable || null,
      summary,
    });
  } catch (error) {
    console.error('Refresh discovery failed:', error);
    res.status(500).json({
      error: 'Failed to check for new leads',
      code: (error as any)?.code ?? (error as any)?.errorCode ?? (error as any)?.name,
    });
  }
});

// Get discovery scan history (protected route)
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const total = await prisma.scanRun.count();
    
    const scans = await prisma.scanRun.findMany({
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json({ 
      scans,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.error('Error fetching scans:', error);
    res.status(500).json({ error: 'Failed to fetch scan history', code: (error as any)?.code ?? (error as any)?.errorCode ?? (error as any)?.name });
  }
});

// Get latest scan details
router.get('/latest', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    
    const latestScan = await prisma.scanRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });

    if (!latestScan) {
      return res.status(404).json({ error: 'No scans found' });
    }

    res.json({ scan: latestScan });
  } catch (error) {
    console.error('Error fetching latest scan:', error);
    res.status(500).json({ error: 'Failed to fetch latest scan', code: (error as any)?.code ?? (error as any)?.errorCode ?? (error as any)?.name });
  }
});

// Get scan by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const scan = await prisma.scanRun.findUnique({
      where: { id },
    });

    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json({ scan });
  } catch (error) {
    console.error('Error fetching scan:', error);
    res.status(500).json({ error: 'Failed to fetch scan', code: (error as any)?.code ?? (error as any)?.errorCode ?? (error as any)?.name });
  }
});

export default router;
