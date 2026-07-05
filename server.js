require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Pool } = require('pg');
const pgSessionFactory = require('connect-pg-simple');

const app = express();
const PORT = process.env.PORT || 3000;
const STARTING_BALANCE = 1000;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL tanımlı değil. .env dosyanı kontrol et.');
}
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanımlı değil. Google girişi çalışmaz.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const PgSession = pgSessionFactory(session);

app.set('trust proxy', 1); // Render bir proxy arkasında çalıştırıyor
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'bunu-render-ortam-degiskeninde-degistir',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, rows[0] || null);
  } catch (err) {
    done(err);
  }
});

// ÇİFT TANIMLAMA SATIRI BURADAN KALDIRILDI - SYNTAX ERROR ÇÖZÜLDÜ!
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://parax.onrender.com/auth/google/callback" 
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
      // Kullanıcı veritabanında zaten var mı kontrol et
      let { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
      
      // Eğer kullanıcı ilk defa geliyorsa veritabanına kaydet
      if (rows.length === 0) {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        const avatar_url = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
        
        const insertRes = await pool.query(
          `INSERT INTO users (google_id, name, email, avatar_url, balance) 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING *`,
          [profile.id, profile.displayName, email, avatar_url, STARTING_BALANCE]
        );
        rows = insertRes.rows;
      }
      
      return cb(null, rows[0]);
    } catch (err) {
      console.error('Google Auth Veritabanı Hatası:', err);
      return cb(err);
    }
  }
));

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Önce giriş yapmalısın' });
  next();
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      avatar_url TEXT,
      balance NUMERIC NOT NULL DEFAULT ${STARTING_BALANCE},
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      author TEXT NOT NULL,
      body TEXT,
      image TEXT,
      video_url TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Zaten deploy edilmiş eski posts tablosunda avatar_url yoksa güvenle ekler
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
}

/* ---------- Kimlik doğrulama ---------- */
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.post('/auth/logout', (req, res) => {
  req.logout(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Giriş yapılmamış' });
  res.json({
    id: req.user.id,
    name: req.user.name,
    avatar: req.user.avatar_url,
    balance: Number(req.user.balance),
  });
});

/* ---------- Akış (sohbet) ---------- */
app.get('/api/posts', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, author, body, image, video_url, avatar_url, created_at FROM posts ORDER BY created_at DESC LIMIT 60'
    );
    res.json(rows);
  } catch (err) {
    console.error('Akış okunamadı:', err);
    res.status(500).json({ error: 'Akış yüklenemedi' });
  }
});

app.post('/api/posts', requireAuth, async (req, res) => {
  const { body, image, videoUrl } = req.body || {};
  const cleanBody = (body || '').trim().slice(0, 500);
  const cleanVideoUrl = (videoUrl || '').trim().slice(0, 500);

  if (!cleanBody && !image && !cleanVideoUrl) {
    return res.status(400).json({ error: 'Boş paylaşım gönderilemez' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO posts (author, body, image, video_url, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, author, body, image, video_url, avatar_url, created_at`,
      [req.user.name, cleanBody, image || null, cleanVideoUrl || null, req.user.avatar_url || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Paylaşım kaydedilemedi:', err);
    res.status(500).json({ error: 'Paylaşım kaydedilemedi' });
  }
});

/* ---------- Sıralama ---------- */
app.get('/api/leaderboard', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, avatar_url, balance FROM users ORDER BY balance DESC LIMIT 50'
    );
    res.json(rows);
  } catch (err) {
    console.error('Sıralama okunamadı:', err);
    res.status(500).json({ error: 'Sıralama yüklenemedi' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureTables()
  .then(() => {
    app.listen(PORT, () => console.log(`ekonomiX ${PORT} portunda çalışıyor`));
  })
  .catch((err) => {
    console.error('Veritabanı tabloları hazırlanamadı:', err);
    process.exit(1);
  });
