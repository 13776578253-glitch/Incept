# Local PostgreSQL Docker Setup

## Goal

Run PostgreSQL in Docker Desktop while keeping the app code on native Windows.

This matches the current preferred workflow:

- code stays in `D:\...`
- Git stays on Windows
- Next.js runs on Windows
- PostgreSQL runs inside Docker
- the app connects through `localhost`

You do **not** need to move the repo into the WSL filesystem for this setup.

---

## Files Added

- root `docker-compose.yml`
- root `.env.docker.example`
- `apps/web/.env.example`
- `packages/db/.env.example`

---

## First-Time Setup

### 1. Create Docker env file

In the repo root:

```powershell
Copy-Item .env.docker.example .env.docker
```

You can keep the defaults for now.

### 2. Create app env file

In `apps/web`:

```powershell
Copy-Item .env.example .env.local
```

This provides:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/incept?schema=public"
```

### 3. Create Prisma env file

In `packages/db`:

```powershell
Copy-Item .env.example .env
```

This gives Prisma CLI the same database connection string.

### 4. Start PostgreSQL

From the repo root:

```powershell
docker compose --env-file .env.docker up -d
```

### 5. Verify the container is healthy

```powershell
docker compose ps
```

You should see the `postgres` service running.

---

## Useful Commands

### Start database

```powershell
docker compose --env-file .env.docker up -d
```

### Stop database

```powershell
docker compose --env-file .env.docker down
```

### Stop database and delete local data

```powershell
docker compose --env-file .env.docker down -v
```

Use `-v` carefully because it removes the named PostgreSQL volume.

### View logs

```powershell
docker compose logs postgres
```

---

## Connection Model

Your app will connect like this:

- host: `localhost`
- port: `5432`
- database: `incept`
- username: `postgres`
- password: `postgres`

So the app-side connection string is:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/incept?schema=public"
```

---

## Why This Setup Fits The Repo

This setup is a good first step because:

- it keeps your current Windows editing workflow
- Git usage stays unchanged
- PostgreSQL is isolated and easy to reset
- later Prisma can connect without changing the frontend route structure

---

## Next Step After Database Starts

Once PostgreSQL starts correctly, the next step is:

1. create `packages/db`
2. add Prisma
3. write `schema.prisma`
4. run the first migration
5. seed docs data

That is the right point to begin the real database integration.
