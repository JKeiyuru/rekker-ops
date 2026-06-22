// server/index.js

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

const markIncompleteSessions = require('./jobs/markIncompleteSessions');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(morgan('dev'));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

const allowedOrigins = [
  'http://localhost:5173',
  'https://ops.rekker.co.ke',
  'https://rekker-ops.onrender.com',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

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

    // Run the incomplete-session sweep on every startup.
    // On Render this happens whenever the dyno cold-starts (including after
    // being woken by the nightly Cron Job ping), so stale sessions are always
    // caught without needing node-cron running inside the process.
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