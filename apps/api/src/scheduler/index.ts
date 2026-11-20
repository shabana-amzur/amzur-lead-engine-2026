import cron from 'node-cron';

/**
 * Lead Discovery Scheduler
 * Runs daily at 6:00 AM UTC to discover new leads
 */
export const startScheduler = () => {
  // Run every day at 6:00 AM UTC
  cron.schedule('0 6 * * *', async () => {
    console.log('🔍 Running scheduled lead discovery at 6:00 AM UTC...');
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    
    try {
      const { discoverLeads } = await import('../services/discoveryEngine.js');
      const summary = await discoverLeads();
      
      console.log('\n✅ Scheduled discovery completed successfully!');
      console.log('📊 Summary:');
      console.log(`   - Scan Run ID: ${summary.scanRunId}`);
      console.log(`   - Companies Scanned: ${summary.companiesScanned}`);
      console.log(`   - New Leads Found: ${summary.newLeadsFound}`);
      console.log(`   - Duration: ${Math.round(summary.duration / 1000)}s`);
      console.log(`   - Sources: ${JSON.stringify(summary.sources, null, 2)}`);
      console.log(`⏰ Completed at: ${new Date().toISOString()}\n`);
    } catch (error: any) {
      console.error('❌ Scheduled discovery failed:', error.message);
      console.error('Stack trace:', error.stack);
    }
  });

  console.log('⏰ Scheduler started - Lead discovery will run daily at 6:00 AM UTC');
  console.log(`📅 Current time: ${new Date().toISOString()}`);
};
