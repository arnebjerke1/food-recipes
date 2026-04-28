const express = require('express');
const cors = require('cors');
const { router: authRouter } = require('./routes/auth');
const recipesRouter = require('./routes/recipes');
const scraperRouter = require('./routes/scraper');
const usersRouter = require('./routes/users');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/scraper', scraperRouter);
app.use('/api/users', usersRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
