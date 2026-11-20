# Lead Discovery Service - API Reference

## Overview
The discovery engine searches for potential leads using Tavily, enriches data with Apollo, scores with OpenAI, and saves to PostgreSQL.

## Service Location
`/apps/api/src/services/discoveryEngine.js`

## How It Works

### 1. **Tavily Search** 
Searches for companies with these queries:
- "companies hiring cloud engineers site:linkedin.com"
- "companies announcing ERP modernization 2026"
- "AI workflow automation RFP tender 2026"
- "companies received Series B funding technology 2026"

### 2. **Apollo Enrichment**
For each company found, fetches:
- Employee count
- Revenue estimate
- Industry classification
- Tech stack
- Headquarters location

### 3. **OpenAI Scoring**
Uses GPT-4o to analyze and score (1-100) based on:
- Hiring signals (cloud/DevOps roles)
- Funding and growth
- Tech stack compatibility
- Procurement activity

Returns:
- Lead score
- Line of business (LOB)
- Recommended service
- Intent signal
- Why this is a good lead
- Suggested outreach email

### 4. **Deduplication & Storage**
- Checks existing leads by domain
- Only saves leads with score ≥ 60
- Creates ScanRun record with summary

## API Endpoints

### `POST /api/discovery/discover` (Protected)
Manually trigger lead discovery.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "message": "Lead discovery started",
  "status": "running"
}
```

### `GET /api/discovery/scans` (Protected)
Get discovery scan history (last 20 runs).

**Response:**
```json
{
  "scans": [
    {
      "id": "...",
      "startedAt": "2026-06-10T09:00:00Z",
      "completedAt": "2026-06-10T09:15:00Z",
      "companiesScanned": 150,
      "newLeadsFound": 12,
      "sources": {
        "companies hiring cloud engineers": 40,
        "ERP modernization": 35,
        ...
      }
    }
  ]
}
```

### `GET /api/discovery/scans/latest` (Protected)
Get the most recent scan details.

## Scheduled Execution
Automatically runs daily at **9:00 AM** via node-cron scheduler.

## Environment Variables Required
```env
TAVILY_API_KEY=tvly-...
APOLLO_API_KEY=...
OPENAI_API_KEY=sk-proj-...
DATABASE_URL=postgresql://...
```

## Testing

### Manual Trigger
```bash
# Login first
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Trigger discovery
curl -X POST http://localhost:3001/api/discovery/discover \
  -H "Authorization: Bearer <your_token>"
```

### Check Results
```bash
# View scan history
curl http://localhost:3001/api/discovery/scans \
  -H "Authorization: Bearer <your_token>"

# View latest leads
curl http://localhost:3001/api/leads \
  -H "Authorization: Bearer <your_token>"
```

## Lead Scoring Criteria

**High Score (80-100):**
- Active hiring for cloud/DevOps roles
- Recent funding (Series B+)
- Modern tech stack (AWS, Azure, GCP)
- 100-500 employees
- Revenue $10M-$100M

**Medium Score (60-79):**
- Some hiring activity
- Growing company
- Some modernization signals
- 50-100 employees

**Low Score (<60):**
- Not saved to database
- Filtered out automatically

## Rate Limiting
- 1 second delay between companies
- Processes ~10 results per query
- Total: ~40 companies per run

## Error Handling
- Continues on individual API failures
- Logs errors for debugging
- Returns partial results on completion
- Never crashes the main process
