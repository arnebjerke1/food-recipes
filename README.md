# 📖 RecipeBook

A mobile-first recipe collection app. Save recipes from any URL, build your personal cookbook, and follow friends to discover what they're cooking.

## Features

- 🔗 **Import from URL** – Paste any recipe site URL and the app extracts title, ingredients, steps, times, and tags automatically
- ✍️ **Manual entry** – Add recipes by hand with a step-by-step form
- 📱 **Mobile-first UI** – Optimised for iPhone and iPad with a native-app feel
- 📚 **Personal cookbook** – All your recipes in one place, with "My Recipes" and "Saved" tabs
- 🔖 **Save recipes** – Bookmark public recipes from other users
- 🔍 **Search** – Find recipes by name, tag, or description; find users by username
- 👥 **Social / Follow** – Follow friends and see their new recipes in your feed
- 📤 **Share** – Share any recipe via the native share sheet or copy a link

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Express.js + SQLite (better-sqlite3) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Scraping | axios + cheerio (JSON-LD + fallback heuristics) |

## Getting Started

### Prerequisites
- Node.js 18+

### Install & Run

```bash
# Install all dependencies
cd backend && npm install
cd ../frontend && npm install

# Start the API (port 3001)
cd backend && npm start

# In a separate terminal – start the dev server (port 5173)
cd frontend && npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Running Tests

```bash
# Backend (Jest + Supertest)
cd backend && npm test

# Frontend (Vitest + Testing Library)
cd frontend && npm test
```

## Project Structure

```
food-recipes/
├── backend/
│   ├── src/
│   │   ├── db/database.js      # SQLite schema & connection
│   │   ├── routes/auth.js      # Register / Login / Profile
│   │   ├── routes/recipes.js   # Recipe CRUD, save, feed, search
│   │   ├── routes/scraper.js   # URL → recipe parser
│   │   ├── routes/users.js     # Follow / Followers / User search
│   │   ├── app.js              # Express app
│   │   └── index.js            # Entry point
│   └── tests/api.test.js
└── frontend/
    └── src/
        ├── components/         # RecipeCard, BottomNav, LoadingSpinner, EmptyState
        ├── hooks/useAuth.jsx   # Auth context & helpers
        ├── pages/              # Login, Register, Cookbook, Feed, Add, Search, Profile, Detail
        └── utils/api.js        # Axios instance with JWT interceptor
```