const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.env.VERCEL_ENV !== 'production') {
  process.exit(0);
}

const repositoryRoot = path.resolve(__dirname, '../../..');
const prismaCli = path.join(repositoryRoot, 'node_modules', '.bin', 'prisma');
const schemaPath = path.join(repositoryRoot, 'packages', 'db', 'prisma', 'schema.prisma');
const result = spawnSync(
  process.execPath,
  [prismaCli, 'migrate', 'deploy', '--schema', schemaPath],
  { cwd: repositoryRoot, stdio: 'inherit' }
);

if (result.error) {
  console.error('Failed to start Prisma migrations:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);