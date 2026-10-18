const http = require('http');
const { Pool } = require('pg');

const BASE_URL = 'http://localhost:5004';
const DB_URL = 'postgresql://postgres:postgres@localhost:5433/order_db';
const pool = new Pool({ connectionString: DB_URL });

function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('=== Running Test Cases for Order Management (order-service) ===\n');
  await new Promise((r) => setTimeout(r, 1000));

  // TC-ORD-01: Tạo Order hợp lệ
  console.log('[TC-ORD-01] Testing create valid order...');
  const res1 = await request('POST', '/api/orders', {
    uid: 100, // Silver customer (score 100)
    items: [
      { pid: 2, qty: 1 } // Wireless mouse
    ]
  });
  console.log('Order created result:', res1.status, res1.data);
  if (res1.status !== 201 || !res1.data.oid || res1.data.shipment.status !== 'PENDING') {
    throw new Error('TC-ORD-01 Failed');
  }

  // TC-ORD-03: Đặt số lượng vượt tồn kho
  console.log('\n[TC-ORD-03] Testing order quantity exceeding stock...');
  const res3 = await request('POST', '/api/orders', {
    uid: 100,
    items: [
      { pid: 1, qty: 99999 } // Exceeds stock
    ]
  });
  console.log('Exceed stock result:', res3.status, res3.data);
  if (res3.status !== 409) throw new Error('TC-ORD-03 Failed');

  // TC-ORD-04: Tính discount theo score
  console.log('\n[TC-ORD-04] Testing discount calculation based on membership score...');
  console.log('Customer score 100 (Silver) discount received:', res1.data.discount);
  if (res1.data.discount !== 10) {
    throw new Error('TC-ORD-04 Failed: Expected 10% discount for Silver customer');
  }

  // TC-ORD-05: Lưu đơn và phát sự kiện vào Kafka (Check Outbox table)
  console.log('\n[TC-ORD-05] Checking OutboxEvent persisted and published...');
  const outboxCheck = await pool.query(
    'SELECT * FROM "OutboxEvent" WHERE aggregate_id = $1',
    [res1.data.oid]
  );
  console.log('Outbox event in database:', {
    event_type: outboxCheck.rows[0]?.event_type,
    status: outboxCheck.rows[0]?.status
  });
  if (
    outboxCheck.rows.length === 0 ||
    outboxCheck.rows[0].event_type !== 'OrderCreated'
  ) {
    throw new Error('TC-ORD-05 Failed');
  }

  console.log('\n>>> ALL ORDER TEST CASES PASSED SUCCESSFULLY! <<<\n');
  await pool.end();
  process.exit(0);
}

run().catch(async (e) => {
  console.error('\n❌ Test failed:', e.message);
  await pool.end();
  process.exit(1);
});
