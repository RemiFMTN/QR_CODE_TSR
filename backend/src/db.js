const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DATABASE_URL = process.env.DATABASE_URL && process.env.DATABASE_URL.trim();

let db = null; // sqlite Database or pg Pool
let run;
let get;
let all;
let initSchema;
let ensureAdmin;

if (DATABASE_URL) {
  // Use Postgres (Neon) via `pg`
  const { Pool } = require("pg");
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  db = pool;

  // convert '?' placeholders to $1, $2 for pg
  const convert = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };

  run = async (sql, params = []) => {
    const text = convert(sql);
    return pool.query(text, params);
  };

  get = async (sql, params = []) => {
    const text = convert(sql);
    const res = await pool.query(text, params);
    return res.rows[0] || null;
  };

  all = async (sql, params = []) => {
    const text = convert(sql);
    const res = await pool.query(text, params);
    return res.rows || [];
  };

  initSchema = async () => {
    const schemaFile = path.join(__dirname, "..", "schema.postgres.sql");
    if (!fs.existsSync(schemaFile)) {
      throw new Error("Postgres schema file not found: schema.postgres.sql");
    }
    const schema = fs.readFileSync(schemaFile, "utf8");
    // pg supports multiple statements in one query string
    await pool.query(schema);
  };

  ensureAdmin = async (username, passwordHash) => {
    const existing = await get("SELECT id FROM admins WHERE username = ?", [username]);
    if (existing) return;
    await run("INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)", [uuidv4(), username, passwordHash]);
  };

} else {
  // Fallback to SQLite (local development)
  const sqlite3 = require("sqlite3").verbose();

  const dbPath = process.env.DATABASE_PATH || "./data/app.db";
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqliteDb = new sqlite3.Database(dbPath);
  db = sqliteDb;

  run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve(this);
      });
    });

  get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });

  all = (sql, params = []) =>
    new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

  initSchema = async () => {
    const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sqlite.sql"), "utf8");
    await new Promise((resolve, reject) => {
      sqliteDb.exec(schema, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  };

  ensureAdmin = async (username, passwordHash) => {
    const existing = await get("SELECT id FROM admins WHERE username = ?", [username]);
    if (existing) return;
    await run(
      "INSERT INTO admins (id, username, password_hash) VALUES (?, ?, ?)",
      [uuidv4(), username, passwordHash]
    );
  };
}

module.exports = {
  db,
  run,
  get,
  all,
  initSchema,
  ensureAdmin,
  uuidv4
};
