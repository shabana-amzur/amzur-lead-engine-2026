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

// Daily scheduled scan, called by Vercel Cron (see vercel.json).
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; refuse anything else so
// the public can't trigger scans. Must stay above the '/:id' route.
router.get('/cron', async (req, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('⏰ Scheduled lead discovery triggered by Vercel Cron');
    const { discoverLeads } = await import('../services/discoveryEngine.js');
    const summary = await discoverLeads();
    console.log('Scheduled discovery completed:', summary);
    res.json({ status: 'completed', summary });
  } catch (error) {
    console.error('Scheduled discovery failed:', error);
    res.status(500).json({ error: 'Scheduled discovery failed' });
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
    res.status(500).json({ error: 'Failed to fetch scan history' });
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
    res.status(500).json({ error: 'Failed to fetch latest scan' });
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
    res.status(500).json({ error: 'Failed to fetch scan' });
  }
});

export default router;
