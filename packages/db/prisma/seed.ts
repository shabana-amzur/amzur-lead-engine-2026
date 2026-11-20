import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@amzur.com' },
    update: {},
    create: {
      email: 'admin@amzur.com',
      passwordHash: hashedPassword,
    },
  });

  console.log('✅ Admin user created:', { id: admin.id, email: admin.email });

  // Create sample leads
  const sampleLeads = [
    {
      companyName: 'Tech Innovators Inc',
      industry: 'Technology',
      website: 'https://techinnovators.com',
      employees: 250,
      revenue: 15000000,
      hq: 'San Francisco, CA',
      lob: 'Cloud Infrastructure',
      intentSignal: 'Recent funding round',
      recommendedService: 'Cloud Migration',
      leadScore: 85,
      source: 'LinkedIn',
      outreachEmail: 'info@techinnovators.com',
      signals: {
        fundingStage: 'Series B',
        recentHiring: true,
        techStack: ['AWS', 'Kubernetes']
      }
    },
    {
      companyName: 'Digital Solutions LLC',
      industry: 'Digital Marketing',
      website: 'https://digitalsolutions.com',
      employees: 50,
      revenue: 3000000,
      hq: 'Austin, TX',
      lob: 'Marketing Automation',
      intentSignal: 'Job posting for DevOps Engineer',
      recommendedService: 'CI/CD Implementation',
      leadScore: 70,
      source: 'Indeed',
      outreachEmail: 'contact@digitalsolutions.com',
      signals: {
        jobPostings: ['DevOps', 'Backend Developer'],
        expansion: true
      }
    },
    {
      companyName: 'Future Systems Corp',
      industry: 'Fintech',
      website: 'https://futuresystems.com',
      employees: 500,
      revenue: 50000000,
      hq: 'New York, NY',
      lob: 'Payment Processing',
      intentSignal: 'Attending AWS Summit',
      recommendedService: 'Security Audit',
      leadScore: 95,
      source: 'Conference',
      outreachEmail: 'business@futuresystems.com',
      signals: {
        eventAttendance: ['AWS Summit', 'FinTech Conference'],
        compliance: ['PCI-DSS', 'SOC2']
      }
    },
  ];

  for (const leadData of sampleLeads) {
    const lead = await prisma.lead.create({
      data: leadData,
    });
    console.log(`✅ Created lead: ${lead.companyName}`);
  }

  // Create a sample scan run
  const scanRun = await prisma.scanRun.create({
    data: {
      companiesScanned: 1500,
      newLeadsFound: 3,
      completedAt: new Date(),
      sources: {
        linkedin: 800,
        indeed: 400,
        conferences: 300
      }
    }
  });

  console.log(`✅ Created scan run: ${scanRun.id}`);
  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
