const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.env.VERCEL_ENV !== 'production') {
  process.exit(0);
}

const repositoryRoot = path.resolve(__dirname, '../../..');
const prismaCli = path.join(repositoryRoot, 'node_modules', '.bin', 'prisma');
const schemaPath = path.join(repositoryRoot, 'packages', 'db', 'prisma', 'schema.prisma');

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCli, ...args, '--schema', schemaPath], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error('Failed to start Prisma command:', result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runPrisma(['generate']);

if (process.env.VERCEL_ENV === 'production') {
  runPrisma(['migrate', 'deploy']);
  const seed = spawnSync(process.execPath, [path.join(__dirname, 'seed-admin.js')], {
    cwd: path.join(repositoryRoot, 'apps', 'api'),
    stdio: 'inherit',
  });

  if (seed.error) {
    console.error('Failed to start admin seed:', seed.error);
    process.exit(1);
  }

  if (seed.status !== 0) {
    process.exit(seed.status ?? 1);
  }

  // Data cleanups. Non-fatal: a failure here shouldn't block the deploy.
  for (const script of ['dedupe-leads.js', 'remove-staffing-leads.js', 'remove-non-buyer-leads.js']) {
    const cleanup = spawnSync(process.execPath, [path.join(__dirname, script)], {
      cwd: path.join(repositoryRoot, 'apps', 'api'),
      stdio: 'inherit',
    });

    if (cleanup.error || cleanup.status !== 0) {
      console.warn(`${script} did not complete; continuing deploy.`);
    }
  }

  process.exit(0);
}