# Agent Handover — Auth, Groups & Membership (CirKit)

Read this whole file before writing code. It records what has been built, the
decisions behind it, and what to build next, so a new agent (e.g. Claude Code)
can continue without re-deriving context.

- **Full product spec:** `docs/system-specification.md` (business rules for
  roles, borrowing, locking, archiving). This file only repeats the parts that
  matter for our scope.
- **Team setup and workflow:** `Dev_Logs.md`, `notetomyself.md`.
- **Next.js rules:** `AGENTS.md`. This is Next.js 16 — read the relevant guide
  in `node_modules/next/dist/docs/` before using any Next API (Application
  Programming Interface). Do not trust older Next.js knowledge.

---

## 1. Our scope

This developer owns:

1. Authentication and authorization (login, sign-up, sessions, route guards).
2. Group and membership backend (groups, members, roles, invitations).
3. Pages: `/login`, `/signup`, `/dashboard`, `/groups/[groupId]`,
   `/groups/[groupId]/settings`, `/invites/[token]`.

**Not ours (teammates build them):** Items, Borrowing, My Items, Single Item,
Group Items Access page (`/groups/[groupId]/items`). We only link to them and
must keep our schema compatible with their tables (`ItemGroupAccess`,
`BorrowRequest.source_group_id`, `Notification`).

---

## 2. Tech stack (verified in repo)

| Part | Tool |
|---|---|
| Framework | Next.js 16.4 App Router, React 19, TypeScript |
| Styling / UI (User Interface) | Tailwind CSS 4, shadcn/ui (`base-nova` style) in `src/components/ui` |
| Database | PostgreSQL 18 in Docker (`docker compose up -d`, port 5433) |
| ORM (Object-Relational Mapping) | Prisma **7** — do NOT upgrade to 8 (Better Auth needs 7). Client is generated into `src/generated/prisma` |
| Auth | Better Auth 1.7, email + password, Prisma adapter, `nextCookies()` plugin |
| Validation | zod 4 (installed) |
| Server boundary | `server-only` package (installed) |

`next.config.ts` has **`cacheComponents: true`** — see Gotchas.

---

## 3. Architecture decisions (already made — follow them)

1. **Custom group tables, NOT the Better Auth organization plugin.**
   Reasons: Group Owner must NOT gain rights over members' items; leaving or
   removing a member must check active borrows first; teammates' tables need
   foreign keys to our `Group`. The plugin's own `/api/auth/organization/*`
   leave/remove endpoints would bypass those checks.
2. **Backend code lives in `src/server/`, not inside `src/app/`.**
   `src/app/` is for routes only. Every file in `src/server/` starts with
   `import "server-only";`. Code used by only one route may live beside it in a
   private folder (e.g. `app/(app)/groups/[groupId]/_components/`).
3. **Layering:** pages/components → Server Actions or queries → services →
   Prisma. Only services/queries touch Prisma. Permission checks live in
   services and `group.permissions.ts`; hiding buttons in the UI is cosmetic.
4. **Two-layer auth:**
   - `src/proxy.ts` (Next 16's renamed middleware) does an *optimistic* cookie
     check only.
   - `requireUser()` does the real database check and must be called in
     **every** protected page, Server Action and route handler. Layouts alone
     are not enough. Every Server Action is a public POST endpoint.
5. **Non-members get 404, not 403**, for group pages and actions, so group
   existence is not leaked.
6. **Derived state is computed, not stored** (spec rule): e.g. "item locked",
   "active vs inactive" come from queries over existing rows.
7. **Multi-step writes use `prisma.$transaction`** (create group + owner
   membership; accept invitation + create membership).

---

## 4. What is DONE (Phase 1 — uncommitted on branch `feature/login-page`)

| File | What it does |
|---|---|
| `src/proxy.ts` | Protected-by-default guard. Every page except `/login`, `/signup` needs a Better Auth session cookie (`getSessionCookie`), else redirect to `/login?redirect=<path>`. Matcher skips `/api`, `_next/*`, and files with an extension. Deliberately does NOT redirect logged-in users away from `/login` (a stale cookie would loop `/login` ↔ `/dashboard`); the login page must do that itself after a real `getSession()`. |
| `src/server/auth/session.ts` | `getSession()` (wrapped in React `cache()`), `getCurrentUser()` → user or null, `requireUser()` → user or `redirect("/login")`. Exports `AuthSession`, `AuthUser` types. |
| `src/lib/routes.ts` | `LOGIN_PATH`, `SIGNUP_PATH`, `DEFAULT_LOGIN_REDIRECT` (`/dashboard`), `REDIRECT_PARAM` (`"redirect"`), `isAuthRoute()`, `safeRedirectPath()` (blocks open redirects: absolute URLs, `//host`, `/\host`, tab tricks, and redirects back to auth pages), `loginUrlFor()`. Client-safe (no server-only imports). Tested against 12 cases, all pass. |
| `src/lib/auth.ts` | Added `minPasswordLength: 8`, `maxPasswordLength: 128`, session `expiresIn` 7 days, `updateAge` 1 day. `nextCookies()` must stay the LAST plugin. |

Also present but **not migrated yet**: the user added `Group`, `GroupMember`,
`GroupInvitation`, enums `GroupRole` and `InvitationStatus`, plus
`User.groupMemberships` / `User.sentInvitations` to `prisma/schema.prisma`.
`package.json` gained `zod` and `server-only`.

Verification at handover: `npx tsc --noEmit` → 0 errors in `src/` (2 errors in
stale `.next/dev/types`, see Gotchas). `eslint` on new files → clean.

**Nothing has been committed.** Ask the user before committing; suggested
commit: `Add auth session helpers, route guard and redirect safety`.

---

## 5. What to do NEXT

Work phase by phase. After each phase: type-check, lint, and tell the user.

### Phase 2 — Login and sign-up pages
- [ ] Route groups: `src/app/(auth)/layout.tsx` (centered card),
      `src/app/(app)/layout.tsx` (nav shell; session-reading part inside
      `<Suspense>`).
- [ ] `src/app/(auth)/login/page.tsx`: server part calls `getSession()`; if a
      valid session exists, `redirect(safeRedirectPath(searchParams.redirect))`.
      Otherwise render `<LoginForm>`.
- [ ] `src/components/auth/login-form.tsx` (client): `signIn.email()` from
      `@/lib/auth-client`, show errors, disable button while pending, on
      success `router.replace(safeRedirectPath(redirectParam))` then
      `router.refresh()`.
- [ ] `src/app/(auth)/signup/page.tsx` + `signup-form.tsx`: `signUp.email()`
      with name, email, password; zod validation matching auth.ts limits.
- [ ] `src/components/auth/sign-out-button.tsx`: `signOut()` then go to `/login`.
- [ ] `src/app/page.tsx`: replace boilerplate with `redirect("/dashboard")`.
- [ ] `src/app/layout.tsx`: title "CirKit".
- [ ] Use existing shadcn `card`, `input`, `label`, `button`.

### Phase 3 — Group schema migration
- [ ] Review the group models already in `schema.prisma` (shape below), run
      `npx prisma format`, then `npx prisma migrate dev --name add-groups`.
- [ ] Add a second migration (`--create-only`, then edit SQL) for a partial
      unique index so a group has exactly one owner:
      `CREATE UNIQUE INDEX "group_member_one_owner" ON "group_member"("groupId") WHERE "role" = 'OWNER';`
- [ ] `npx prisma generate`. Tell the user to open a PR (Pull Request) early —
      teammates need `Group.id` for their foreign keys.

Model shape (already in schema): `Group(id, name, description?, createdAt,
updatedAt)` mapped to `"group"` (SQL keyword — quote it in raw SQL);
`GroupMember(id, groupId, userId, role OWNER|MEMBER, joinedAt)` unique
`(groupId, userId)`; `GroupInvitation(id, groupId, email, invitedById, token
@unique, status PENDING|ACCEPTED|DECLINED|REVOKED|EXPIRED, expiresAt,
createdAt)`.

### Phase 4 — Group backend (`src/server/groups/`)
- [ ] `src/server/errors.ts`: `NotFoundError`, `ForbiddenError`,
      `ConflictError`, `ValidationError`.
- [ ] `group.permissions.ts`: `requireGroupMember(groupId, userId)` (throws
      NotFound if not a member), `requireGroupOwner(groupId, userId)`.
- [ ] `group.queries.ts`: `getUserGroups(userId)`,
      `getGroupDetail(groupId, userId)` (members with name + role, viewer's role),
      `getPendingInvitationsForEmail(email)`.
- [ ] `group.service.ts`:
  - `createGroup(userId, input)` — transaction: group + OWNER membership.
  - `updateGroup(groupId, userId, input)` — owner only.
  - `removeMember(groupId, ownerId, memberUserId)` — owner only; cannot remove
    self; calls `assertNoActiveBorrows`.
  - `leaveGroup(groupId, userId)` — calls `assertNoActiveBorrows`; owner rule
    is an open question (see §7).
  - `assertNoActiveBorrows(groupId, userId)` — **stub that passes** until the
    `BorrowRequest` table exists; leave a `TODO` naming the spec rule.
- [ ] `invitation.service.ts`: `createInvitation` (crypto-random token,
      expiry e.g. 7 days, reject if already a member or a PENDING invite
      exists), `acceptInvitation(token, user)` (transaction; token valid,
      not expired, status PENDING, email matches logged-in user; idempotent on
      double-click), `declineInvitation`, `revokeInvitation`.
- [ ] `src/lib/validation/group.schema.ts`: zod schemas (name 1–80 chars,
      description ≤ 500, email).
- [ ] `group.actions.ts` (`"use server"`): each action = `requireUser()` →
      zod parse → service → `revalidatePath`. Return `{ ok, error }` objects for
      forms; map our error classes to messages.

### Phase 5 — Dashboard (`src/app/(app)/dashboard/page.tsx`)
- [ ] Profile card (name, email), joined groups list linking to
      `/groups/[id]`, "Create Group" dialog, pending invitations list.
- [ ] Recent activity: `src/server/activity/activity.queries.ts` exporting
      `getRecentActivity(userId, limit = 5)` returning `[]` for now, with a
      typed return shape teammates can fill from `BorrowRequest`/`Notification`.
- [ ] Nav links: `/borrowing`, `/my-items` (teammates' pages).

### Phase 6 — Group page
- [ ] `/groups/[groupId]`: name, description, member list with roles, link to
      `/groups/[groupId]/items`, Invite dialog (if permitted), Exit button with
      confirmation. Settings link only for owners.
- [ ] `/groups/[groupId]/settings`: page itself calls `requireGroupOwner`
      (non-owner → notFound). Edit name/description form; members table with
      Remove.
- [ ] `/invites/[token]`: show group name, Accept / Decline.
- [ ] Group Owner boundary: nothing here may edit items or approve borrow
      requests.

### Phase 7 — Verify
- [ ] Call each action as non-member and as plain member → refused.
- [ ] Protected page with no cookie and with an expired session → `/login`.
- [ ] Double-click Create Group / Accept invite → no duplicates.
- [ ] `npm run build` passes (catches missing `<Suspense>` errors).

---

## 6. Gotchas

- **Proxy, not middleware.** File is `src/proxy.ts`, export `proxy`. Next 16
  runs it on the Node.js runtime; do not set `runtime`.
- **`cacheComponents: true`.** Anything that reads `headers()`/cookies (i.e.
  calls `getSession`/`requireUser`) must render inside `<Suspense>`, or
  `next build` errors. Pattern:
  ```tsx
  export default function Page() {
    return <Suspense fallback={<p>Loading…</p>}><Content /></Suspense>;
  }
  async function Content() { const user = await requireUser(); /* ... */ }
  ```
- **Stale `.next/` cache** references a non-existent `src/app/login/page.js`
  and causes 2 `tsc` errors under `.next/dev/types`. Ignore them, or they
  disappear once `src/app/(auth)/login/page.tsx` exists and `npm run dev`
  regenerates types. Check `src/` errors with
  `npx tsc --noEmit | grep '^src/'`.
- **`node_modules` was installed on macOS.** If you run in a Linux sandbox,
  `tsx`/`esbuild` fail with a platform error. Use `node
  --experimental-strip-types` for quick script tests, or run on the user's Mac.
- **`AGENTS.md` block is managed by `next dev`.** Don't remove it.
- **DB changes** follow `notetomyself.md`: edit schema → `npx prisma format` →
  `npx prisma migrate dev --name <name>` → commit `schema.prisma` and
  `prisma/migrations`.
- **Branches:** `feature/...` / `fix/...`; PR into `main` with a teammate
  review.

---

## 7. Open questions (ask the user; do not guess silently)

1. Who can invite — owner only, or any member? (Spec: "permitted users".)
   Until answered, implement owner-only behind one function
   `canInvite(role)` so it's a one-line change.
2. Can the owner leave? Options: must transfer ownership first; or group is
   deleted if they are the last member.
3. Invite delivery for now: in-app list on the invitee's dashboard plus a
   copyable `/invites/[token]` link (Gmail sending is planned later).
4. Removing/leaving with active borrows: block, or allow and keep borrows?
   Spec says this is decided separately — keep `assertNoActiveBorrows` as the
   single place to implement it.




Todo:
      Group logic
      Group page
      Sign out button for the dashboard
      Sign out button for group page