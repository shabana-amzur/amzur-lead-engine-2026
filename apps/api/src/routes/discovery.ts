import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();

// Lead scans spend paid web-search credits (Tavily / Serper / You.com), so
// they run at most ONCE PER CALENDAR DAY, whatever triggers them: the first
// dashboard visit of the day runs it; later visits, the Refresh Results button
// and /run just reload the saved leads. The day follows SCAN_TIMEZONE
// (default Asia/Kolkata). Set ALLOW_EXTRA_SCANS=true to lift the limit.
const SCAN_TIMEZONE = process.env.SCAN_TIMEZONE || 'Asia/Kolkata';
const ALLOW_EXTRA_SCANS = process.env.ALLOW_EXTRA_SCANS === 'true';
// A scan that started this recently and hasn't completed is assumed to still be running.
const IN_PROGRESS_WINDOW_MINUTES = 5;

// Calendar day (YYYY-MM-DD) of a moment in the scan timezone.
const scanDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SCAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

/**
 * Whether a scan may run now. Today's scan counts once it completed, or while
 * it may still be running; one that crashed part-way doesn't use up the day.
 */
async function dailyScanGate() {
  const latest = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } });
  if (!latest) return { allowed: true as const };
  const minutesSinceStart = (Date.now() - new Date(latest.startedAt).getTime()) / 60000;
  if (!latest.completedAt && minutesSinceStart < IN_PROGRESS_WINDOW_MINUTES) {
    return { allowed: false as const, status: 'in_progress', lastScanAt: latest.startedAt };
  }
  if (ALLOW_EXTRA_SCANS) return { allowed: true as const };
  const ranToday = await prisma.scanRun.findFirst({
    where: { completedAt: { not: null }, startedAt: { gte: new Date(Date.now() - 36 * 3600000) } },
    orderBy: { startedAt: 'desc' },
  });
  if (ranToday && scanDay(ranToday.startedAt) === scanDay(new Date())) {
    return { allowed: false as const, status: 'skipped', lastScanAt: ranToday.startedAt };
  }
  return { allowed: true as const };
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
    const summary = await discoverLeads();
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

    console.log('🔄 Daily lead discovery scan');
    const { discoverLeads } = await import('../services/discoveryEngine.js');
    const summary = await discoverLeads();
    if (summary.searchUnavailable) {
      return res.json({ status: 'search_unavailable', newLeadsFound: 0, error: summary.searchUnavailable, summary });
    }
    res.json({
      status: 'completed',
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
