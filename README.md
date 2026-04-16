# REKKER OPS PLATFORM

A world-class modular operations platform for Rekker Limited.
Dark industrial design · MERN stack · Role-based access control

---

## PROJECT STRUCTURE

```
rekker-ops/
├── server/                  ← Node.js + Express + MongoDB API
│   ├── index.js
│   ├── seed.js              ← Run once to create Super Admin
│   ├── .env.example
│   ├── middleware/auth.js
│   ├── models/
│   │   ├── User.js
│   │   ├── LPO.js
│   │   ├── BuyerStatus.js
│   │   └── ResponsiblePerson.js
│   └── routes/
│       ├── auth.js
│       ├── users.js
│       ├── lpos.js
│       ├── buyer.js
│       ├── persons.js
│       └── reports.js
│
└── client/                  ← React + Vite + Tailwind 3.4
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── index.css
        ├── lib/
        │   ├── api.js       ← Axios instance
        │   └── utils.js     ← cn() helper
        ├── store/
        │   └── authStore.js ← Zustand auth state
        ├── components/
        │   ├── ui/          ← shadcn components
        │   ├── layout/      ← Sidebar, AppLayout
        │   ├── CreateLPOModal.jsx
        │   ├── BuyerControls.jsx
        │   ├── ErrorLogger.jsx
        │   ├── LPOTable.jsx
        │   ├── DaySection.jsx
        │   ├── StatusBadge.jsx
        │   └── ProtectedRoute.jsx
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── LPOsPage.jsx
            ├── ReportsPage.jsx
            ├── UsersPage.jsx
            └── PersonsPage.jsx
```

---

## PREREQUISITES (Windows)

1. Install **Node.js** (v18+): https://nodejs.org
2. Install **MongoDB Community**: https://www.mongodb.com/try/download/community
   - During install, choose "Install as a Windows Service" — it will run automatically
3. Install **Git** (optional): https://git-scm.com

---

## SETUP INSTRUCTIONS

### Step 1 — Set up the Server

Open a terminal (PowerShell or CMD) in the `rekker-ops` folder:

```bash
cd server
npm install
```

Copy the env file and configure it:

```bash
copy .env.example .env
```

Open `server/.env` and make sure it looks like this:

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/rekker-ops
JWT_SECRET=rekker_super_secret_change_this_in_production
CLIENT_URL=http://localhost:5173
```

Seed the database (creates Super Admin + sample persons):

```bash
node seed.js
```

You should see:
```
✅ Super Admin created: username=superadmin | password=Rekker2024!
```

Start the server:

```bash
npm run dev
```

The API will run at: http://localhost:5000

---

### Step 2 — Set up the Client

Open a NEW terminal window in the `rekker-ops` folder:

```bash
cd client
npm install
npm run dev
```

The app will run at: http://localhost:5173

---

## FIRST LOGIN

- URL: http://localhost:5173/login
- Username: `superadmin`
- Password: `Rekker2024!`

**⚠️ Change this password immediately after first login via the Users page.**

---

## ROLES

| Role        | Permissions |
|-------------|-------------|
| super_admin | Full control — create/delete users, all data |
| admin       | View all, edit entries, create limited users |
| team_lead   | Create LPOs, update statuses, log errors |
| viewer      | Read-only access |

---

## DEPLOYMENT

### Option A: Render (Recommended)

1. Push code to GitHub
2. Create a **Web Service** on Render for the server (set env vars)
3. Create a **Static Site** on Render for the client (build command: `npm run build`, publish: `dist`)
4. Point `ops.rekker.co.ke` CNAME to Render

### Option B: Host Africa (VPS)

1. SSH into server
2. Install Node.js, MongoDB, PM2, Nginx
3. Clone repo, install deps, run `pm2 start server/index.js`
4. Configure Nginx to proxy `/api` to port 5000 and serve client `dist/`
5. Point `ops.rekker.co.ke` in DNS to server IP

---

## NPM COMMANDS REFERENCE

```bash
# Server
npm install           # Install all server dependencies
npm run dev           # Start with nodemon (hot reload)
npm start             # Production start
node seed.js          # Seed Super Admin + sample data

# Client
npm install           # Install all client dependencies
npm run dev           # Start Vite dev server
npm run build         # Build for production (outputs to dist/)
npm run preview       # Preview production build locally
```

---

Built with ❤️ for Rekker Limited
