require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const { Kafka } = require('kafkajs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT_ORDER || 5004;
const DB_URL = process.env.ORDER_DB_URL || 'postgresql://postgres:postgres@localhost:5433/order_db';
const CUSTOMER_SERVICE_URL = process.env.CUSTOMER_SERVICE_URL || 'http://localhost:5002';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:5003';
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';

const pool = new Pool({ connectionString: DB_URL });

// Kafka Producer Setup
const kafka = new Kafka({
  clientId: 'order-service',
  brokers: [KAFKA_BROKER]
});
const producer = kafka.producer();
let isProducerConnected = false;

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Order" (
      oid SERIAL PRIMARY KEY,
      uid INT NOT NULL,
      discount DECIMAL(10,2) NOT NULL DEFAULT 0,
      createat TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "OrderDetail" (
      oid INT NOT NULL REFERENCES "Order"(oid) ON DELETE CASCADE,
      pid INT NOT NULL,
      qty INT NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      PRIMARY KEY (oid, pid)
    );

    CREATE TABLE IF NOT EXISTS "OutboxEvent" (
      id SERIAL PRIMARY KEY,
      aggregate_type VARCHAR(50) NOT NULL,
      aggregate_id INT NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('[order-service] Database tables initialized');

  try {
    await producer.connect();
    isProducerConnected = true;
    console.log('[order-service] Connected to Kafka producer');
  } catch (err) {
    console.warn('[order-service] Kafka producer connection warning:', err.message);
  }
}

// 1. Healthcheck
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({
      status: 'UP',
      service: 'order-service',
      database: 'connected',
      kafka: isProducerConnected ? 'connected' : 'disconnected'
    });
  } catch (error) {
    return res.status(503).json({ status: 'DOWN', service: 'order-service', error: error.message });
  }
});

// 2. Create Order (Sequence Diagram flow)
app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, uid } = req.body;
    const customerUid = uid || parseInt(req.headers['x-user-id'] || '1');

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invalid or empty items list' });
    }

    // Step 3 & 4 in Sequence Diagram: Query Customer Score
    let score = 0;
    try {
      const cusRes = await axios.get(`${CUSTOMER_SERVICE_URL}/internal/customers/${customerUid}`, { timeout: 2000 });
      if (cusRes.data && cusRes.data.score !== undefined) {
        score = cusRes.data.score;
      }
    } catch (err) {
      console.warn(`[order-service] Customer ${customerUid} not found or service unavailable, score set to 0`);
    }

    // Step 5: Calculate Discount based on score
    let discount = 0;
    if (score >= 500) {
      discount = 15; // 15% discount for Gold (score >= 500)
    } else if (score >= 100) {
      discount = 10; // 10% discount for Silver (score >= 100)
    } else if (score >= 10) {
      discount = 5;  // 5% discount for Standard (score >= 10)
    }

    // Step 6 & 7: Check stock and deduct inventory in Product Service
    let reservedItems = [];
    try {
      const prodRes = await axios.post(`${PRODUCT_SERVICE_URL}/internal/products/check-and-deduct`, { items }, { timeout: 3000 });
      reservedItems = prodRes.data.items;
    } catch (err) {
      if (err.response && err.response.status === 409) {
        return res.status(409).json({ message: err.response.data.message });
      }
      if (err.response && err.response.status === 404) {
        return res.status(404).json({ message: err.response.data.message });
      }
      return res.status(500).json({ message: 'Failed to reserve inventory with Product Service: ' + err.message });
    }

    // Step 8: Database Transaction (Order + OrderDetail + OutboxEvent)
    await client.query('BEGIN');

    const orderInsertRes = await client.query(
      'INSERT INTO "Order" (uid, discount) VALUES ($1, $2) RETURNING oid, uid, discount, createat',
      [customerUid, discount]
    );
    const newOrder = orderInsertRes.rows[0];

    for (const item of reservedItems) {
      await client.query(
        'INSERT INTO "OrderDetail" (oid, pid, qty, unit_price) VALUES ($1, $2, $3, $4)',
        [newOrder.oid, item.pid, item.qty, item.unit_price]
      );
    }

    const eventPayload = {
      oid: newOrder.oid,
      uid: newOrder.uid,
      discount: newOrder.discount,
      items: reservedItems,
      timestamp: new Date().toISOString()
    };

    const outboxRes = await client.query(
      'INSERT INTO "OutboxEvent" (aggregate_type, aggregate_id, event_type, payload, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['Order', newOrder.oid, 'OrderCreated', JSON.stringify(eventPayload), 'PENDING']
    );
    const outboxId = outboxRes.rows[0].id;

    await client.query('COMMIT');

    // Step 9: Publish OrderCreated Event to Kafka
    if (isProducerConnected) {
      try {
        await producer.send({
          topic: 'orders.created',
          messages: [
            {
              key: String(newOrder.oid),
              value: JSON.stringify(eventPayload)
            }
          ]
        });
        await pool.query('UPDATE "OutboxEvent" SET status = $1 WHERE id = $2', ['PUBLISHED', outboxId]);
        console.log(`[order-service] Published OrderCreated event for oid ${newOrder.oid} to Kafka`);
      } catch (kErr) {
        console.error('[order-service] Failed to publish to Kafka:', kErr.message);
      }
    }

    // Step 10: Return Result to Customer
    const subtotal = reservedItems.reduce((sum, item) => sum + (item.unit_price * item.qty), 0);
    const totalAmount = subtotal * (1 - (discount / 100));

    return res.status(201).json({
      oid: newOrder.oid,
      uid: newOrder.uid,
      subtotal: parseFloat(subtotal.toFixed(2)),
      discount: parseFloat(newOrder.discount),
      totalamount: parseFloat(totalAmount.toFixed(2)),
      items: reservedItems,
      shipment: {
        status: 'PENDING'
      }
    });

  } catch (error) {
    console.error('[order-service error]', error.message);
    await client.query('ROLLBACK');
    return res.status(500).json({ message: error.message });
  } finally {
    client.release();
  }
});

// 3. Get Orders
app.get('/api/orders', async (req, res) => {
  try {
    const uid = req.query.uid ? parseInt(req.query.uid) : (req.headers['x-user-id'] ? parseInt(req.headers['x-user-id']) : null);
    let query = 'SELECT * FROM "Order"';
    let params = [];
    if (uid) {
      query += ' WHERE uid = $1';
      params.push(uid);
    }
    query += ' ORDER BY createat DESC';
    const result = await pool.query(query, params);
    return res.status(200).json({ items: result.rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 4. Get Order by OID
app.get('/api/orders/:oid', async (req, res) => {
  try {
    const oid = parseInt(req.params.oid);
    const orderRes = await pool.query('SELECT * FROM "Order" WHERE oid = $1', [oid]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    const detailsRes = await pool.query('SELECT * FROM "OrderDetail" WHERE oid = $1', [oid]);
    return res.status(200).json({
      ...orderRes.rows[0],
      items: detailsRes.rows
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[order-service] Running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('[order-service] Initialization error:', err.message);
});

module.exports = app;
