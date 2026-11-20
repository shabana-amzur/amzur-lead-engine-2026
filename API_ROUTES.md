# API Routes Documentation

## Base URL
`http://localhost:3001`

---

## Authentication

### POST /api/auth/login
Login and receive JWT token.

**Request Body:**
```json
{
  "email": "admin@amzur.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cmq7ytp6g000018gkncvbyfvk",
    "email": "admin@amzur.com"
  }
}
```

**Status Codes:**
- `200` - Success
- `400` - Missing email or password
- `401` - Invalid credentials
- `500` - Server error

---

### GET /api/auth/verify
Verify if JWT token is valid.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "userId": "...",
    "email": "admin@amzur.com"
  }
}
```

---

## Leads Management

### GET /api/leads
Get paginated list of leads with optional filters.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Results per page
- `lob` (string) - Filter by line of business
- `minScore` (number) - Minimum lead score
- `maxScore` (number) - Maximum lead score
- `source` (string) - Filter by source
- `search` (string) - Search in company name, industry, or HQ

**Example Request:**
```bash
GET /api/leads?page=1&limit=10&minScore=80&lob=FinTech
```

**Response:**
```json
{
  "leads": [
    {
      "id": "cmq7ytp73000318gkct3qocdn",
      "companyName": "Future Systems Corp",
      "industry": "Fintech",
      "website": "https://futuresystems.com",
      "employees": 500,
      "revenue": 50000000,
      "hq": "New York, NY",
      "lob": "Payment Processing",
      "intentSignal": "Attending AWS Summit",
      "recommendedService": "Security Audit",
      "leadScore": 95,
      "source": "Conference",
      "discoveredAt": "2026-06-10T11:08:26.705Z",
      "signals": {
        "eventAttendance": ["AWS Summit", "FinTech Conference"],
        "compliance": ["PCI-DSS", "SOC2"]
      },
      "outreachEmail": "business@futuresystems.com"
    }
  ],
  "pagination": {
    "total": 3,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

---

### GET /api/leads/:id
Get single lead details by ID.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "lead": {
    "id": "cmq7ytp73000318gkct3qocdn",
    "companyName": "Future Systems Corp",
    "industry": "Fintech",
    "website": "https://futuresystems.com",
    "employees": 500,
    "revenue": 50000000,
    "hq": "New York, NY",
    "lob": "Payment Processing",
    "intentSignal": "Attending AWS Summit",
    "recommendedService": "Security Audit",
    "leadScore": 95,
    "source": "Conference",
    "discoveredAt": "2026-06-10T11:08:26.705Z",
    "signals": {
      "eventAttendance": ["AWS Summit"],
      "compliance": ["PCI-DSS", "SOC2"]
    },
    "outreachEmail": "business@futuresystems.com"
  }
}
```

**Status Codes:**
- `200` - Success
- `404` - Lead not found

---

### POST /api/leads
Create a new lead manually.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "companyName": "Example Corp",
  "industry": "Technology",
  "website": "https://example.com",
  "employees": 150,
  "revenue": 25000000,
  "hq": "San Francisco, CA",
  "lob": "SaaS",
  "outreachEmail": "contact@example.com"
}
```

**Response:**
```json
{
  "lead": {
    "id": "...",
    "companyName": "Example Corp",
    "industry": "Technology",
    "website": "https://example.com",
    "employees": 150,
    "revenue": 25000000,
    "hq": "San Francisco, CA",
    "lob": "SaaS",
    "outreachEmail": "contact@example.com",
    "source": "MANUAL",
    "leadScore": 50,
    "discoveredAt": "2026-06-10T..."
  }
}
```

---

### PUT /api/leads/:id
Update an existing lead.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "leadScore": 85,
  "intentSignal": "Requesting proposal",
  "recommendedService": "Cloud Migration"
}
```

**Response:**
```json
{
  "lead": {
    "id": "...",
    "companyName": "Example Corp",
    "leadScore": 85,
    "intentSignal": "Requesting proposal",
    "recommendedService": "Cloud Migration",
    ...
  }
}
```

---

### DELETE /api/leads/:id
Delete a lead.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Lead deleted successfully",
  "id": "cmq7ytp73000318gkct3qocdn"
}
```

---

## Discovery Scans

### POST /api/scan/run
Trigger a manual lead discovery scan.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Lead discovery scan started",
  "status": "running"
}
```

**Note:** The scan runs asynchronously in the background. Check `/api/scan/history` to see results.

---

### GET /api/scan/history
Get paginated list of past discovery scans.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)

**Response:**
```json
{
  "scans": [
    {
      "id": "cmq7ytp74000418gkwwgqtb5o",
      "startedAt": "2026-06-10T11:08:26.705Z",
      "completedAt": "2026-06-10T11:23:12.450Z",
      "companiesScanned": 1500,
      "newLeadsFound": 3,
      "sources": {
        "linkedin": 800,
        "indeed": 400,
        "conferences": 300
      }
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

---

### GET /api/scan/latest
Get the most recent scan details.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "scan": {
    "id": "cmq7ytp74000418gkwwgqtb5o",
    "startedAt": "2026-06-10T11:08:26.705Z",
    "completedAt": "2026-06-10T11:23:12.450Z",
    "companiesScanned": 1500,
    "newLeadsFound": 3,
    "sources": {
      "linkedin": 800,
      "indeed": 400,
      "conferences": 300
    }
  }
}
```

---

### GET /api/scan/:id
Get specific scan details by ID.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "scan": {
    "id": "cmq7ytp74000418gkwwgqtb5o",
    "startedAt": "2026-06-10T11:08:26.705Z",
    "completedAt": "2026-06-10T11:23:12.450Z",
    "companiesScanned": 1500,
    "newLeadsFound": 3,
    "sources": {
      "linkedin": 800,
      "indeed": 400,
      "conferences": 300
    }
  }
}
```

---

## Health Check

### GET /health
Check API server status (no authentication required).

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-10T11:30:00.000Z"
}
```

---

## Error Responses

All endpoints may return these error codes:

**401 Unauthorized:**
```json
{
  "error": "Access token required"
}
```

**403 Forbidden:**
```json
{
  "error": "Invalid or expired token"
}
```

**404 Not Found:**
```json
{
  "error": "Resource not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Error message here"
}
```

---

## Testing with cURL

### Login and get token:
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@amzur.com","password":"admin123"}'
```

### Get leads with filter:
```bash
curl http://localhost:3001/api/leads?minScore=80 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Trigger discovery scan:
```bash
curl -X POST http://localhost:3001/api/scan/run \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### View scan history:
```bash
curl http://localhost:3001/api/scan/history \
  -H "Authorization: Bearer YOUR_TOKEN"
```
