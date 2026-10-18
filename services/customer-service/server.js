require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = process.env.PORT_CUSTOMER || 5002;
const DB_URL = process.env.CUSTOMER_DB_URL || 'postgresql://postgres:postgres@localhost:5433/customer_db';

const pool = new Pool({ connectionString: DB_URL });

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "MemberShip" (
      mid INT PRIMARY KEY,
      mname VARCHAR(50) NOT NULL UNIQUE,
      score INT NOT NULL DEFAULT 0
    );
    INSERT INTO "MemberShip" (mid, mname, score) VALUES
      (1, 'Standard', 10),
      (2, 'Silver', 100),
      (3, 'Gold', 500)
    ON CONFLICT (mid) DO UPDATE SET score = EXCLUDED.score;

    CREATE TABLE IF NOT EXISTS "Customer" (
      uid INT PRIMARY KEY,
      fullname VARCHAR(100) NOT NULL,
      mid INT NOT NULL REFERENCES "MemberShip"(mid)
    );

    INSERT INTO "Customer" (uid, fullname, mid) VALUES
      (1, 'System Admin (Gold)', 3)
    ON CONFLICT (uid) DO NOTHING;
  `);
  console.log('[customer-service] Database tables initialized');
}

// 1. Healthcheck
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'UP', service: 'customer-service', database: 'connected' });
  } catch (error) {
    return res.status(503).json({ status: 'DOWN', service: 'customer-service', error: error.message });
  }
});

// 2. Get customer information (API-CUS-01)
app.get('/api/customers/:uid', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    const result = await pool.query(`
      SELECT c.uid, c.fullname, c.mid, m.mname, m.score
      FROM "Customer" c
      JOIN "MemberShip" m ON c.mid = m.mid
      WHERE c.uid = $1
    `, [uid]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const row = result.rows[0];
    return res.status(200).json({
      uid: row.uid,
      fullname: row.fullname,
      mid: row.mid,
      mname: row.mname,
      score: row.score,
      membership: {
        mid: row.mid,
        mname: row.mname,
        score: row.score
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 3. Update customer information (API-CUS-02)
app.put('/api/customers/:uid', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    const { fullname, mid } = req.body;

    const check = await pool.query('SELECT uid FROM "Customer" WHERE uid = $1', [uid]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    if (fullname && mid) {
      await pool.query('UPDATE "Customer" SET fullname = $1, mid = $2 WHERE uid = $3', [fullname, mid, uid]);
    } else if (fullname) {
      await pool.query('UPDATE "Customer" SET fullname = $1 WHERE uid = $2', [fullname, uid]);
    } else if (mid) {
      await pool.query('UPDATE "Customer" SET mid = $1 WHERE uid = $2', [mid, uid]);
    }

    return res.status(200).json({
      message: 'Customer updated successfully',
      uid,
      fullname
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 4. Internal Endpoint: Create/Sync Customer from auth-service
app.post('/internal/customers', async (req, res) => {
  try {
    const { uid, fullname, mid } = req.body;
    await pool.query(`
      INSERT INTO "Customer" (uid, fullname, mid)
      VALUES ($1, $2, $3)
      ON CONFLICT (uid) DO UPDATE SET fullname = EXCLUDED.fullname, mid = EXCLUDED.mid
    `, [uid, fullname || `User ${uid}`, mid || 1]);

    return res.status(201).json({ message: 'Customer synced', uid });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 5. Internal Endpoint: Query Customer Score for Order Service (Sequence Diagram step 3 & 4)
app.get('/internal/customers/:uid', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    const result = await pool.query(`
      SELECT c.uid, c.fullname, c.mid, m.score
      FROM "Customer" c
      JOIN "MemberShip" m ON c.mid = m.mid
      WHERE c.uid = $1
    `, [uid]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[customer-service] Running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('[customer-service] DB Connection error:', err.message);
});

module.exports = app;
