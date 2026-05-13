# Event access backend (local)

This backend uses Node.js + Express + SQLite for local development.

## Quick start

1) Install dependencies:

npm install

2) Copy env file:

copy .env.example .env

3) Start the server:

npm run dev

The API runs on http://localhost:4000 by default.

## Main endpoints

POST /auth/login
POST /groups
GET /groups
GET /groups/:id
POST /groups/:id/members
PATCH /members/:id
POST /scan/qr
POST /scan/checkin

## Notes

- On first run, the admin account is created using ADMIN_USERNAME and ADMIN_PASSWORD.
- SQLite database is stored in ./data/app.db.
- For production, migrate schema to PostgreSQL (see schema.postgres.sql).
