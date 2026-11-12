# Project Handover & Specification Document

## 1. Overview for the Agent
You are assisting in building a **Group-Based Item Sharing & Borrowing System**. This document contains:
1. **Your Immediate Scope of Work** (the features we are building right now, starting with the Login page).
2. **Full System Architecture & Business Rules** (the global context so our data models, API contracts, and permissions align with the rest of the team).

---

## 2. Immediate Scope of Work (Current Developer Tasks)
We are responsible for **Authentication**, the **User Dashboard / Profile**, and the **Group Page**. We need to start by building the **Login Page & Authentication Flow**, followed by the Dashboard and Group views.

### Phase 1: Login Page & Authentication (START HERE)
* **Requirement:** Users must be logged in to access any business pages (Dashboard, Groups, Items, Borrowing).
* **Behavior:**
  * Unauthenticated users attempting to access protected routes must be redirected to `/login`.
  * Upon successful login, redirect the user to the **Dashboard / Profile** page.
  * **Crucial Security Rule:** All critical permission and authentication checks must be enforced on the **backend**, not just the frontend UI.

### Phase 2: Dashboard / Profile Page
* **User Profile Info:** Display the logged-in user's name/profile summary.
* **Joined Groups Section:** 
  * Display a list of groups the user has already joined.
  * Include a **"Create Group"** button (can live here on the Dashboard and/or on the Group Page).
* **Recent Item Activity:** Display up to the **5 most recent** item activities (e.g., recent borrow requests, approvals, returns, or status updates related to the user).
* **Navigation Entries:** Provide clear navigation links/buttons to:
  * Individual Group Pages
  * Borrowing Items Page (`/borrowing`)
  * My Items Page (`/my-items`)

### Phase 3: Group Page
* **Group Information:** Display Group Name, Group Description, and Member List.
* **Shared Items Entry / List:** Display a preview or a direct entry link to the **Group Items Access Page** (which lists all non-archived items currently shared with this group).
* **Member Actions:**
  * **Invite Button:** Allow permitted users to invite new members to the group.
  * **Exit Button:** Allow a member to leave the group. *(Note: Detailed edge-case rules for exiting/removing members when active borrows exist will be finalized separately, but the UI/endpoint structure should be prepared).*
* **Group Owner Exclusive View (Admin Settings):**
  * Only visible and accessible if the logged-in user's role in this group is `Group Owner`.
  * Features inside Admin Settings: Edit group name/description, manage members (e.g., kick/remove members).
  * **Important Boundary:** Being a `Group Owner` only grants administrative rights over the group and its membership. It does **NOT** grant permission to edit other members' items or approve/decline borrow requests for their items.

---

## 3. Global System Context & Business Rules
*Note to Agent: Even though other team members are building the Item and Borrowing pages, our database schemas, API responses, and activity feeds must strictly adhere to the global rules below.*

### 3.1 User Roles & Permissions
The system distinguishes three contextual roles (a single user can hold different roles depending on the group or item):

| Role | Responsibilities & Permissions |
| :--- | :--- |
| **Group Owner** | Manages the group settings and group members. **Does NOT** automatically gain edit rights or borrow-approval rights over other members' items. |
| **Item Owner** | Manages items they created and processes incoming borrow requests for those items. Can share an item with one or more groups they belong to, and revoke group access when rules permit. |
| **Borrower** | Requests and borrows items owned by other users within shared groups. Cannot request to borrow their own items. |

### 3.2 Complete Page Architecture (Reference)
1. **Login Page:** Entry point; redirects to Dashboard on success.
2. **Dashboard / Profile:** User name, joined groups, max 5 recent item activities, "Create Group" action, navigation to Groups, Borrowing Items, and My Items.
3. **Group Page:** Group info, member list, entry to shared items, Invite/Exit buttons, and Group Owner Admin Settings.
4. **Group Items Access Page:** Shows all non-archived items shared with the current group. Members can browse (photo, name, description, category, condition), search by name, filter (by category, owner, availability), view status, and submit a borrow Request (via modal/expandable UI) by selecting dates.
5. **Borrowing Items Page:** Shows items the current user has requested from others (`Pending`, `Approved`, `Declined`, `Cancelled`, `Completed`). Users can `Cancel` or `Return` when permitted. Must keep a record of every individual request (since a user may borrow the same item multiple times).
6. **My Items Page:** Shows items owned by the current user, split into:
   * *Active Items:* Items currently having `Pending` requests, `Approved` reservations, or currently `Borrowed`.
   * *Inactive Items:* Non-archived items with no active requests/borrows (still open to groups and can receive requests).
   * Includes entry to create items, view archived items, and click into the Single Item Page.
7. **Single Item Page (Item Owner Only):** Edit item details, view status, grant/revoke group access, view incoming requests, Approve/Decline requests, record item handover ("handed over"), view borrow history, and archive the item.

### 3.3 Date Rules (V1: Daily Reservations)
* Borrowers must select a `start_date` and `end_date` (inclusive).
* Same start and end date = 1 day (minimum borrow duration is 1 day).
* `start_date` cannot be earlier than "today"; `end_date` cannot be earlier than `start_date`.
* Frontend and backend must use a unified timezone/date standard for "today".
* Dates cannot be modified after submission (must cancel and re-apply).
* A `Pending` request whose `start_date` has already passed cannot be approved.

### 3.4 Single-Reservation Locking Rule
To prevent delays from a previous borrower affecting a subsequent reservation, **an item can have at most ONE `Approved` (and uncompleted) request at any time.**
1. An unlocked, unborrowed, non-archived item can receive multiple `Pending` requests across multiple groups.
2. When the Item Owner **Approves** one request:
   * All other `Pending` requests for that item (even from other groups or with non-overlapping dates) are **automatically set to `DECLINED`**.
   * The item becomes **locked** and accepts no new requests (even if the approved reservation is for future dates).
3. The lock is released only when the reservation is cancelled prior to handover, or when the item is returned (`COMPLETED`). Automatically declined requests do not auto-restore; users must apply again.

### 3.5 Request Lifecycle & State Machine
**5 Request States:**
* `PENDING`: Waiting for Item Owner action.
* `APPROVED`: Approved by Owner (may be waiting for physical handover, or currently handed over/in use).
* `DECLINED`: Rejected by Owner, or auto-rejected because another request was approved / item was archived / group access was revoked.
* `CANCELLED`: Cancelled by Borrower before physical handover.
* `COMPLETED`: Borrower clicked `Return` after using the item.

**State Transitions:**
```text
PENDING ──(Approve)──→ APPROVED ──(Return)──→ COMPLETED
   │                      │
   ├──(Decline)──→ DECLINED└──(Cancel before handover)──→ CANCELLED
   │
   └──(Cancel)───→ CANCELLED
```

**Operation Permissions:**
* **Submit Request (Borrower):** Must have group access, not be the Item Owner, and item must be open for requests.
* **Approve (Item Owner):** Request is `PENDING`, dates are valid (`start_date >= today`), item is not locked.
* **Decline (Item Owner):** Request is `PENDING`.
* **Cancel (Borrower):** Request is `PENDING`, OR request is `APPROVED` **but not yet handed over**. (Once handed over, it cannot be cancelled—only returned).
* **Record Handover (Item Owner):** Request is `APPROVED` and not yet handed over.
* **Return (Borrower):** Item has been handed over. Clicking `Return` immediately transitions the request to `COMPLETED` and unlocks the item (no extra Owner confirmation step in V1).

### 3.6 Item Status vs. Request Availability
An Item has two core statuses:
* `AVAILABLE`: Not physically handed over yet.
* `BORROWED`: Physically handed over to the borrower.

| Phase | Request Status | Item Status | Accepts New Requests? |
| :--- | :--- | :--- | :--- |
| Waiting for approval | `PENDING` | `AVAILABLE` | **Yes** |
| Approved, before handover | `APPROVED` | `AVAILABLE` (Locked by reservation) | **No** |
| Owner records handover | `APPROVED` | `BORROWED` | **No** |
| Borrower clicks Return | `COMPLETED` | `AVAILABLE` (Unlocked) | **Yes** |
| Cancelled before handover | `CANCELLED` | `AVAILABLE` (Unlocked) | **Yes** |

*Note: If a borrow exceeds `end_date`, the item stays `BORROWED` and the request stays `APPROVED`. The system never auto-returns an item based on date alone.*

### 3.7 Group Access & Archiving Rules
* **Multi-Group Sharing:** An item belongs to its creator and can be shared with multiple groups via a join table (`ItemGroupAccess`).
* **Revoking Group Access:**
  * Allowed if that group has no active requests.
  * Allowed if that group only has `PENDING` requests (automatically sets those `PENDING` requests to `DECLINED`).
  * **Forbidden** if that group has an `APPROVED` request or unreturned borrow.
* **Archiving Items (No hard delete in V1):**
  * Hides the item from all groups and stops new requests while preserving history.
  * Allowed if there are no `APPROVED`/borrowed states (any `PENDING` requests are auto-declined).
  * **Forbidden** if the item has an `APPROVED` reservation or is currently `BORROWED`.

---

## 4. Database Schema & Data Alignment Requirements
Ensure our models align with the team's unified database entities:

1. **User & Auth Tables:** User identity, credentials, and session/token management.
2. **Group, GroupMember & Invitation Tables:** Group details (`name`, `description`), member roles (`OWNER`, `MEMBER`), and invitations.
3. **Item Table:** `owner_id`, metadata (`name`, `description`, `category`, `condition`), `status` (`AVAILABLE`, `BORROWED`), `is_archived` boolean.
4. **ItemGroupAccess Table:** Many-to-many relationship linking `item_id` and `group_id`.
5. **BorrowRequest Table:**
   * `id`, `item_id`, `borrower_id`, `source_group_id`
   * `start_date`, `end_date`
   * `status` (`PENDING`, `APPROVED`, `DECLINED`, `CANCELLED`, `COMPLETED`)
   * `created_at`, `updated_at`, `handed_over_at` (nullable), `returned_at` (nullable)
6. **ItemPhoto Table:** Photos associated with items.
7. **Notification Table:** For system notifications and activity feeds.

*Design Principle:* Derived states like `Active` vs. `Inactive` items, reservation locks, and whether an item accepts new requests should be **computed from existing records** rather than stored as redundant boolean flags that might go out of sync.

---

## 5. Backend Consistency & Concurrency Requirements
When implementing backend controllers and services:
* **Server-Side Validation:** Always verify user authentication, group membership/ownership, item ownership, date validity, and state transitions on the backend.
* **Database Transactions:** Use atomic transactions for multi-step state changes (e.g., Approving a request + auto-declining competing `PENDING` requests + locking the item) and prevent race conditions (double-approvals or rapid double-clicks).

---

## 6. Next Steps for the Agent
Please begin by inspecting our current project repository structure (tech stack, existing database schema/ORM, and routing setup) and propose the implementation plan for:
1. **Step 1:** User Authentication & Login Page (`/login` + auth middleware/guards).
2. **Step 2:** User Dashboard / Profile Page (`/dashboard`) displaying user info, joined groups (with "Create Group"), and recent 5 item activities.
3. **Step 3:** Group Page (`/groups/:id`) with shared items entry, Invite/Exit actions, and the conditional Group Owner Admin Settings view.