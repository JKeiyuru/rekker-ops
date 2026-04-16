// server/index.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');

dotenv.config();

const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/users');
const lpoRoutes     = require('./routes/lpos');
const buyerRoutes   = require('./routes/buyer');
const reportRoutes  = require('./routes/reports');
const personRoutes  = require('./routes/persons');
const branchRoutes  = require('./routes/branches');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/lpos',     lpoRoutes);
app.use('/api/buyer',    buyerRoutes);
app.use('/api/reports',  reportRoutes);
app.use('/api/persons',  personRoutes);
app.use('/api/branches', branchRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal Server Error' });
});

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
