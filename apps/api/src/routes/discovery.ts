import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();

// Trigger manual lead discovery scan (protected route)
router.post('/run', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    console.log('🚀 Manual lead discovery triggered by:', req.user?.email);
    
    // Dynamically import the discovery service
    const { discoverLeads } = await import('../services/discoveryEngine.js');
    
    // Run discovery in background
    discoverLeads()
      .then((summary: any) => {
        console.log('Discovery completed:', summary);
      })
      .catch((error: any) => {
        console.error('Discovery error:', error);
      });

    res.json({ 
      message: 'Lead discovery scan started',
      status: 'running'
    });
  } catch (error) {
    console.error('Error starting discovery:', error);
    res.status(500).json({ error: 'Failed to start lead discovery' });
  }
});

// Get discovery scan history (protected route)
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { default: prisma } = await import('@amzur/db');
    
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
    const { default: prisma } = await import('@amzur/db');
    
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
    const { default: prisma } = await import('@amzur/db');
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
