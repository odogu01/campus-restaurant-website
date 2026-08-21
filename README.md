# 🍔 Campus Bites

**A full-stack campus restaurant ordering platform** — connect students with campus food vendors, browse real menus with photos, customize orders with proteins, and track everything from placement to delivery.

🔗 **Live repo:** https://github.com/odogu01/campus-restaurant-website

---

## Table of Contents

1. [What Is This?](#what-is-this)
2. [Why Was It Built?](#why-was-it-built)
3. [Who Is It For?](#who-is-it-for)
4. [Features Overview](#features-overview)
5. [Features by Role](#features-by-role)
6. [Tech Stack](#tech-stack)
7. [Project Structure](#project-structure)
8. [Getting Started](#getting-started)
9. [Environment Variables](#environment-variables)
10. [Database Schema](#database-schema)
11. [Business Rules](#business-rules)
12. [Order Lifecycle](#order-lifecycle)
13. [API Endpoints](#api-endpoints)
14. [Testing](#testing)
15. [Demo Accounts](#demo-accounts)
16. [Known Limitations](#known-limitations)
17. [Future Improvements](#future-improvements)
18. [License](#license)

---

## What Is This?

Campus Bites is a web application that allows students to browse campus restaurants, view menus with photos, place orders with protein customizations (e.g. Jollof rice + goat meat + chicken), and track their orders in real time — all from their phone or laptop.

It is built specifically for the **Nigerian campus food context**, where dishes like Jollof rice, fried rice, and grilled chicken are sold "with protein" — and protein choice and quantity are a core part of every order.

---

## Why Was It Built?

Campus food ordering today is chaotic:

- **No central menu directory** — students walk between restaurants or call vendors to check what's available
- **No order tracking** — "is my food ready?" means calling the vendor
- **Protein confusion** — "which proteins do you have? how much extra is goat meat?" had to be asked every time
- **No trust** — cash-on-delivery with no record of what was ordered or paid
- **Vendor operations are manual** — no system for managing menus, prices, or order queues

Campus Bites solves all of these problems in one platform.

---

## Who Is It For?

| Role | Description |
|------|-------------|
| **Customer** (Student) | Browse restaurants, view menus, customize orders with proteins, place orders, track status, confirm delivery |
| **Vendor** (Restaurant Owner) | Manage restaurant, foods, proteins (with prices), menu items (with photos), accept orders, mark ready |
| **Admin** | Approve/reject vendor applications, promote users, view all orders, backstop status changes |

---

## Features Overview

- 🏪 Restaurant directory with search and cuisine-type filtering
- 📸 Menu items with **2+ photos** (strict requirement)
- 🥩 **Foods & Proteins model** — vendors define foods and proteins with prices
- ⭐ **Primary protein** — preselected default for every item
- 🔄 **Multi-protein** — customers can pick multiple proteins with individual quantities
- 🛒 Shopping cart (localStorage, one restaurant at a time)
- 💳 Checkout with pickup/delivery options and simulated payment
- 📦 **Order lifecycle**: pending → preparing → ready_for_pickup → delivered
- 💰 **Vendor paid** flag — set only when customer confirms delivery
- 👁️ Admin dashboard — vendor approval, user management, order oversight
- 🍽️ "All Foods" page — every dish from every restaurant, searchable
- 🔐 Role-based auth (JWT, bcrypt)
- 📱 Mobile-responsive design (Tailwind CSS)
- ✨ Smooth animations, skeleton loaders, toast notifications

---

## Features by Role

### Customer (Student)

| Feature | Details |
|---------|---------|
| Browse restaurants | Public directory with search and cuisine filter |
| View restaurant menu | Full menu with 2+ photos per item, descriptions, prices |
| Protein picker | See all available proteins with prices; primary protein preselected at qty 1; add more proteins with individual quantities |
| All Foods page | Every dish from every active restaurant, searchable, filterable by restaurant |
| Cart | Items + proteins with quantities; live totals; one restaurant at a time |
| Checkout | Choose pickup or delivery; delivery address required; special instructions; simulated payment |
| Order history | Latest first; status pills (pending/preparing/ready/delivered); protein breakdowns |
| Confirm delivery | Customer-only action; credits the vendor (vendor_paid = 1) |
| Cancel order | Allowed while pending or preparing |
| Account | Register/login; JWT auth; role-aware dashboards |

### Vendor (Restaurant Owner)

| Feature | Details |
|---------|---------|
| Vendor application | Apply with restaurant details; admin approves → generates password |
| Restaurant management | Edit name, description, cuisine type, phone, logo |
| Foods management | Add/remove foods (e.g. Jollof rice, Chapman) |
| Proteins management | Add/remove proteins with prices; set/change ⭐ primary protein; edit prices inline |
| Menu management | Create items from food dropdown; set base price; pick available proteins; upload 2+ photos; toggle availability |
| Order queue | Live orders with customer name, items + proteins, special instructions |
| Accept / Ready | Vendor marks order preparing (accept) or ready_for_pickup |
| Earnings | Dashboard shows earnings totals; "Paid to you ✓" badge on delivered orders |
| One-restaurant rule | Strictly enforced — cannot open a second restaurant |

### Admin

| Feature | Details |
|---------|---------|
| Vendor approval | View pending applications; approve (generates dev password) or reject with comment |
| User management | Promote users to restaurant_owner role |
| Order oversight | View all orders across every restaurant (read-only) |
| Backstop | Can force any valid status transition on an order |

---

## Tech Stack

### Backend
- **Node.js** + **Express** (REST API, port 5000)
- **TiDB Cloud** (MySQL-compatible, TLS) via **mysql2/promise**
- **JWT** authentication with **bcrypt** password hashing
- **express-validator** for request validation
- **Multer** for file uploads (menu item photos)
- **dotenv** for environment configuration

### Frontend
- **Static HTML** (one page per screen)
- **Tailwind CSS** via CDN (utility classes, custom animations)
- **Vanilla JavaScript** (no framework, no build step)
- **localStorage** for cart and auth state

### Database
- Relational schema with full foreign keys and constraints
- Transactions for money-related operations (order placement, primary-protein switching)
- Snapshots in order_item_proteins (so past orders survive menu changes)

### Dev Tools
- **nodemon** (auto-restart on changes)
- Custom **Node test scripts** (144/144 checks passing)
- **Git + GitHub** (public repo)

---

## Project Structure

```
campus-restaurant-website/
├── README.md                          # This file
├── .gitignore                         # Ignores .env, uploads/, node_modules/
│
├── backend/
│   ├── .env                           # Database URL, JWT secret, payment flag (NOT in git)
│   ├── server.js                      # Express app entry point
│   ├── package.json                   # Dependencies (express, mysql2, bcrypt, jsonwebtoken, etc.)
│   │
│   ├── schema.sql                     # Full database schema (tables, constraints, indexes)
│   │
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                  # MySQL2 connection pool
│   │   │   └── uploads.js            # Multer config, publicUrl helper, file cleanup
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js               # protect (JWT), requireRole, optionalAuth
│   │   │   └── ownership.js          # requireItemRestaurantOwner, requireFoodOwner, requireProteinOwner
│   │   │
│   │   ├── routes/
│   │   │   ├── authRoutes.js         # POST /api/auth/register, /api/auth/login, /api/auth/me
│   │   │   ├── restaurantRoutes.js   # CRUD restaurants + menu + foods + proteins
│   │   │   ├── orderRoutes.js        # POST/GET/PUT orders, cancel
│   │   │   ├── vendorRoutes.js       # GET /api/vendor/restaurants, /api/vendor/orders
│   │   │   ├── adminRoutes.js        # Vendor requests, user role management, orders
│   │   │   └── vendorRequestRoutes.js # POST /api/vendor-requests (public apply)
│   │   │
│   │   ├── controllers/
│   │   │   ├── authController.js     # Register, login, me
│   │   │   ├── restaurantController.js # Restaurant CRUD + foods/proteins endpoints
│   │   │   ├── menuController.js     # Menu item CRUD (food dropdown, proteins, images)
│   │   │   ├── orderController.js    # Place order, list/detail, status transitions, vendor orders
│   │   │   ├── vendorController.js   # Vendor restaurant list, vendor orders
│   │   │   ├── adminController.js    # Vendor requests, user roles, all orders
│   │   │   └── vendorRequestController.js # Public vendor application
│   │   │
│   │   └── index.js                   # Mounts all routes on Express app
│   │
│   ├── scripts/
│   │   ├── migrate-vendor-paid.js    # Adds orders.vendor_paid column
│   │   ├── migrate-foods-proteins.js # Creates foods, proteins, menu_item_proteins, order_item_proteins; adds menu_items.food_id; drops category
│   │   ├── reset-test-data.js        # Wipes test data (FK-safe order), keeps real accounts
│   │   ├── seed-demo-data.js         # Creates demo customer + admin accounts
│   │   ├── restaurant-flow-test.js   # 80 checks: restaurant, menu, foods, proteins CRUD
│   │   ├── order-flow-test.js        # 44 checks: order placement, proteins, lifecycle, cancel
│   │   └── vendor-flow-test.js       # 20 checks: vendor request → approve → login flow
│   │
│   └── uploads/                      # Menu item images (git-ignored)
│
└── frontend/
    └── public/                        # Served by Express static middleware
        ├── favicon.svg               # 🍔 on amber background
        ├── index.html                # Homepage
        ├── restaurants.html          # Public restaurant directory
        ├── menu.html                 # Per-restaurant menu (inline JS with protein picker)
        ├── foods.html                # "All Foods" page (every dish from every restaurant)
        ├── cart.html                 # Shopping cart (inline JS with protein steppers)
        ├── checkout.html             # Checkout with order type, address, summary
        ├── orders.html               # Customer order history (inline JS)
        ├── login.html                # Login form
        ├── register.html             # Registration form
        ├── vendor-apply.html         # Public vendor application form
        ├── vendor-dashboard.html     # Vendor dashboard (restaurant, foods/proteins, menu, orders)
        ├── admin.html                # Admin dashboard (vendor requests, users, orders)
        │
        ├── css/
        │   └── style.css            # Custom animations, skeleton loaders, flash effects
        │
        └── js/
            ├── api.js               # Fetch wrapper (apiGet, apiPost, apiPut, apiDelete), token mgmt
            ├── main.js              # Header/footer injection, cart badge, toasts, page registration
            ├── cart.js              # localStorage cart (foods + proteins, merge, totals)
            ├── vendor.js            # Vendor dashboard logic (restaurant, foods/proteins, menu, orders)
            ├── admin.js             # Admin dashboard logic
            ├── orders.js            # Customer order history logic
            ├── checkout.js          # Checkout summary + order placement
            └── foods.js             # "All Foods" page logic (search, restaurant filter)
```

---

## Getting Started

### Prerequisites

- **Node.js** (v16+ recommended)
- **npm**
- A **TiDB Cloud** account (or any MySQL-compatible database)
- **Git**

### 1. Clone the repository

```bash
git clone https://github.com/odogu01/campus-restaurant-website.git
cd campus-restaurant-website
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Set up the database

1. Create a TiDB Cloud cluster (free tier works)
2. Copy your connection string
3. Create `.env` in the `backend/` folder:

```env
DB_URL=mysql://username:password@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/campus_restaurant
JWT_SECRET=your_random_secret_here
PAYMENT_ENABLED=false
```

4. Initialize the schema:

```bash
mysql -u root -p < schema.sql
```

5. Run migrations (in order):

```bash
node scripts/migrate-vendor-paid.js
node scripts/migrate-foods-proteins.js
```

### 4. Seed demo data

```bash
node scripts/seed-demo-data.js
```

This creates:
- `admin@campus.com` / `admin123`
- `customer@test.com` / `password123`

### 5. Start the server

```bash
npm run dev
```

The server runs on **http://localhost:5000**. Open `http://localhost:5000` in your browser.

### 6. Create a vendor account

1. Go to **Vendor Application** page
2. Fill in your restaurant details
3. Go to the admin panel (`http://localhost:5000/admin.html`) and log in as `admin@campus.com`
4. Approve the vendor request — a dev password is generated
5. Log in as the vendor with the generated password

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_URL` | MySQL/TiDB connection string | `mysql://user:pass@host:4000/db?ssl-mode=REQUIRED` |
| `JWT_SECRET` | Secret key for JWT token signing | `any_random_string_here` |
| `PAYMENT_ENABLED` | Set to `true` to enable real Paystack payments (currently `false` = simulated) | `false` |

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | All users (customers, vendors, admins) with roles |
| `vendor_requests` | Vendor applications (pending/approved/rejected) |
| `restaurants` | One per vendor (strict); has name, cuisine, logo, is_active |
| `foods` | Foods a restaurant sells (e.g. "Jollof Rice") — referenced by menu items |
| `proteins` | Proteins with prices; exactly one **primary** per restaurant |
| `menu_items` | Items on the menu (FK → foods for name, price, is_available) |
| `menu_item_images` | 2+ photos per item (ordered by position) |
| `menu_item_proteins` | Which proteins are available with each item (junction) |
| `orders` | Customer orders (status, total, vendor_paid flag) |
| `order_items` | Lines within an order (menu_item, quantity, unit_price) |
| `order_item_proteins` | Protein selections per line (snapshotted name + price at order time) |

### Key Relationships

```
users ──< restaurants          (one vendor owns one restaurant)
restaurants ──< foods         (one restaurant sells many foods)
restaurants ──< proteins      (one restaurant has many proteins)
foods ──< menu_items          (one food becomes many menu items)
menu_items ──< menu_item_images    (each item has 2+ photos)
menu_items ──< menu_item_proteins  (each item has available proteins)
restaurants ──< orders        (one restaurant receives many orders)
menu_items ──< order_items    (each order references menu items)
order_items ──< order_item_proteins (snapshotted protein choices)
```

---

## Business Rules

### Invariants (Strictly Enforced)

1. **One restaurant per vendor** — enforced by unique DB constraint; a second attempt returns 409
2. **Every menu item needs ≥ 2 photos** — create and photo-replacement; failed uploads are cleaned off disk
3. **Exactly one primary protein per restaurant** — transactional; first protein forced primary; switching clears old; deleting primary auto-promotes oldest
4. **Item names come from the restaurant's foods list** — no free-typed names; switching the food renames the item
5. **Proteins are per-item** — customers can only order proteins the vendor attached to that item; foreign/invalid proteins are rejected (400)
6. **No proteins sent → primary protein auto-added (qty 1)** — so "Jollof rice" always includes the default protein
7. **No delivery fee** — totals = item qty × price + Σ protein qty × price
8. **Food with menu items cannot be deleted** — RESTRICT FK; must delete menu items first
9. **Menu item with past orders cannot be deleted** — RESTRICT FK; must set unavailable instead

### Role-Based Status Transitions

| From | Allowed next | Who can do it |
|------|-------------|---------------|
| `pending` | `preparing`, `cancelled` | Vendor (accept), Customer (cancel), Admin |
| `preparing` | `ready_for_pickup`, `cancelled` | Vendor (ready), Customer (cancel), Admin |
| `ready_for_pickup` | `delivered` | **Customer only** (confirms delivery) |
| `delivered` | *(terminal)* | — |
| `cancelled` | *(terminal)* | — |

**vendor_paid = 1** is set **only** when the customer confirms delivery.

### Payment

- `PAYMENT_ENABLED=false` (default): payment is simulated, orders are marked `paid` immediately
- `PAYMENT_ENABLED=true`: real Paystack integration (not implemented yet — ready to flip)

---

## Order Lifecycle

```
Customer places order
        │
        ▼
   ┌─────────┐
   │ pending  │  ← customer sees "awaiting vendor acceptance"
   └────┬─────┘
        │ vendor ACCEPTS
        ▼
   ┌───────────┐
   │ preparing │  ← vendor is preparing the food
   └─────┬─────┘
        │ vendor marks READY
        ▼
   ┌─────────────────┐
   │ ready_for_pickup │  ← customer sees "order is ready"
   └────────┬────────┘
        │ customer CONFIRMS DELIVERY
        ▼
   ┌───────────┐
   │ delivered  │  ← vendor_paid = 1, "Paid to you ✓"
   └───────────┘
```

At any point before `delivered`, the **customer** can cancel (while `pending` or `preparing`).

---

## API Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Public | Register new customer |
| POST | `/api/auth/login` | Public | Login, returns JWT + user |
| GET | `/api/auth/me` | Required | Get current user profile |

### Restaurants (Public)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/restaurants` | Public | List active restaurants (search, cuisine filter) |
| GET | `/api/restaurants/:id` | Public | Restaurant detail + full menu |

### Menu Items (Public)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/menu-items` | Public | All available items across restaurants (search, restaurant filter) |
| GET | `/api/restaurants/:id/menu` | Public | All items for a restaurant (including unavailable) |

### Vendor (Restaurant Owner)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/vendor/restaurants` | Vendor | Get vendor's restaurant(s) |
| POST | `/api/vendor-requests` | Public | Apply as a vendor |
| POST | `/api/restaurants` | Vendor | Create restaurant (first only) |
| PUT | `/api/restaurants/:id` | Vendor (owner) | Update restaurant |
| DELETE | `/api/restaurants/:id` | Vendor (owner) | Soft-delete restaurant |
| POST | `/api/restaurants/:id/foods` | Vendor (owner) | Add food |
| DELETE | `/api/foods/:id` | Vendor (owner) | Delete food |
| POST | `/api/restaurants/:id/proteins` | Vendor (owner) | Add protein (name, price, is_primary) |
| PUT | `/api/proteins/:id` | Vendor (owner) | Update protein (price, is_primary) |
| DELETE | `/api/proteins/:id` | Vendor (owner) | Delete protein |
| POST | `/api/restaurants/:id/menu` | Vendor (owner) | Create menu item (multipart, ≥2 images) |
| PUT | `/api/menu/:id` | Vendor (owner) | Update menu item |
| DELETE | `/api/menu/:id` | Vendor (owner) | Delete menu item |
| GET | `/api/vendor/orders` | Vendor | List orders for vendor's restaurant |
| PUT | `/api/orders/:id/status` | Vendor (owner) | Accept (pending→preparing) or mark ready (preparing→ready_for_pickup) |

### Customer

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/orders` | Customer | Place order (with proteins) |
| GET | `/api/orders` | Customer | List own orders (latest first) |
| GET | `/api/orders/:id` | Customer | Order detail with items + proteins |
| PUT | `/api/orders/:id/cancel` | Customer | Cancel order (pending/preparing only) |
| PUT | `/api/orders/:id/status` | Customer | Confirm delivery (ready_for_pickup→delivered) |

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/vendor-requests` | Admin | List vendor requests (status filter) |
| PUT | `/api/admin/vendor-requests/:id` | Admin | Approve or reject vendor request |
| PUT | `/api/admin/users/:id/role` | Admin | Promote user to restaurant_owner |
| GET | `/api/orders` | Admin | View all orders |
| PUT | `/api/orders/:id/status` | Admin | Force any valid status transition |

---

## Testing

### Running Tests

```bash
cd backend

# Reset test data + seed demo accounts
node scripts/reset-test-data.js
node scripts/seed-demo-data.js

# Run individual test suites
node scripts/restaurant-flow-test.js    # 80 checks
node scripts/order-flow-test.js         # 44 checks
node scripts/vendor-flow-test.js        # 20 checks
```

### Full Regression

```bash
node scripts/reset-test-data.js && node scripts/seed-demo-data.js && node scripts/restaurant-flow-test.js
node scripts/reset-test-data.js && node scripts/seed-demo-data.js && node scripts/order-flow-test.js
node scripts/reset-test-data.js && node scripts/seed-demo-data.js && node scripts/vendor-flow-test.js
node scripts/reset-test-data.js && node scripts/seed-demo-data.js   # final clean state
```

**Current status: 144/144 checks passing** (80 + 44 + 20)

### What Tests Cover

| Suite | Checks |
|-------|--------|
| **restaurant-flow** | Public listing, search, filters, one-restaurant rule, restaurant CRUD, ownership, foods CRUD, proteins CRUD + primary rules, menu items (food_id, protein_ids, ≥2 images, switch food), all-foods page, availability toggle |
| **order-flow** | Place order with proteins, protein totals, default primary auto-add, invalid/foreign protein rejection, protein quantity validation, order detail with protein breakdowns, full lifecycle (pending→preparing→ready→delivered), vendor_paid flag, cancellation, admin backstop |
| **vendor-flow** | Vendor application, duplicate request blocked, admin approve/reject, vendor login with dev password, role promotion |

---

## Demo Accounts

| Account | Email | Password | Role |
|---------|-------|----------|------|
| Admin | `admin@campus.com` | `admin123` | admin |
| Customer | `customer@test.com` | `password123` | customer |
| Vendor | Create via Vendor Application page | Generated on approval | restaurant_owner |

> **Note:** After running tests, always re-seed with `node scripts/reset-test-data.js && node scripts/seed-demo-data.js` to restore demo accounts.

---

## Known Limitations

1. **No real payment gateway** — payment is simulated; ready to enable via `PAYMENT_ENABLED=true` + Paystack keys
2. **No email service** — vendor passwords are shown to the admin (email delivery is a future hook)
3. **No real-time updates** — order status requires page refresh (no WebSockets)
4. **No delivery tracking** — delivery address is collected but not used for routing
5. **No image optimization** — photos are stored as-is (could add resizing/compression)
6. **No search by protein** — the All Foods page searches by item name only
7. **No restaurant reviews/ratings**
8. **No order history export**

---

## Future Improvements

- [ ] Real Paystack integration (flip `PAYMENT_ENABLED=true`)
- [ ] Email notifications (order confirmed, order ready, vendor approval)
- [ ] WebSocket real-time order updates
- [ ] Delivery tracking with map integration
- [ ] Image optimization (resize, compress, WebP)
- [ ] Search by protein type
- [ ] Restaurant reviews and ratings
- [ ] Order history export (PDF/CSV)
- [ ] Admin analytics dashboard
- [ ] Multi-language support

---

## License

This project was built as part of the **Benison Project** by NJOKU.

---

**Built with ❤️ for campus food lovers everywhere.**
