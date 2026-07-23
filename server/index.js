// server/index.js
// FIX (Jul 2026): CORS was being blocked intermittently for real users behind a shared
// office IP (e.g. Emma's machine). Root cause: the rate limiter ran BEFORE the cors()
// middleware, so once the (very low) 200-req/15min-per-IP limit was hit -- trivially easy
// with several staff sharing one NAT'd office IP, each with notification polling plus
// several dropdown fetches on every page -- Express sent the 429 response straight from
// express-rate-limit without any Access-Control-Allow-Origin header attached. The browser
// then reports this as a generic CORS failure ("blocked by CORS policy... No
// Access-Control-Allow-Origin"), masking the real "Too Many Requests" cause. The same
// masking happened for any other early middleware error. Fix: mount cors() first (so
// every response -- including 429s and error-handler responses -- always carries the
// header), skip rate-limiting for CORS preflight (OPTIONS) requests, raise the general
// limit to something sane for an internal ops tool, and give /api/auth/login its own
// separate, stricter limiter for brute-force protection instead of sharing the global one.

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const dotenv     = require('dotenv');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

dotenv.config();

const authRoutes        = require('./routes/auth');
const userRoutes        = require('./routes/users');
const lpoRoutes         = require('./routes/lpos');
const buyerRoutes       = require('./routes/buyer');
const reportRoutes      = require('./routes/reports');
const personRoutes      = require('./routes/persons');
const branchRoutes      = require('./routes/branches');
const invoiceRoutes     = require('./routes/invoices');
const checkinRoutes     = require('./routes/checkins');
const assignmentRoutes  = require('./routes/assignments');
const mapsRoutes        = require('./routes/maps');
const vehicleRoutes     = require('./routes/vehicles');
const tripRoutes        = require('./routes/trips');
const freshLpoRoutes    = require('./routes/freshLpos');
const freshCustomerLpoRoutes = require('./routes/freshCustomerLpos');
const freshReturnRoutes      = require('./routes/freshReturns');
const returnReasonRoutes     = require('./routes/returnReasons');
const packagingTripRoutes    = require('./routes/packagingTrips');
const materialSupplierRoutes = require('./routes/materialSuppliers');
const materialRoutes         = require('./routes/materials');
const productRoutes          = require('./routes/products');
const productionCycleRoutes  = require('./routes/productionCycles');
const goodsReceiptRoutes     = require('./routes/goodsReceipts');
const mfgIntelRoutes         = require('./routes/mfgIntel');
const notificationRoutes     = require('./routes/notifications');
const freshOpsRoutes         = require('./routes/fresh');
const adjustmentReasonRoutes = require('./routes/adjustmentReasons');

const markIncompleteSessions = require('./jobs/markIncompleteSessions');

const app = express();

app.set('trust proxy', 1);

// ── CORS ─────────────────────────────────────────────────────────────────────
// This MUST be the first middleware mounted. If anything (rate limiter, helmet,
// auth, the error handler, etc.) responds before this runs, that response goes
// out with no Access-Control-Allow-Origin header and the browser reports it as
// a CORS failure no matter how legitimate the origin was.
const allowedOrigins = [
  'http://localhost:5173',
  'https://ops.rekker.co.ke',
  'https://rekker-ops.onrender.com',
];
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));
// Explicitly answer every preflight fast, before hitting rate limiting/helmet/auth.
app.options('*', cors(corsOptions));

app.use(helmet());
app.use(morgan('dev'));

// ── Rate limiting ────────────────────────────────────────────────────────────
// Split into two limiters:
//   1) generalLimiter — applied to all /api traffic. This is an internal tool used
//      by a small team, often from a single shared office IP (NAT), each with a
//      browser tab polling /api/notifications every 30s plus several dropdown
//      fetches (branches, persons, lpos, invoices) on every page load. The old
//      shared 200 req/15min limit was easily exhausted by 3-4 people working
//      normally, which is what caused the "works, then fails for a while, then
//      works again" pattern. Raised substantially and preflight (OPTIONS) is
//      always skipped since it carries no meaningful load and blocking it just
//      breaks every real request behind it.
//   2) loginLimiter — kept intentionally strict and scoped ONLY to POST
//      /api/auth/login, so brute-force protection doesn't get diluted by raising
//      the general limit, and normal API usage never gets blocked because someone
//      mistyped a password a few times.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: { message: 'Too many requests, please slow down and try again shortly.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  message: { message: 'Too many login attempts. Please wait a few minutes and try again.' },
});

app.use('/api/auth/login', loginLimiter);
app.use('/api', generalLimiter);

app.use(express.json({ limit: '25mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/lpos',        lpoRoutes);
app.use('/api/buyer',       buyerRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/persons',     personRoutes);
app.use('/api/branches',    branchRoutes);
app.use('/api/invoices',    invoiceRoutes);
app.use('/api/checkins',    checkinRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/maps',        mapsRoutes);
app.use('/api/vehicles',    vehicleRoutes);
app.use('/api/trips',       tripRoutes);
app.use('/api/fresh-lpos',  freshLpoRoutes);
app.use('/api/fresh-customer-lpos', freshCustomerLpoRoutes);
app.use('/api/fresh-returns',       freshReturnRoutes);
app.use('/api/return-reasons',      returnReasonRoutes);
app.use('/api/packaging-trips',     packagingTripRoutes);
app.use('/api/material-suppliers',  materialSupplierRoutes);
app.use('/api/materials',           materialRoutes);
app.use('/api/products',            productRoutes);
app.use('/api/production-cycles',   productionCycleRoutes);
app.use('/api/goods-receipts',      goodsReceiptRoutes);
app.use('/api/mfg',                 mfgIntelRoutes);
app.use('/api/notifications',       notificationRoutes);
app.use('/api/fresh',               freshOpsRoutes);
app.use('/api/adjustment-reasons',  adjustmentReasonRoutes);

// ── Internal job endpoint ─────────────────────────────────────────────────────
// Called by Render's Cron Job service (or any trusted scheduler).
// Secured by a shared secret in the CRON_SECRET environment variable.
// If CRON_SECRET is not set the endpoint is disabled entirely.
app.post('/internal/mark-incomplete', async (req, res) => {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return res.status(503).json({ message: 'Cron endpoint not configured (CRON_SECRET missing)' });
  }

  const authHeader = req.headers['authorization'] || '';
  if (authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const count = await markIncompleteSessions();
    res.json({ ok: true, marked: count, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[/internal/mark-incomplete]', err.message);
    res.status(500).json({ message: err.message });
  }
});

app.get('/',           (req, res) => res.send('Rekker Ops API is running...'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

// ── Database + server start ───────────────────────────────────────────────────
if (!process.env.MONGO_URI) { console.error('❌ MONGO_URI not defined'); process.exit(1); }

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');

    // ── Index migration: old unique lpoNumber_1 → compound (branch, lpoNumber) ──
    try {
      const LPO = require('./models/LPO');
      const indexes = await LPO.collection.indexes();
      const legacy = indexes.find((i) => i.name === 'lpoNumber_1' && i.unique);
      if (legacy) {
        await LPO.collection.dropIndex('lpoNumber_1');
        console.log('🔧 Dropped legacy unique index lpoNumber_1 (now unique per branch)');
      }
      await LPO.syncIndexes();
    } catch (e) {
      console.warn('⚠️  LPO index migration:', e.message);
    }

    // Run the incomplete-session sweep on every startup.
    const marked = await markIncompleteSessions();
    if (marked > 0) {
      console.log(`⏰  Startup sweep: marked ${marked} session(s) as INCOMPLETE`);
    }

    app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB failed:', err.message);
    process.exit(1);
  });