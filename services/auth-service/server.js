require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const PORT = process.env.PORT_AUTH || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_microservices_2026';
const DB_URL = process.env.AUTH_DB_URL || 'postgresql://postgres:postgres@localhost:5433/auth_db';

const pool = new Pool({ connectionString: DB_URL });

// Initialize Database Tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Role" (
      roleid INT PRIMARY KEY,
      rolename VARCHAR(50) NOT NULL UNIQUE
    );
    INSERT INTO "Role" (roleid, rolename) VALUES (1, 'Admin'), (2, 'Customer')
    ON CONFLICT (roleid) DO NOTHING;

    CREATE TABLE IF NOT EXISTS "User" (
      uid SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      roleid INT NOT NULL REFERENCES "Role"(roleid)
    );
  `);
  const adminHash = await bcrypt.hash('admin123', 10);
  await pool.query(`
    INSERT INTO "User" (username, password, roleid)
    VALUES ('admin', $1, 1)
    ON CONFLICT (username) DO NOTHING;
  `, [adminHash]);
  console.log('[auth-service] Database tables initialized');
}

// 1. Healthcheck
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'UP', service: 'auth-service', database: 'connected' });
  } catch (error) {
    return res.status(503).json({ status: 'DOWN', service: 'auth-service', error: error.message });
  }
});

// 2. Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, fullname } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Missing username or password' });
    }

    // Check duplicate username
    const existing = await pool.query('SELECT uid FROM "User" WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const roleid = req.body.roleid || 2; // Default to Customer (roleid: 2)

    const result = await pool.query(
      'INSERT INTO "User" (username, password, roleid) VALUES ($1, $2, $3) RETURNING uid, username, roleid',
      [username, hashedPassword, roleid]
    );

    const newUser = result.rows[0];

    // Attempt to register in Customer Service (if running)
    const customerServiceUrl = process.env.CUSTOMER_SERVICE_URL || 'http://localhost:5002';
    try {
      const axios = require('axios');
      await axios.post(`${customerServiceUrl}/internal/customers`, {
        uid: newUser.uid,
        fullname: fullname || username,
        mid: 1 // Default Standard Membership
      }, { timeout: 1000 });
    } catch (e) {
      // Ignore if customer-service is not up yet
    }

    return res.status(201).json({
      message: 'User registered successfully',
      uid: newUser.uid
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 3. Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Missing username or password' });
    }

    const result = await pool.query(`
      SELECT u.uid, u.username, u.password, r.rolename, u.roleid
      FROM "User" u
      JOIN "Role" r ON u.roleid = r.roleid
      WHERE u.username = $1
    `, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign(
      {
        sub: user.uid,
        uid: user.uid,
        username: user.username,
        role: user.rolename
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    return res.status(200).json({
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: {
        uid: user.uid,
        username: user.username,
        role: user.rolename
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[auth-service] Running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('[auth-service] DB Connection error:', err.message);
});

module.exports = app;
