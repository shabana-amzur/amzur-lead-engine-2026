import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();

// Trigger manual lead discovery scan (protected route)
router.post('/run', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    console.log('🚀 Manual lead discovery triggered by:', req.user?.email);
    
    // Dynamically import the discovery service
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

// Dashboard refresh: scan for new leads on every refresh (the dashboard has
// no login, so this route is public). Each scan costs Tavily credits; set
// SCAN_COOLDOWN_MINUTES to skip scans when one ran recently. Default 0 = always scan.
const REFRESH_COOLDOWN_MINUTES = parseInt(process.env.SCAN_COOLDOWN_MINUTES || '0', 10);
// A scan that started this recently and hasn't completed is assumed to still be running.
const IN_PROGRESS_WINDOW_MINUTES = 5;

router.post('/refresh', async (req, res: Response) => {
  try {
    const latest = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } });

    if (latest) {
      const minutesSinceStart = (Date.now() - new Date(latest.startedAt).getTime()) / 60000;

      if (!latest.completedAt && minutesSinceStart < IN_PROGRESS_WINDOW_MINUTES) {
        return res.json({ status: 'in_progress', newLeadsFound: 0 });
      }

      if (REFRESH_COOLDOWN_MINUTES > 0 && latest.completedAt && minutesSinceStart < REFRESH_COOLDOWN_MINUTES) {
        const nextScanAt = new Date(
          new Date(latest.startedAt).getTime() + REFRESH_COOLDOWN_MINUTES * 60000
        );
        return res.json({
          status: 'skipped',
          newLeadsFound: 0,
          lastScanAt: latest.startedAt,
          nextScanAt,
        });
      }
    }

    console.log('🔄 Dashboard refresh triggered lead discovery');
    const { discoverLeads } = await import('../services/discoveryEngine.js');
    const summary = await discoverLeads();
    if (summary.searchUnavailable) {
      return res.json({ status: 'search_unavailable', newLeadsFound: 0, error: summary.searchUnavailable, summary });
    }
    res.json({ status: 'completed', newLeadsFound: summary.newLeadsFound, summary });
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
