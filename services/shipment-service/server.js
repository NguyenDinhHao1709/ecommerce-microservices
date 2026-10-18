require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const { MongoClient } = require('mongodb');
const { Kafka } = require('kafkajs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT_SHIPMENT || 5005;
const MONGO_URI = process.env.SHIPMENT_MONGO_URI || 'mongodb://localhost:27018/shipment_db';
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';

let db, shipmentsCol;

// Kafka Consumer Setup
const kafka = new Kafka({
  clientId: 'shipment-service',
  brokers: [KAFKA_BROKER]
});
const consumer = kafka.consumer({ groupId: 'shipment-group' });
let isConsumerRunning = false;

// Idempotent Event Processor
async function processOrderCreatedEvent(payload) {
  // Support both direct payload or wrapped in payload field
  const data = payload && payload.payload ? payload.payload : payload;

  // TC-SHP-02: Check missing oid
  if (!data || !data.oid) {
    console.error('[shipment-service] Invalid event: missing oid');
    return { success: false, reason: 'Missing oid', message: 'Missing oid' };
  }

  const oid = parseInt(data.oid);

  // TC-SHP-05: Idempotency check (prevent duplicate shipment for same order)
  const existing = await shipmentsCol.findOne({ oid });
  if (existing) {
    console.log(`[shipment-service] Order ${oid} already has shipment ${existing.shipid}. Ignoring duplicate event.`);
    return { success: true, duplicate: true, message: 'Event already processed (idempotent)', shipment: existing };
  }

  // Generate unique shipid
  const highest = await shipmentsCol.find().sort({ shipid: -1 }).limit(1).toArray();
  const shipid = highest.length > 0 ? highest[0].shipid + 1 : 5001;

  const newShipment = {
    shipid,
    oid,
    status: 'PENDING',
    created_at: new Date()
  };

  await shipmentsCol.insertOne(newShipment);
  console.log(`[shipment-service] Created Shipment ${shipid} for Order ${oid} with status PENDING`);
  return { success: true, duplicate: false, message: 'Shipment created', shipment: newShipment };
}

// 1. Healthcheck
app.get('/health', async (req, res) => {
  try {
    if (!db) throw new Error('Database not initialized');
    await db.command({ ping: 1 });
    return res.status(200).json({
      status: 'UP',
      service: 'shipment-service',
      database: 'connected',
      kafkaConsumer: isConsumerRunning ? 'active' : 'connecting'
    });
  } catch (error) {
    return res.status(503).json({ status: 'DOWN', service: 'shipment-service', error: error.message });
  }
});

// 2. Get shipment by shipid (API-SHP-01)
app.get('/api/shipments/:shipid', async (req, res) => {
  try {
    const rawParam = String(req.params.shipid);
    const numId = parseInt(rawParam.replace(/^SHP-/, ''));
    if (isNaN(numId)) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    let shipment = await shipmentsCol.findOne({ shipid: numId }, { projection: { _id: 0 } });
    if (!shipment) {
      shipment = await shipmentsCol.findOne({ oid: numId }, { projection: { _id: 0 } });
    }
    if (!shipment) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    return res.status(200).json(shipment);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 3. Update shipment status (API-SHP-02)
app.patch('/api/shipments/:shipid/status', async (req, res) => {
  try {
    const rawParam = String(req.params.shipid);
    const numId = parseInt(rawParam.replace(/^SHP-/, ''));
    if (isNaN(numId)) {
      return res.status(404).json({ message: 'Shipment not found' });
    }
    const { status } = req.body;

    const validStatuses = ['PENDING', 'SHIPPING', 'DELIVERED', 'CANCELLED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Allowed: ' + validStatuses.join(', ') });
    }

    let result = await shipmentsCol.findOneAndUpdate(
      { shipid: numId },
      { $set: { status, updated_at: new Date() } },
      { returnDocument: 'after', projection: { _id: 0 } }
    );
    if (!result) {
      result = await shipmentsCol.findOneAndUpdate(
        { oid: numId },
        { $set: { status, updated_at: new Date() } },
        { returnDocument: 'after', projection: { _id: 0 } }
      );
    }

    if (!result) {
      return res.status(404).json({ message: 'Shipment not found' });
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 4. Internal Endpoint: Direct process event (supports testing & fallback)
app.post('/internal/process-event', async (req, res) => {
  try {
    const result = await processOrderCreatedEvent(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Connect DB and Start Server
async function start() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('shipment_db');
  shipmentsCol = db.collection('shipments');
  await shipmentsCol.createIndex({ shipid: 1 }, { unique: true });
  await shipmentsCol.createIndex({ oid: 1 }, { unique: true });
  console.log('[shipment-service] Connected to MongoDB shipment_db');

  app.listen(PORT, () => {
    console.log(`[shipment-service] Running on port ${PORT}`);
  });

  // Start Kafka consumer asynchronously in background
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'orders.created', fromBeginning: true });
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const raw = message.value.toString();
          const eventData = JSON.parse(raw);
          console.log(`[shipment-service] Received Kafka event on ${topic}:`, eventData);
          await processOrderCreatedEvent(eventData);
        } catch (e) {
          console.error('[shipment-service] Error handling Kafka message:', e.message);
        }
      }
    });
    isConsumerRunning = true;
    console.log('[shipment-service] Kafka consumer active');
  } catch (kErr) {
    console.warn('[shipment-service] Kafka consumer connection warning:', kErr.message);
  }
}

start().catch(err => {
  console.error('[shipment-service] Failed to start:', err.message);
});

module.exports = app;
