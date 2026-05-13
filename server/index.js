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

app.get('/',           (req, res) => res.send('Rekker Ops API is running...'));
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

if (!process.env.MONGO_URI) { console.error('❌ MONGO_URI not defined'); process.exit(1); }

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => { console.log('✅ MongoDB connected'); app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`)); })
  .catch((err) => { console.error('❌ MongoDB failed:', err.message); process.exit(1); });
