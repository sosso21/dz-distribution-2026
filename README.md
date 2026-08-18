# DZ Distribution API 🇩🇿

Production-ready REST API exposing the administrative territorial distribution of Algeria.

The API provides structured data for **wilayas, daïras, and communes**, with a focus on the 2026 administrative reorganization of Algeria.

## Production API

The API is currently deployed on Vercel:

**Base URL**

`https://dz-distribution-2026.vercel.app`

### Available endpoints

| Resource | Endpoint        | Description                           |
| -------- | --------------- | ------------------------------------- |
| Wilayas  | `/api/wilayas`  | Returns the complete list of wilayas  |
| Communes | `/api/communes` | Returns the complete list of communes |
| Daïras   | `/api/dairas`   | Returns the complete list of daïras   |

### Examples

#### Get all wilayas

```http
GET https://dz-distribution-2026.vercel.app/api/wilayas
```

#### Get all communes

```http
GET https://dz-distribution-2026.vercel.app/api/communes
```

#### Get all daïras

```http
GET https://dz-distribution-2026.vercel.app/api/dairas
```

The API currently exposes JSON responses and is designed to be consumed by web applications, mobile applications, data platforms, and other services.

---

# Overview

DZ Distribution API aims to provide a reliable and developer-friendly representation of Algeria's administrative territorial organization.

The project focuses on:

* Wilayas
* Daïras
* Communes
* Administrative relationships
* 2026 territorial reorganization
* Historical territorial changes
* Official data sources

The long-term objective is to provide a stable and versioned API for applications that need accurate Algerian administrative data.

---

# Tech Stack

* **Next.js 16**
* **React**
* **TypeScript**
* **Next.js App Router**
* **Route Handlers**
* **Node.js**
* **pnpm**
* **Vercel**

The API is implemented using Next.js App Router Route Handlers.

Example:

```text
app/
└── api/
    └── wilayas/
        └── route.ts
```

---

# Project Structure

```text
dz-distribution/
│
├── app/
│   ├── api/
│   │   ├── wilayas/
│   │   │   └── route.ts
│   │   │
│   │   ├── dairas/
│   │   │   └── route.ts
│   │   │
│   │   └── communes/
│   │       └── route.ts
│   │
│   ├── layout.tsx
│   └── page.tsx
│
├── database/
│   ├── wilaya.ts
│   ├── daira.ts
│   └── commune.ts
│
├── public/
│
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

The `database/` directory contains the source datasets used by the API.

The `app/api/` directory contains the HTTP API layer.

---

# API Design

The API follows a resource-oriented structure.

```text
/api/wilayas
/api/dairas
/api/communes
```

Each endpoint is implemented as a Next.js Route Handler.

Example:

```typescript
import { NextResponse } from "next/server";
import wilaya from "@/database/wilaya";

export async function GET() {
  return NextResponse.json(wilaya);
}
```

The API layer is intentionally kept separate from the underlying datasets.

This makes it possible to evolve the data model without tightly coupling it to the HTTP layer.

---

# Data Model

The target administrative hierarchy is:

```text
Algeria
│
├── Wilaya
│   ├── Daïra
│   │   ├── Commune
│   │   ├── Commune
│   │   └── ...
│   │
│   └── ...
│
└── ...
```

The API should preserve the relationships between these entities.

A future normalized representation may use:

```text
Wilaya
Daïra
Commune
TerritorialChange
Source
```

This will allow the API to represent both the current administrative structure and historical changes.

---

# Data Sources

Administrative data should be based primarily on official Algerian sources.

The main reference source is the:

**Journal Officiel de la République Algérienne Démocratique et Populaire (JORADP)**

Particular attention is given to the legal texts defining:

* Territorial organization
* Wilaya boundaries
* Daïra organization
* Commune assignments
* Administrative reorganizations

For the 2026 reorganization, the project references the relevant 2026 Journal Officiel publications and implementing decrees.

Data should not be considered authoritative solely because it appears on third-party websites.

Where possible, every dataset change should be traceable to an official source.

---

# Development

## Requirements

Recommended versions:

```text
Node.js >= 20
pnpm >= 9
```

Check your environment:

```bash
node --version
pnpm --version
```

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd dz-distribution
```

Install dependencies:

```bash
pnpm install
```

## Run locally

Start the development server:

```bash
pnpm dev
```

The application will be available at:

```text
http://localhost:3000
```

API endpoints:

```text
http://localhost:3000/api/wilayas
http://localhost:3000/api/dairas
http://localhost:3000/api/communes
```

---

# Production Build

Always validate the production build before deployment.

```bash
pnpm build
```

Run the production server:

```bash
pnpm start
```

The production build must complete successfully before deployment.

---

# Code Quality

The project uses TypeScript to provide static type checking and improve data integrity.

Before opening a pull request, contributors should verify:

```bash
pnpm lint
pnpm build
```

If type checking is configured separately, run:

```bash
pnpm exec tsc --noEmit
```

All commands should pass before merging changes.

---

# API Reliability

The API is designed to be deterministic for a given dataset version.

The following principles should be maintained:

* Do not mutate source data inside API handlers.
* Keep data transformations explicit.
* Avoid unnecessary external API dependencies.
* Validate imported datasets.
* Preserve official administrative names.
* Preserve official administrative codes where available.
* Keep historical changes separate from current-state data.
* Avoid breaking existing API responses without a version change.

---

# Versioning

The API should use explicit API versioning before introducing breaking changes.

Recommended future structure:

```text
/api/v1/wilayas
/api/v1/dairas
/api/v1/communes
```

A future version may be introduced as:

```text
/api/v2/...
```

without breaking existing consumers.

Non-breaking changes may include:

* Adding new fields
* Adding new resources
* Adding optional query parameters

Breaking changes include:

* Removing fields
* Renaming fields
* Changing data types
* Changing endpoint semantics
* Changing the meaning of existing identifiers

---

# Data Versioning

Administrative data is time-dependent.

The project should distinguish between:

```text
Current administrative structure
```

and:

```text
Historical administrative structure
```

The target model should eventually support queries such as:

```text
GET /api/v1/wilayas?year=2026
```

and:

```text
GET /api/v1/changes?from=2025&to=2026
```

This makes it possible to track territorial reorganizations rather than exposing only the latest state.

---

# Error Handling

API endpoints should return standard HTTP status codes.

Example successful response:

```http
200 OK
Content-Type: application/json
```

Example not-found response:

```http
404 Not Found
Content-Type: application/json
```

Recommended error structure:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found."
  }
}
```

Error responses should not expose internal implementation details.

---

# Performance

The current datasets are static and relatively small.

The preferred strategy is therefore:

* Load static data from the application dataset.
* Avoid unnecessary database queries.
* Avoid external requests during API requests.
* Allow the hosting platform to cache immutable responses where appropriate.

For larger datasets, the project can later migrate to a dedicated database while keeping the public API contract stable.

---

# Security

The API currently exposes public administrative information and does not require authentication.

Nevertheless, production deployments should follow standard security practices:

* Never commit secrets.
* Never expose environment variables containing credentials.
* Validate query parameters.
* Avoid arbitrary filesystem access.
* Avoid dynamic code execution.
* Keep dependencies updated.
* Review dependency vulnerabilities regularly.

Check dependencies with:

```bash
pnpm audit
```

---

# Deployment

The application is deployed using Vercel.

Production URL:

```text
https://dz-distribution-2026.vercel.app
```

Deployment can be connected directly to the Git repository.

Recommended deployment workflow:

```text
Local development
       │
       ▼
Pull Request
       │
       ▼
Lint
       │
       ▼
Type Check
       │
       ▼
Production Build
       │
       ▼
Review
       │
       ▼
Production Deployment
```

Before deploying:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

---

# Git Workflow

Recommended branch strategy:

```text
main
├── feature/...
├── fix/...
├── refactor/...
└── chore/...
```

Examples:

```bash
git checkout -b feature/add-daira-api
```

```bash
git checkout -b fix/commune-data
```

Commit messages should be clear and scoped.

Recommended format:

```text
feat: add daira endpoint
fix: correct commune assignment
data: update 2026 territorial distribution
refactor: normalize administrative data
docs: update API documentation
chore: update dependencies
```

---

# Pull Requests

A pull request should contain:

* A clear description of the change
* The reason for the change
* Relevant tests or validation
* Data sources when administrative data is modified
* Breaking-change information when applicable

For administrative data changes, the source document should always be referenced.

---

# Data Contribution Guidelines

Changes to administrative data require particular care.

When adding or modifying a wilaya, daïra, or commune:

1. Verify the official source.
2. Verify the administrative code.
3. Verify the official French/Arabic name where applicable.
4. Verify the parent administrative entity.
5. Verify the effective date.
6. Record the source.
7. Validate the complete dataset.
8. Run the production build.

Do not update administrative data based solely on unofficial maps or third-party websites.

---

# Roadmap

Planned improvements:

* [ ] Add `/api/v1` versioning
* [ ] Add daïra endpoint
* [ ] Normalize wilaya/daïra/commune relationships
* [ ] Add official administrative codes
* [ ] Add historical territorial versions
* [ ] Add 2026 change tracking
* [ ] Add search endpoints
* [ ] Add filtering and pagination
* [ ] Add OpenAPI specification
* [ ] Add automated API tests
* [ ] Add schema validation
* [ ] Add automated data consistency checks
* [ ] Add official source metadata
* [ ] Add geographic coordinates
* [ ] Add API documentation
* [ ] Add CI/CD validation

---

# License

This project is intended to provide structured access to publicly available administrative information.

The project source code and the underlying administrative datasets may have different licensing or usage conditions. Consult the relevant official sources before redistributing official government data.

---

# Author

**Sofiane**

Project:

`dz-distribution-2026`

Production API:

`https://dz-distribution-2026.vercel.app`
