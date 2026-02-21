# SubbyMe Backend API

Production-ready NestJS + MongoDB backend for the SubbyMe contractor marketplace platform.

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: NestJS 10
- **Database**: MongoDB + Mongoose ODM
- **Auth**: JWT + bcrypt + Google OAuth2 (passport)
- **Validation**: class-validator + class-transformer
- **Security**: Helmet + @nestjs/throttler (rate limiting)

---

## Getting Started

### 1. Prerequisites

- Node.js 20+
- MongoDB (local or Atlas)

### 2. Install Dependencies

```bash
cd backend
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/subbyme
JWT_SECRET=your-secure-secret-here
CORS_ORIGINS=http://localhost:5173
```

### 4. Run Development Server

```bash
npm run start:dev
```

API will be available at: `http://localhost:3001/api/v1`

### 5. Build for Production

```bash
npm run build
npm run start:prod
```

---

## Project Structure

```
backend/
├── src/
│   ├── main.ts                          # App bootstrap (Helmet, CORS, pipes)
│   ├── app.module.ts                    # Root module
│   ├── config/
│   │   └── configuration.ts            # Typed config factory
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   └── roles.decorator.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts # Global error handler
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   └── roles.guard.ts
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts # Consistent response format
│   │   └── pipes/
│   │       └── parse-object-id.pipe.ts
│   └── modules/
│       ├── auth/                        # JWT + Google OAuth
│       ├── users/                       # User CRUD + contractor search
│       ├── listings/                    # Job listings
│       ├── applications/                # Contractor bids/applications
│       ├── reviews/                     # Rating & review system
│       ├── admin/                       # Admin dashboard endpoints
│       └── transactions/                # Future payment schema
└── .env.example
```

---

## API Reference

All responses follow this consistent format:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Request successful",
  "data": { ... },
  "timestamp": "2026-02-21T00:00:00.000Z"
}
```

Error responses:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": null,
  "timestamp": "2026-02-21T00:00:00.000Z",
  "path": "/api/v1/auth/login"
}
```

---

### Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/auth/register` | Public | Register with email/password |
| `POST` | `/api/v1/auth/login` | Public | Login, returns JWT tokens |
| `GET` | `/api/v1/auth/profile` | JWT | Get current user from token |
| `POST` | `/api/v1/auth/refresh` | JWT | Refresh access token |
| `GET` | `/api/v1/auth/google` | Public | Redirect to Google OAuth |
| `GET` | `/api/v1/auth/google/callback` | Public | Google OAuth callback |

**Register Request:**
```json
POST /api/v1/auth/register
{
  "name": "John Davis",
  "email": "john@example.com",
  "password": "securepass123",
  "role": "client"
}
```

**Login Response:**
```json
{
  "user": { "id": "...", "name": "John Davis", "role": "client" },
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": "7d"
  }
}
```

---

### Users Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/users/contractors` | Public | Search contractors with filters |
| `GET` | `/api/v1/users/:id` | JWT | Get user profile by ID |
| `PATCH` | `/api/v1/users/:id` | JWT (owner) | Update own profile |
| `DELETE` | `/api/v1/users/:id` | Admin | Hard delete user |

**Search Contractors:**
```
GET /api/v1/users/contractors?trade=Plumbing&location=Sydney&minRating=4&isVerified=true&page=1&limit=10
```

---

### Listings Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/listings` | Public | Browse all listings (filterable) |
| `GET` | `/api/v1/listings/my` | Client | Get own listings |
| `GET` | `/api/v1/listings/:id` | Public | Get listing detail |
| `POST` | `/api/v1/listings` | Client | Create a new listing |
| `PATCH` | `/api/v1/listings/:id` | Client/Admin | Update listing |
| `DELETE` | `/api/v1/listings/:id` | Client/Admin | Delete listing |

**Create Listing:**
```json
POST /api/v1/listings
Authorization: Bearer <token>
{
  "title": "Bathroom renovation plumber needed",
  "description": "Full bathroom renovation, approximately 2 weeks work",
  "category": "Plumbing",
  "location": "Sydney, NSW",
  "budget": { "min": 2000, "max": 5000, "currency": "AUD" },
  "skills": ["Bathroom Renovation", "Waterproofing"],
  "urgency": "medium"
}
```

---

### Applications Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/applications` | Contractor | Submit application/bid |
| `GET` | `/api/v1/applications/my` | Contractor | My submitted applications |
| `GET` | `/api/v1/applications/listing/:id` | Client/Admin | Apps for a listing |
| `GET` | `/api/v1/applications/:id` | JWT | Get application detail |
| `PATCH` | `/api/v1/applications/:id` | JWT | Update status (accept/reject/withdraw) |
| `DELETE` | `/api/v1/applications/:id` | Contractor | Delete pending application |

**Submit Application:**
```json
POST /api/v1/applications
Authorization: Bearer <contractor-token>
{
  "listingId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "coverLetter": "I have 15 years experience in bathroom plumbing...",
  "proposedRate": 80,
  "proposedTimeline": "2 weeks"
}
```

---

### Reviews Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/reviews` | JWT | Submit a review |
| `GET` | `/api/v1/reviews/user/:userId` | Public | Get reviews for a user |
| `GET` | `/api/v1/reviews` | Admin | All reviews (paginated) |
| `GET` | `/api/v1/reviews/:id` | Public | Single review |
| `DELETE` | `/api/v1/reviews/:id` | Owner/Admin | Delete review |

---

### Admin Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/admin/stats` | Admin | Platform statistics |
| `GET` | `/api/v1/admin/users` | Admin | All users paginated |
| `PATCH` | `/api/v1/admin/users/:id/status` | Admin | Suspend/activate user |
| `DELETE` | `/api/v1/admin/users/:id` | Admin | Hard delete user |
| `GET` | `/api/v1/admin/listings` | Admin | All listings |

---

## Frontend Integration

Set your frontend API base URL to point to this backend:

```typescript
// In your frontend
const API_BASE = 'http://localhost:3001/api/v1';

// Example: Login
const res = await fetch(`${API_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const { data } = await res.json();
// data.tokens.accessToken is your JWT

// Example: Protected request
await fetch(`${API_BASE}/listings`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

---

## MongoDB Schemas & Indexes

| Collection | Key Indexes |
|---|---|
| `users` | `email` (unique), `role`, `isActive`, `googleId` (sparse), text search |
| `listings` | `clientId`, `status`, `category`, `location`, text search |
| `applications` | `listingId + contractorId` (unique), `contractorId`, `listingId` |
| `reviews` | `reviewerId + listingId` (unique), `revieweeId`, `rating` |
| `transactions` | `clientId`, `contractorId`, `listingId`, `status` |

---

## Security

- **Helmet** — Sets secure HTTP headers on all responses
- **Rate Limiting** — 100 requests per 60s per IP (configurable)
- **bcrypt** — Password hashing with salt rounds = 12
- **JWT** — Short-lived access tokens (7d) + refresh tokens (30d)
- **Validation Pipe** — `whitelist: true` strips unknown properties
- **Role Guards** — Role-based access on all sensitive endpoints
- **CORS** — Configured to only allow specified origins
#   s u b b y m e - b a c k e n d  
 