# 🍕 GastroApp — Restaurant POS, Inventory & Kitchen Display System (KDS)

> **Project Status:** `HIBERNATED / PARKED 🧊`  
> GastroApp is in a stable, verified, and operational state. Core restaurant operations, inventory management, guest ordering, and kitchen workflows are fully functional. The project is temporarily parked pending upcoming marketing, business development, and client rollouts.

[![Angular](https://img.shields.io/badge/Angular-20.0-DD0031?style=flat&logo=angular)](https://angular.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-12.0-FFCA28?style=flat&logo=firebase)](https://firebase.google.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?style=flat&logo=nodedotjs)](https://nodejs.org/)

---

## 📖 About GastroApp

**GastroApp** is a modern, full-stack multi-tenant SaaS application tailored for the food and hospitality industry (pizzerias, restaurants, bars, and cafes). Built with **Angular 20** and powered by **Google Firebase** (Cloud Firestore, Authentication, Hosting, and Cloud Functions), it delivers real-time synchronisation across the kitchen, front-of-house staff, and dining guests.

The platform provides instant self-service onboarding: upon registration, each new restaurant owner is automatically provisioned with a starter inventory, curated recipes, and a dining room layout, allowing immediate hands-on exploration without manual setup.

---

## 🌟 Key Features

### 1. 📦 Real-Time Inventory Control
* **Precise Stock Tracking:** Monitor ingredient levels in grams (`g`), millilitres (`ml`), or units (`szt`).
* **Visual Status Indicators:** Automatic classification into *In Stock*, *Low Stock Warning*, and *Out of Stock*.
* **Automated Stock Deduction:** Submitting an order automatically deducts the exact recipe quantities from raw inventory in real time.
* **Quick Restock & Delivery Batches:** Perform instant one-click stock adjustments or bulk deliveries.
* **Deduplication Engine:** Automatically resolves and merges duplicate ingredients to preserve database hygiene.

### 2. 🍕 Recipe Book & Dynamic Capacity Engine
* **Recipe Costing & Ingredients:** Link dishes directly to raw inventory items with defined portion weights.
* **Live Capacity Engine:** Computes in real time exactly how many portions of any dish can be prepared based on currently available inventory.
* **Auto-Sold-Out Protection:** Automatically marks dishes as unavailable on the menu when essential ingredients run out, preventing orders for out-of-stock items.

### 3. 📱 Guest QR Menu & Mobile Self-Ordering
* **Public QR Access:** Accessible at `/menu` or `/menu/:restaurantId` without requiring an account. Designed for on-table QR code stickers.
* **Flexible Order Modes:** Supports dine-in table ordering and takeout.
* **Guest Cart & Live Status Tracker:** Real-time multi-round order status updates (*Queued* ➔ *Cooking* ➔ *Ready* ➔ *Served*).
* **Payment Selection:** Built-in support for cash, card, and simulated instant mobile payments.

### 4. 📋 Kitchen Display System & Orders Kanban (KDS)
* **Real-Time Kanban Board:** Powered by Firestore reactive subscriptions (`onSnapshot`), reflecting updates across devices with sub-second latency.
* **Workflow Stages:** *Pending* ➔ *In Preparation (Kitchen)* ➔ *Ready for Pickup* ➔ *Completed / Paid*.
* **Kitchen Timers & Alerts:** Live elapsed time indicators to highlight delayed orders and optimize kitchen throughput.

### 5. 🪑 Floor Plan & Table Management
* **Interactive Table Map:** Visual layout of all tables, seating capacities, and active orders.
* **Real-Time Bill Aggregation:** Multi-round ordering automatically links new tickets to the table's running bill.
* **Table Lifecycle:** Tracks statuses seamlessly: *Free*, *Occupied*, *Bill Requested*, and *Needs Cleaning*.

### 6. 👥 Role-Based Simulator & Staff Management
* **Quick-Switch Simulator in Topbar:** Allows owners to preview and test the exact UI permissions and views of different team roles:
  * **Owner (Full Access):** Complete administrative access, billing, analytics, and settings.
  * **Floor Manager:** Dining room, floor plan, inventory, and order operations.
  * **Waiter / Cashier:** Table POS, order creation, and payment collection.
  * **Kitchen / Chef (KDS):** Focused high-contrast kitchen preparation view.
  * **Guest Simulator (QR):** Simulates a dining customer placing an order from Table 1.

### 7. 🌿 Zero-Waste Smart Recommendations
* **Automated Waste Prevention:** Analyzes ingredients with high surplus inventory and recommends targeted promotional discounts (e.g. *Zero Waste: Pizza Margherita -20%*) to accelerate turnover before ingredients expire.

---

## 🏗️ Architecture & Security

### Hardened Firestore Security Rules (`firestore.rules`):
* **Strict Multi-Tenant Isolation:** All operational documents (`inventory`, `recipes`, `orders`, `tables`, `staff`, `promotions`) are keyed to `restaurantId`. Tenants are strictly restricted to reading and writing their own data.
* **Cross-Tenant Leak Prevention:** Order listing (`allow list`) is guarded so no authenticated user can inspect tickets belonging to another restaurant.
* **Public QR Menu Access with DoS Protection:** Guests can read public menu items and calculate dish capacity without logging in, guarded by query limits (`request.query.limit <= 200`) to prevent unbounded database scraping.
* **Payload Validation:** Enforces strict domain validation on guest order submissions (price limits, maximum item count, `'pending'` status restriction).

### Cloud Costs & Free-Tier Sustainability:
* In its parked/idle state, GastroApp runs comfortably within the **Firebase Spark Plan (100% Free Tier)** with zero ongoing hosting or database infrastructure costs.

---

## 🚀 Quickstart & Local Setup

### 1. Prerequisites
* **Node.js:** `v20.x LTS` (managed via [.nvmrc](file:///.nvmrc))
* **npm:** `>= 10.0.0`
* **Angular CLI:** `npm install -g @angular/cli@20`

### 2. Installation
```bash
# Clone the repository
git clone <YOUR_REPOSITORY_URL>
cd gastro-app

# Switch to the supported Node.js version
nvm use

# Install dependencies
npm install
```

### 3. Firebase Configuration
1. Create your local environment configuration file:
   ```bash
   cp src/environments/environment.example.ts src/environments/environment.ts
   ```
2. Replace the placeholder values in `src/environments/environment.ts` with your web app keys from the [Firebase Console](https://console.firebase.google.com/).
3. Deploy the security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

### 4. Running the Development Server
```bash
npm start
# or: ng serve
```
Navigate your browser to [http://localhost:4200/](http://localhost:4200/). The application will automatically reload if source files change.

---

## 🔑 Demo & Testing Account

GastroApp includes a fully populated demo restaurant (*Pizzeria Bella Napoli*):

* **Email:** `demo@gastroapp.pl`
* **Password:** *(As provisioned in your Firebase Authentication project)*
* **"Reset Demo Data" Button:** Located in the navigation bar to instantly restore starter recipes, inventory stocks, and active orders to their initial state.

Anyone can also register a brand new free account on the `/register` screen — the onboarding engine will automatically seed default ingredients, recipes, and dining tables for the new account.

---

## ⏸️ Hibernation Notes ("Where I Left Off")

| Domain | Status | Notes |
| :--- | :---: | :--- |
| **Inventory & Stock Tracking** | ✅ 100% Complete | Full CRUD, real-time auto-deductions, unit conversions |
| **Recipe Management & Capacity** | ✅ 100% Complete | Real-time capacity calculation engine, ingredient linkage |
| **KDS Orders Kanban** | ✅ 100% Complete | Reactive ticket queue, stage transitions, refunds |
| **Dining Room Floor Plan** | ✅ 100% Complete | Interactive SVG/CSS table statuses, merged bills |
| **Guest QR Ordering** | ✅ 100% Complete | Mobile ordering flow, multi-round session tracking |
| **Auth & Security** | ✅ 100% Complete | Multi-tenant isolation, hardened Firestore rules, role simulator |
| **Online Payments (Stripe)** | ⏸️ Paused | The payment configuration tab in settings is temporarily locked. Orders operate in cash/simulated mode until live Stripe API credentials and webhooks are configured. |

### 🎯 Next 3 Steps Upon Resuming the Project:
1. **Activate Online Payments:** Unlock the Stripe settings tab in `AccountSettingsModalComponent` and deploy production Stripe webhook listeners in `/functions`.
2. **Production Domain & Hosting:** Connect a custom domain to Firebase Hosting (`firebase.json`).
3. **Pilot Launch:** Onboard initial local restaurants and gather user feedback.

---

## 📄 License
Private project. Prepared for commercial SaaS deployment or private licensing.
