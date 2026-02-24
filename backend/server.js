/**
 * server.js — Express entry point for Prompt Intelligence Backend
 *
 * Responsibilities:
 *  - Load environment variables
 *  - Connect to MongoDB
 *  - Mount API routes
 *  - Start HTTP server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const promptRoutes = require('./routes/promptRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ─────────────────────────────────────────── */
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/* ── Routes ────────────────────────────────────────────── */
app.use('/api', promptRoutes);

/* ── Health Check ──────────────────────────────────────── */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ── MongoDB Connection & Server Start ─────────────────── */
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/prompt_intelligence';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`   AI mode: ${process.env.USE_AI === 'true' ? 'ENABLED' : 'DISABLED (rule-based only)'}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('⚠️  Starting server WITHOUT database (in-memory mode)...');
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT} (no DB)`);
    });
  });

module.exports = app;
