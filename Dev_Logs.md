# CirKit: Developer Handover

CirKit is a web app for sharing tools and equipment within closed groups (clubs, apartment buildings, friend circles). Members list items, request to borrow them for specific dates, and track each item through checkout and return.

This file describes how the project is set up today and the steps every developer follows to get it running and contribute.

---

## 1. Tech stack

| Part | Tool | Version |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | 16.4 |
| Styling | Tailwind CSS | 4 |
| UI components | shadcn/ui (copied into `src/components/ui`) | 4 |
| Database | PostgreSQL, run locally in Docker | 18 |
| Database access | Prisma ORM (Object-Relational Mapping) | **7** (do not upgrade to 8; Better Auth needs 7) |
| Authentication | Better Auth (email and password) | 1.7 |
| Planned | Better Auth organization plugin, Gmail API, Cloudflare R2 | not yet added |

---

## 2. Current status

**Done**
- Next.js app with TypeScript, Tailwind and shadcn/ui (`button`, `card`, `input`, `label`)
- Local PostgreSQL 18 via Docker (`docker-compose.yml`)
- Prisma 7 configured, with the connection in `src/lib/prisma.ts`
- Better Auth configured with email and password sign-in
- First migration (`add_better_auth`) creates the `user`, `session`, `account` and `verification` tables
- Auth API route at `/api/auth/*`

**Not done yet**
- Sign-up, sign-in and dashboard pages (UI)
- Organization plugin (groups, roles, invitations)
- App tables: items, bookings, photos
- Gmail email sending, Cloudflare R2 photo storage

---

## 3. Project structure

```
cirkit/
├── .env                  # your secrets (NOT committed, create from .env.example)
├── .env.example          # list of required variables (committed)
├── docker-compose.yml    # local PostgreSQL 18 database on port 5433
├── prisma7.config.ts     # tells Prisma where the schema, migrations and DB URL are
├── components.json       # shadcn/ui settings
├── prisma/
│   ├── schema.prisma     # ALL database tables (Better Auth's + ours)
│   └── migrations/       # history of database changes (committed)
├── public/               # static images
└── src/
    ├── app/                          # pages and routes (App Router)
    │   ├── layout.tsx                # shared page wrapper
    │   ├── page.tsx                  # home page "/"
    │   ├── globals.css               # Tailwind + theme
    │   └── api/auth/[...all]/route.ts  # Better Auth's endpoints (/api/auth/...)
    ├── components/ui/    # shadcn/ui components
    ├── generated/prisma/ # created by `npx prisma generate` (NOT committed)
    └── lib/
        ├── prisma.ts     # the single shared database connection
        ├── auth.ts       # Better Auth server config
        ├── auth-client.ts  # Better Auth functions for React pages
        └── utils.ts      # shadcn helper (cn)
```

`@/` is a shortcut for `src/`, so `@/lib/auth` means `src/lib/auth.ts`.

---

## 4. First-time setup (new developer)

### Prerequisites
- **Node.js 22.12 or newer:** check with `node -v`
- **Docker Desktop:** installed and open
- **Git**

### Steps

```bash
# 1. Get the code
git clone https://github.com/<team>/CirKit.git cirkit   # lowercase folder name avoids npm errors
cd cirkit

# 2. Install packages
npm install

# 3. Create your environment file
cp .env.example .env
npx auth@latest secret          # copy the output into BETTER_AUTH_SECRET in .env

# 4. Start the database (Docker Desktop must be running)
docker compose up -d
docker compose ps               # STATUS should say "Up"

# 5. Create the tables and generate Prisma's TypeScript code
npx prisma migrate dev
npx prisma generate

# 6. Start the app
npm run dev                     # open http://localhost:3000
```

### Check it worked
- `http://localhost:3000` loads.
- `npx prisma studio` opens a browser view listing the `user`, `session`, `account` and `verification` tables.

---

## 5. Daily workflow

### Start of each session
```bash
docker compose up -d            # start the database
git checkout main
git pull                        # get everyone's latest work
npm install                     # in case someone added a package
npx prisma migrate dev          # in case someone changed the database
npx prisma generate
npm run dev
```

### Working on a feature
```bash
git checkout -b feature/item-listings     # one branch per task
# ...write code, test in the browser...
git add .
git commit -m "Add item listing form"
git push -u origin feature/item-listings
```
Then open a **pull request** on GitHub into `main`, and ask a teammate to review it. Merge only after approval.

### Keeping your branch up to date
```bash
git checkout main && git pull
git checkout feature/item-listings
git merge main
```

### Branch names
- `feature/...` for new things, e.g. `feature/borrow-requests`
- `fix/...` for bugs, e.g. `fix/booking-overlap`

---

## 6. How to build things

### A new page
Create a folder under `src/app` with a `page.tsx` inside. The folder name is the URL.

```
src/app/items/page.tsx         ->  /items
src/app/items/[id]/page.tsx    ->  /items/123   (the [id] part is a variable)
```

### A UI component
```bash
npx shadcn@latest add dialog        # adds src/components/ui/dialog.tsx
```
```tsx
import { Button } from "@/components/ui/button";
```
Put your own reusable components in `src/components/` (outside `ui/`).

### Reading or writing data (server only)
Always access the database from server code (server components, server actions or `src/app/api/...` routes), never from browser code.

```ts
import prisma from "@/lib/prisma";

const items = await prisma.item.findMany({ where: { groupId } });
```

### Who is signed in?
**Server side** (pages, server actions, API routes):
```ts
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({ headers: await headers() });
if (!session) {
  // not signed in: redirect or return an error
}
const userId = session.user.id;
```

**Client side** (components with `"use client"` at the top):
```tsx
import { useSession, signIn, signUp, signOut } from "@/lib/auth-client";

const { data: session, isPending } = useSession();
```
Client-side checks are only for showing/hiding things. **Every permission check that matters must happen on the server.**

---

## 7. Changing the database

### Adding or changing your own tables
1. Edit `prisma/schema.prisma`. Link records to users with the `User` model, e.g.:
   ```prisma
   model Item {
     id        String   @id @default(cuid())
     name      String
     ownerId   String
     owner     User     @relation(fields: [ownerId], references: [id])
     createdAt DateTime @default(now())
   }
   ```
   (You also need to add `items Item[]` inside `model User`.)
2. Create and apply a migration:
   ```bash
   npx prisma migrate dev --name add-items
   npx prisma generate
   ```
3. **Commit the new folder in `prisma/migrations/`** together with the schema change.

### Adding a Better Auth plugin (e.g. organization)
1. Add the plugin in `src/lib/auth.ts` (and its client plugin in `src/lib/auth-client.ts`).
2. Then run:
   ```bash
   npx auth@latest generate          # answer y to overwrite schema.prisma
   npx prisma migrate dev --name add-organizations
   npx prisma generate
   ```
3. Check `schema.prisma` still has `output = "../src/generated/prisma"` in the generator block, and that your own models are still there.

### Rules
- **Never edit or delete migration files that are already on `main`.** Create a new migration instead.
- Put schema changes in their **own small PR**, merge it quickly and tell the team, because `schema.prisma` is the file most likely to cause merge conflicts.
- After pulling someone else's schema change, run `npx prisma migrate dev` and `npx prisma generate`.

---

## 8. Team rules

- **Never commit `.env`** or any password, API key or token. Add new variable *names* to `.env.example` instead.
- `main` must always run. Test your branch locally before opening a PR.
- Keep PRs small: one feature or fix per PR.
- Review teammates' PRs within 24 hours.
- Do not run `npm audit fix --force` or upgrade Prisma past version 7 without discussing it with the team.

---

## 9. Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app at localhost:3000 |
| `npm run lint` | Check code for common mistakes |
| `docker compose up -d` | Start the database |
| `docker compose down` | Stop the database (data is kept) |
| `docker compose down -v` | Stop it **and delete all data** |
| `npx prisma studio` | Browse and edit database rows in the browser |
| `npx prisma migrate dev` | Apply new migrations to your database |
| `npx prisma migrate reset` | Wipe your local database and re-run all migrations |
| `npx prisma generate` | Regenerate Prisma's TypeScript code |
| `npx shadcn@latest add <name>` | Add a UI component |

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `P1001 Can't reach database server at localhost:5433` | Open Docker Desktop, then `docker compose up -d` |
| Port 5433 already in use | Change the ports line in `docker-compose.yml` to `"5434:5432"` (and the same port in your `.env`); don't commit that change |
| `Cannot find module '@/generated/prisma/client'` | Run `npx prisma generate` |
| `P4001 The introspected database was empty` | Not an error: the database simply has no tables yet. Run `npx prisma migrate dev` |
| Better Auth: "Prisma schema mismatch / Missing tables" | Run `npx prisma migrate dev` (and `npx auth@latest generate` if you added a plugin) |
| `create-next-app`/npm complains about capital letters | Use a lowercase folder name |
| Hydration error in the browser console | Usually a browser extension (Grammarly, Dark Reader…). Try an incognito window |
| Weird errors after moving or renaming folders | Stop the dev server, `rm -rf .next`, then `npm run dev` |
| Login requests return 404 | The route folder must be named `[...all]` (three dots) |

---

## 11. Feature ownership (TBD)

| # | Feature | Owner |
|---|---|---|
| 1 | Sign up, authentication | Alan |
| 2 | Create a group, invite members with a link | Alan |
| 3 | Group roles (Owner, Member) | Alan |
| 4 | Item listings with photos | TBD |
| 5 | Borrow requests (approve/decline) | TBD |
| 6 | Availability calendar (no overlapping bookings) | TBD |
| 7 | Checkout and return flow and statuses | TBD |
| 8 | Search and filter | TBD |
| 9 | Dashboard (My items, My borrows, Requests) | TBD |
| A | Advanced: authorization rules (role + ownership checks) | TBD |
| B | Advanced: Gmail API email notifications | TBD |
