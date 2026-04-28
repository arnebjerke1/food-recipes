const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('./auth');

const router = express.Router();

// Get user profile by username
router.get('/:username', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, bio, avatar_url, created_at FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const followerCount = db.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').get(user.id).count;
  const followingCount = db.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').get(user.id).count;
  const recipeCount = db.prepare('SELECT COUNT(*) as count FROM recipes WHERE user_id = ? AND is_public = 1').get(user.id).count;
  const isFollowing = req.userId !== user.id
    ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.userId, user.id)
    : false;

  res.json({ ...user, followerCount, followingCount, recipeCount, isFollowing, isOwn: req.userId === user.id });
});

// Follow / unfollow a user
router.post('/:username/follow', requireAuth, (req, res) => {
  const db = getDb();
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.userId) return res.status(400).json({ error: 'Cannot follow yourself' });

  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.userId, target.id);
  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.userId, target.id);
    return res.json({ following: false });
  }

  db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.userId, target.id);
  res.json({ following: true });
});

// Get followers list
router.get('/:username/followers', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const followers = db.prepare(`
    SELECT u.id, u.username, u.bio, u.avatar_url
    FROM follows f
    JOIN users u ON f.follower_id = u.id
    WHERE f.following_id = ?
    ORDER BY f.created_at DESC
  `).all(user.id);

  res.json(followers);
});

// Get following list
router.get('/:username/following', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const following = db.prepare(`
    SELECT u.id, u.username, u.bio, u.avatar_url
    FROM follows f
    JOIN users u ON f.following_id = u.id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(user.id);

  res.json(following);
});

// Search users
router.get('/', requireAuth, (req, res) => {
  const { q = '' } = req.query;
  const db = getDb();
  const pattern = `%${q}%`;
  const users = db.prepare(`
    SELECT id, username, bio, avatar_url
    FROM users
    WHERE username LIKE ? AND id != ?
    LIMIT 20
  `).all(pattern, req.userId);
  res.json(users);
});

module.exports = router;
