const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Use a test database
const TEST_DB = path.join(__dirname, '../data/test.db');
process.env.DB_PATH = TEST_DB;

const app = require('../src/app');
const { closeDb } = require('../src/db/database');

afterAll(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

describe('Auth API', () => {
  let token;
  const user = { username: 'testuser', email: 'test@example.com', password: 'secret123' };

  it('registers a new user', async () => {
    const res = await request(app).post('/api/auth/register').send(user);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('testuser');
    token = res.body.token;
  });

  it('rejects duplicate registration', async () => {
    const res = await request(app).post('/api/auth/register').send(user);
    expect(res.status).toBe(409);
  });

  it('rejects weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'u2', email: 'u2@x.com', password: '123' });
    expect(res.status).toBe(400);
  });

  it('logs in an existing user', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    token = res.body.token;
  });

  it('rejects bad credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('gets current user profile', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('testuser');
  });

  it('rejects unauthenticated profile request', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Recipes API', () => {
  let token;
  let recipeId;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'chef', email: 'chef@food.com', password: 'cooking123'
    });
    token = res.body.token;
  });

  const authHeader = () => ({ Authorization: `Bearer ${token}` });

  it('creates a recipe', async () => {
    const res = await request(app).post('/api/recipes').set(authHeader()).send({
      title: 'Pasta Carbonara',
      description: 'Classic Italian pasta',
      ingredients: ['200g pasta', '100g pancetta', '2 eggs', '50g parmesan'],
      steps: ['Boil pasta', 'Fry pancetta', 'Mix eggs and cheese', 'Combine all'],
      servings: 2,
      prep_time: 10,
      cook_time: 20,
      tags: ['Italian', 'Pasta']
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Pasta Carbonara');
    expect(res.body.ingredients).toHaveLength(4);
    expect(res.body.steps).toHaveLength(4);
    recipeId = res.body.id;
  });

  it('gets own recipes', async () => {
    const res = await request(app).get('/api/recipes').set(authHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('gets a single recipe', async () => {
    const res = await request(app).get(`/api/recipes/${recipeId}`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(recipeId);
    expect(res.body.tags).toContain('Italian');
  });

  it('updates a recipe', async () => {
    const res = await request(app).put(`/api/recipes/${recipeId}`).set(authHeader()).send({
      title: 'Pasta Carbonara (Updated)',
      servings: 4
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Pasta Carbonara (Updated)');
    expect(res.body.servings).toBe(4);
  });

  it('searches recipes', async () => {
    const res = await request(app).get('/api/recipes/search?q=pasta').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('saves a recipe to cookbook', async () => {
    const res = await request(app).post(`/api/recipes/${recipeId}/save`).set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
  });

  it('lists saved recipes', async () => {
    const res = await request(app).get('/api/recipes/saved/list').set(authHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('deletes a recipe', async () => {
    const res = await request(app).delete(`/api/recipes/${recipeId}`).set(authHeader());
    expect(res.status).toBe(200);
  });

  it('returns 404 for deleted recipe', async () => {
    const res = await request(app).get(`/api/recipes/${recipeId}`).set(authHeader());
    expect(res.status).toBe(404);
  });
});

describe('Users API', () => {
  let token1, token2;

  beforeAll(async () => {
    const r1 = await request(app).post('/api/auth/register').send({
      username: 'alice', email: 'alice@x.com', password: 'password1'
    });
    const r2 = await request(app).post('/api/auth/register').send({
      username: 'bob', email: 'bob@x.com', password: 'password2'
    });
    token1 = r1.body.token;
    token2 = r2.body.token;
  });

  it('gets user profile', async () => {
    const res = await request(app).get('/api/users/alice').set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('alice');
    expect(res.body.followerCount).toBeDefined();
  });

  it('follows a user', async () => {
    const res = await request(app).post('/api/users/alice/follow').set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(200);
    expect(res.body.following).toBe(true);
  });

  it('shows updated follower count', async () => {
    const res = await request(app).get('/api/users/alice').set('Authorization', `Bearer ${token2}`);
    expect(res.body.followerCount).toBe(1);
    expect(res.body.isFollowing).toBe(true);
  });

  it('unfollows a user', async () => {
    const res = await request(app).post('/api/users/alice/follow').set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(200);
    expect(res.body.following).toBe(false);
  });

  it('cannot follow yourself', async () => {
    const res = await request(app).post('/api/users/alice/follow').set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(400);
  });

  it('searches users', async () => {
    const res = await request(app).get('/api/users?q=bob').set('Authorization', `Bearer ${token1}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].username).toBe('bob');
  });
});
