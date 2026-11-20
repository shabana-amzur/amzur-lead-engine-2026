# Frontend - Next.js 14 App

## Overview
The frontend is a Next.js 14 application using the App Router, Tailwind CSS, and SWR for data fetching.

## Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home page
│   │   ├── login/
│   │   │   └── page.tsx        # Login page
│   │   └── dashboard/
│   │       └── page.tsx        # Protected dashboard
│   ├── lib/
│   │   └── api.js              # API client with fetch helpers
│   ├── contexts/
│   │   └── AuthContext.tsx     # Auth context provider
│   └── middleware.ts           # Route protection middleware
├── next.config.js
├── tailwind.config.js
└── package.json
```

## Key Features

### 🔐 Authentication
- JWT-based auth with httpOnly cookies
- Login page at `/login`
- Protected dashboard routes
- Automatic token verification
- Middleware-based route protection

### 📡 API Integration
All API calls use the centralized API client (`/lib/api.js`):

**Auth API:**
- `authAPI.login(email, password)` - Login and store JWT
- `authAPI.verify()` - Verify token
- `authAPI.logout()` - Clear token

**Leads API:**
- `leadsAPI.getAll(params)` - Paginated leads with filters
- `leadsAPI.getById(id)` - Single lead
- `leadsAPI.create(data)` - Create lead
- `leadsAPI.update(id, data)` - Update lead
- `leadsAPI.delete(id)` - Delete lead

**Scan API:**
- `scanAPI.trigger()` - Start discovery scan
- `scanAPI.getHistory(params)` - Scan history
- `scanAPI.getLatest()` - Latest scan
- `scanAPI.getById(id)` - Specific scan

### 🔄 Data Fetching with SWR
Real-time data fetching with automatic revalidation:

```typescript
const { data, error, mutate } = useSWR(
  '/api/leads',
  () => leadsAPI.getAll({ page: 1, limit: 10 })
);
```

Benefits:
- Automatic caching
- Revalidation on focus
- Optimistic updates
- Error handling
- Loading states

## Pages

### Home Page (`/`)
- Landing page with feature cards
- Links to dashboard and login
- Public access

### Login Page (`/login`)
- Email/password form
- JWT token stored in cookie
- Redirects to dashboard on success
- Shows default credentials hint

**Default Credentials:**
- Email: `admin@amzur.com`
- Password: `admin123`

### Dashboard (`/dashboard`)
- **Protected route** (requires authentication)
- Real-time lead data with SWR
- Stats cards (total leads, latest scan results)
- Filterable leads table
  - Filter by minimum score
  - Pagination support
- Trigger manual discovery scans
- Recent scan history
- Logout functionality

## Middleware Protection

`middleware.ts` protects routes:

```typescript
// Protects /dashboard/* routes
// Redirects to /login if not authenticated
// Redirects to /dashboard if already logged in and accessing /login
```

## Environment Variables

`.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Running the App

### Development
```bash
npm run dev
```

Runs on: http://localhost:3000 (or 3002 if 3000 is in use)

### Build
```bash
npm run build
```

### Production
```bash
npm run start
```

## Styling

Uses **Tailwind CSS** with custom primary color palette:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        50: '#f0f9ff',
        100: '#e0f2fe',
        // ... up to 900
      },
    },
  },
}
```

## Data Flow

1. **User logs in** → JWT stored in cookie
2. **Middleware checks** → Protects dashboard routes
3. **SWR fetches data** → Automatic caching and revalidation
4. **Dashboard displays** → Real-time leads and scans
5. **User triggers scan** → Background job starts
6. **SWR refetches** → Updates UI automatically

## Security Features

- JWT tokens in httpOnly cookies (prevents XSS)
- Middleware-based route protection
- Token verification on protected API calls
- Automatic logout on token expiry
- CORS configured in backend

## API Error Handling

All API calls handle errors gracefully:

```typescript
try {
  await scanAPI.trigger();
  // Success handling
} catch (error) {
  // Error message displayed to user
  alert('Failed: ' + error.message);
}
```

## Best Practices

1. **Use SWR** for all data fetching
2. **Centralize API calls** in `/lib/api.js`
3. **Protect routes** with middleware
4. **Handle loading states** in UI
5. **Show error messages** to users
6. **Use TypeScript** for type safety
7. **Follow Tailwind conventions** for styling

## Future Enhancements

- [ ] Add lead detail page
- [ ] Add lead creation form
- [ ] Add advanced filters (industry, LOB, source)
- [ ] Add export functionality
- [ ] Add real-time notifications
- [ ] Add charts and analytics
- [ ] Add user profile page
- [ ] Add dark mode
