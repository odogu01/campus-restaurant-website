/**
 * Campus Restaurant Website — API server entry point (Phase 1).
 *
 * Basic Express setup: CORS + JSON body parsing.
 * Listens on PORT (default 5000).
 *
 * Phases 2+ will mount auth, vendor, restaurant, menu and order routes here.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5000';

/* ------------------------------------------------------------------ */
/* Global middleware                                                   */
/* ------------------------------------------------------------------ */

// Allow requests from the frontend (and any local dev origin).
app.use(
  cors({
    origin: [FRONTEND_URL, 'http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true,
  })
);

// Parse incoming JSON request bodies (limit raised slightly for base64 images later).
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

// Phase 1: health checks
app.get('/ping', (req, res) => {
  res.json({ message: 'ok' });
});

// API status route with a touch more info.
app.get('/api/status', (req, res) => {
  res.json({
    message: 'Campus Restaurant API is running',
    paymentEnabled: process.env.PAYMENT_ENABLED === 'true',
    timestamp: new Date().toISOString(),
  });
});

// Phase 2: authentication
app.use('/api/auth', require('./src/routes/authRoutes'));

// Phase 3: vendor requests + admin approval
app.use('/api', require('./src/routes/vendorRoutes'));

// Phase 4: restaurants + menus
app.use('/api', require('./src/routes/restaurantRoutes'));

// Phase 5: orders + simulated payment
app.use('/api', require('./src/routes/orderRoutes'));

// Phase 7: admin dashboard endpoints
app.use('/api', require('./src/routes/adminRoutes'));

/* ------------------------------------------------------------------ */
/* Static frontend (Phase 6)                                           */
/* Serves the site from ../frontend/public — so http://localhost:5000  */
/* shows the homepage, and /api/* stays on the same origin.            */
/* ------------------------------------------------------------------ */
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// Uploaded menu item images (backend/uploads/) — public at /uploads/...
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ------------------------------------------------------------------ */
/* 404 + error handler (JSON, not HTML)                                */
/* ------------------------------------------------------------------ */

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

app.listen(PORT, () => {
  console.log(`==============================================`);
  console.log(`  Campus Restaurant API`);
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/ping`);
  console.log(`  PAYMENT_ENABLED = ${process.env.PAYMENT_ENABLED || 'false'} (simulated payments)`);
  console.log(`==============================================`);
});
