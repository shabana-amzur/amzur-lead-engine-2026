# Amzur Lead Engine

A full-stack lead discovery platform built with Next.js, Express, and PostgreSQL.

## Project Structure

```
amzur-lead-engine/
├── apps/
│   ├── web/          # Next.js 14 frontend (App Router)
│   └── api/          # Express backend (port 3001)
├── packages/
│   └── db/           # Prisma schema and database utilities
└── turbo.json        # Turborepo configuration
```

## Tech Stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS
- **Backend**: Node.js, Express
- **Database**: PostgreSQL with Prisma ORM
- **Scheduler**: node-cron for daily lead discovery
- **Auth**: JWT-based admin login
- **Monorepo**: Turborepo

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
```

3. Configure your database connection in `packages/db/.env`

4. Run database migrations:
```bash
npm run db:push
```

5. Start development servers:
```bash
npm run dev
```

The frontend will be available at http://localhost:3000
The backend API will be available at http://localhost:3001

## Available Scripts

- `npm run dev` - Start all apps in development mode
- `npm run build` - Build all apps for production
- `npm run start` - Start all apps in production mode
- `npm run lint` - Lint all apps
- `npm run db:push` - Push database schema changes
- `npm run db:generate` - Generate Prisma client

## Default Admin Credentials

Username: `admin`
Password: `admin123` (change this in production!)

## License

MIT
