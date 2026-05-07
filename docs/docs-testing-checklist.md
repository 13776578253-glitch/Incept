# Docs Testing Checklist

## Before Testing

Run the database and seed steps first:

```powershell
docker compose --env-file .env.docker up -d
pnpm db:seed
```

If dependencies or package links changed recently, also run:

```powershell
pnpm install
```

## Recommended Manual Route Checks

Open and verify these routes:

- `http://localhost:3000/en/docs`
- `http://localhost:3000/en/docs/document-shells`
- `http://localhost:3000/en/docs/reference`
- `http://localhost:3000/zh/docs`
- `http://localhost:3000/zh/docs/document-shells`
- `http://localhost:3000/zh/docs/reference`

## What To Verify On Home

On `/{locale}/docs`, verify:

- page renders without mock data errors
- intro text still appears correctly
- entries are grouped by year
- guest-access article is clickable
- locked entries stay visible but do not navigate
- date formatting matches current locale

## What To Verify On Detail

On `/{locale}/docs/[slug]` and `/reference`, verify:

- article loads from database
- canonical article and `/reference` show the same content
- sidebar mode still renders correctly
- right rail still highlights sections while scrolling
- locale route affects the returned content

## Suggested Local Checks

If your local Node environment is healthy, run:

```powershell
pnpm lint
pnpm db:studio
```

Use Prisma Studio to confirm:

- docs documents exist
- locale rows exist for `en` and `zh`
- canonical slug is `document-shells`
- published rows have expected access roles

## If Something Fails

Check in this order:

1. is Docker PostgreSQL healthy
2. did `pnpm db:seed` complete successfully
3. does the route locale match seeded locale rows
4. does the target slug exist in `docs_document_locales`
5. is the document published

This order usually isolates the issue quickly.
