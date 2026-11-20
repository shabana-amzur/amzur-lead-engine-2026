# Database Setup Guide

## Prerequisites

1. **Install PostgreSQL** (if not already installed):
   - macOS: `brew install postgresql@14`
   - Ubuntu: `sudo apt-get install postgresql postgresql-contrib`
   - Or use Docker: `docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres`

2. **Start PostgreSQL**:
   - macOS (Homebrew): `brew services start postgresql@14`
   - Ubuntu: `sudo systemctl start postgresql`
   - Docker: Container starts automatically

## Database Setup

### Option 1: Quick Setup (Using default postgres user)

1. Create the database:
   ```bash
   createdb amzur_leads
   ```
   Or using psql:
   ```bash
   psql -U postgres
   CREATE DATABASE amzur_leads;
   \q
   ```

2. Update `.env` file in `packages/db/`:
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/amzur_leads
   ```

3. Push the schema to the database:
   ```bash
   cd packages/db
   npm run db:push
   ```

4. Seed the database with initial data:
   ```bash
   npm run db:seed
   ```

### Option 2: Custom Database User

1. Create a PostgreSQL user and database:
   ```bash
   psql -U postgres
   CREATE USER amzur_user WITH PASSWORD 'your_password';
   CREATE DATABASE amzur_leads OWNER amzur_user;
   GRANT ALL PRIVILEGES ON DATABASE amzur_leads TO amzur_user;
   \q
   ```

2. Update `.env` file:
   ```
   DATABASE_URL=postgresql://amzur_user:your_password@localhost:5432/amzur_leads
   ```

3. Push schema and seed:
   ```bash
   npm run db:push && npm run db:seed
   ```

## Useful Commands

- `npm run db:push` - Push schema changes to database (development)
- `npm run db:migrate` - Create and run migrations (production)
- `npm run db:generate` - Regenerate Prisma Client
- `npm run db:studio` - Open Prisma Studio (database GUI)
- `npm run db:seed` - Seed database with sample data

## Default Credentials

After seeding, you can log in with:
- **Username**: admin
- **Password**: admin123

## Troubleshooting

### Connection refused error
- Ensure PostgreSQL is running: `brew services list` or `sudo systemctl status postgresql`
- Check if port 5432 is in use: `lsof -i :5432`

### Authentication failed
- Verify your DATABASE_URL credentials
- Check PostgreSQL authentication config: `pg_hba.conf`

### Database doesn't exist
- Create it manually: `createdb amzur_leads`
