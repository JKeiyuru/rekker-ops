// server/index.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

dotenv.config();

const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/users');
const lpoRoutes     = require('./routes/lpos');
const buyerRoutes   = require('./routes/buyer');
const reportRoutes  = require('./routes/reports');
const personRoutes  = require('./routes/persons');
const branchRoutes  = require('./routes/branches');
const invoiceRoutes  = require('./routes/invoices');
const checkinRoutes  = require('./routes/checkins');
const assignmentRoutes = require('./routes/assignments');
const mapsRoutes       = require('./routes/maps');

const app = express();

// Trust proxy (important for Render)
app.set('trust proxy', 1);

// Security & logging
app.use(helmet());
app.use(morgan('dev'));

// Rate limiting (basic protection)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per window
}));

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'https://ops.rekker.co.ke',
  'https://rekker-ops.onrender.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parser
app.use(express.json());

// Routes
app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/lpos',     lpoRoutes);
app.use('/api/buyer',    buyerRoutes);
app.use('/api/reports',  reportRoutes);
app.use('/api/persons',  personRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/invoices',     invoiceRoutes);
app.use('/api/checkins',     checkinRoutes);
app.use('/api/assignments',  assignmentRoutes);
app.use('/api/maps',         mapsRoutes);

// Root route (for Render)
app.get('/', (req, res) => {
  res.send('Rekker Ops API is running...');
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error'
  });
});

// Environment validation
if (!process.env.MONGO_URI) {
  console.error('❌ MONGO_URI is not defined');
  process.exit(1);
}

// Start server
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });