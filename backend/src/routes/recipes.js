const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');

const router = express.Router();

function parseJson(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function formatRecipe(row) {
  if (!row) return null;
  return {
    ...row,
    ingredients: parseJson(row.ingredients, []),
    steps: parseJson(row.steps, []),
    tags: parseJson(row.tags, []),
    is_public: row.is_public === 1 || row.is_public === true
  };
}

// List recipes (own + public feed)
router.get('/', requireAuth, (req, res) => {
  const { page = 1, limit = 20, userId } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const db = getDb();

  let rows;
  if (userId) {
    // View another user's public cookbook
    rows = db.prepare(`
      SELECT r.*, u.username as author_username
      FROM recipes r
      JOIN users u ON r.user_id = u.id
      WHERE r.user_id = ? AND (r.is_public = 1 OR r.user_id = ?)
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, req.userId, parseInt(limit), offset);
  } else {
    // Own recipes
    rows = db.prepare(`
      SELECT r.*, u.username as author_username
      FROM recipes r
      JOIN users u ON r.user_id = u.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.userId, parseInt(limit), offset);
  }

  res.json(rows.map(formatRecipe));
});

// Get feed from followed users
router.get('/feed', requireAuth, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const db = getDb();

  const rows = db.prepare(`
    SELECT r.*, u.username as author_username
    FROM recipes r
    JOIN users u ON r.user_id = u.id
    JOIN follows f ON f.following_id = r.user_id
    WHERE f.follower_id = ? AND r.is_public = 1
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.userId, parseInt(limit), offset);

  res.json(rows.map(formatRecipe));
});

// Search recipes
router.get('/search', requireAuth, (req, res) => {
  const { q = '' } = req.query;
  const db = getDb();
  const pattern = `%${q}%`;

  const rows = db.prepare(`
    SELECT r.*, u.username as author_username
    FROM recipes r
    JOIN users u ON r.user_id = u.id
    WHERE (r.user_id = ? OR r.is_public = 1)
      AND (r.title LIKE ? OR r.description LIKE ? OR r.tags LIKE ?)
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all(req.userId, pattern, pattern, pattern);

  res.json(rows.map(formatRecipe));
});

// Get single recipe
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT r.*, u.username as author_username
    FROM recipes r
    JOIN users u ON r.user_id = u.id
    WHERE r.id = ? AND (r.is_public = 1 OR r.user_id = ?)
  `).get(req.params.id, req.userId);

  if (!row) return res.status(404).json({ error: 'Recipe not found' });
  res.json(formatRecipe(row));
});

// Create recipe
router.post('/', requireAuth, (req, res) => {
  const { title, description, ingredients, steps, image_url, source_url, servings, prep_time, cook_time, tags, is_public } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  const db = getDb();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO recipes (id, user_id, title, description, ingredients, steps, image_url, source_url, servings, prep_time, cook_time, tags, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.userId,
    title,
    description || '',
    JSON.stringify(ingredients || []),
    JSON.stringify(steps || []),
    image_url || '',
    source_url || '',
    servings || 4,
    prep_time || 0,
    cook_time || 0,
    JSON.stringify(tags || []),
    is_public !== false ? 1 : 0
  );

  const row = db.prepare('SELECT r.*, u.username as author_username FROM recipes r JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(id);
  res.status(201).json(formatRecipe(row));
});

// Update recipe
router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const { title, description, ingredients, steps, image_url, source_url, servings, prep_time, cook_time, tags, is_public } = req.body;

  db.prepare(`
    UPDATE recipes SET title=?, description=?, ingredients=?, steps=?, image_url=?, source_url=?,
    servings=?, prep_time=?, cook_time=?, tags=?, is_public=?, updated_at=datetime('now')
    WHERE id = ?
  `).run(
    title || recipe.title,
    description !== undefined ? description : recipe.description,
    JSON.stringify(ingredients !== undefined ? ingredients : parseJson(recipe.ingredients)),
    JSON.stringify(steps !== undefined ? steps : parseJson(recipe.steps)),
    image_url !== undefined ? image_url : recipe.image_url,
    source_url !== undefined ? source_url : recipe.source_url,
    servings !== undefined ? servings : recipe.servings,
    prep_time !== undefined ? prep_time : recipe.prep_time,
    cook_time !== undefined ? cook_time : recipe.cook_time,
    JSON.stringify(tags !== undefined ? tags : parseJson(recipe.tags)),
    is_public !== undefined ? (is_public ? 1 : 0) : recipe.is_public,
    req.params.id
  );

  const row = db.prepare('SELECT r.*, u.username as author_username FROM recipes r JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(req.params.id);
  res.json(formatRecipe(row));
});

// Delete recipe
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM recipes WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Recipe not found' });
  res.json({ success: true });
});

// Save/unsave recipe to cookbook
router.post('/:id/save', requireAuth, (req, res) => {
  const db = getDb();
  const recipe = db.prepare('SELECT id FROM recipes WHERE id = ? AND (is_public = 1 OR user_id = ?)').get(req.params.id, req.userId);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const existing = db.prepare('SELECT * FROM saved_recipes WHERE user_id = ? AND recipe_id = ?').get(req.userId, req.params.id);
  if (existing) {
    db.prepare('DELETE FROM saved_recipes WHERE user_id = ? AND recipe_id = ?').run(req.userId, req.params.id);
    return res.json({ saved: false });
  }

  db.prepare('INSERT INTO saved_recipes (user_id, recipe_id) VALUES (?, ?)').run(req.userId, req.params.id);
  res.json({ saved: true });
});

// Get saved recipes
router.get('/saved/list', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT r.*, u.username as author_username
    FROM saved_recipes sr
    JOIN recipes r ON sr.recipe_id = r.id
    JOIN users u ON r.user_id = u.id
    WHERE sr.user_id = ?
    ORDER BY sr.created_at DESC
  `).all(req.userId);
  res.json(rows.map(formatRecipe));
});

module.exports = router;
