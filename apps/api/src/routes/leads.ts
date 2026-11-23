import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth';

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

    // Get total count for pagination
    const total = await prisma.lead.count({ where });
    
    // Fetch leads with pagination
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { leadScore: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json({
      leads,
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

    res.json({ lead });
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

export default router;
