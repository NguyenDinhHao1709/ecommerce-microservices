const axios = require('axios');
const jwt = require('jsonwebtoken');

const GATEWAY_URL = 'http://localhost:8080';
const JWT_SECRET = 'super_secret_jwt_microservices_2026';

let passed = 0;
let total = 0;

function assert(description, condition) {
  total++;
  if (condition) {
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
  }
}

async function runGatewayTests() {
  console.log('\n======================================================');
  console.log('   STEP 7 & 8: API GATEWAY & DISTRIBUTED HEALTH TEST  ');
  console.log('======================================================\n');

  // Test 1: Centralized Healthcheck (Step 8 / API-HEALTH-01)
  console.log('--- 1. Testing Centralized Healthcheck ---');
  try {
    const res = await axios.get(`${GATEWAY_URL}/api/health`, { timeout: 4000 });
    assert('Healthcheck returns 200 OK', res.status === 200);
    assert('Healthcheck status is UP', res.data.status === 'UP');
    assert('Redis is connected', res.data.redis === 'connected');
    assert('All 5 microservices are UP', 
      res.data.services.auth === 'UP' &&
      res.data.services.customer === 'UP' &&
      res.data.services.product === 'UP' &&
      res.data.services.order === 'UP' &&
      res.data.services.shipment === 'UP'
    );
  } catch (err) {
    console.error('Healthcheck error:', err.response?.data || err.message);
    assert('Healthcheck returns 200 OK', false);
  }

  // Test 2: Reverse Proxy Routing (Auth Service through Gateway)
  console.log('\n--- 2. Testing Reverse Proxy Routing (Auth Service) ---');
  const testUsername = `gw_user_${Date.now()}`;
  let customerToken = null;
  try {
    const regRes = await axios.post(`${GATEWAY_URL}/api/auth/register`, {
      username: testUsername,
      password: 'Password123',
      fullname: 'Gateway Tester'
    });
    assert('Gateway routes POST /api/auth/register (201 Created)', regRes.status === 201);

    const loginRes = await axios.post(`${GATEWAY_URL}/api/auth/login`, {
      username: testUsername,
      password: 'Password123'
    });
    const token = loginRes.data.accessToken || loginRes.data.token;
    assert('Gateway routes POST /api/auth/login (200 OK)', loginRes.status === 200 && !!token);
    customerToken = token;
  } catch (err) {
    console.error('Auth routing error:', err.response?.data || err.message);
    assert('Gateway routing auth succeeded', false);
  }

  // Test 3: JWT Guard (TC-CUS-05, TC-ORD-02)
  console.log('\n--- 3. Testing JWT Security Guard ---');
  try {
    // Missing token on Customer API
    await axios.get(`${GATEWAY_URL}/api/customers/1`);
    assert('Missing token on customer endpoint rejected with 401', false);
  } catch (err) {
    assert('Missing token on customer endpoint rejected with 401 (TC-CUS-05)', err.response?.status === 401);
  }

  try {
    // Missing token on Order API
    await axios.post(`${GATEWAY_URL}/api/orders`, { pid: 'mock', qty: 1 });
    assert('Missing token on order endpoint rejected with 401', false);
  } catch (err) {
    assert('Missing token on order endpoint rejected with 401 (TC-ORD-02)', err.response?.status === 401);
  }

  try {
    // Invalid/Tampered token
    await axios.get(`${GATEWAY_URL}/api/customers/1`, {
      headers: { Authorization: 'Bearer invalid.tampered.token' }
    });
    assert('Tampered token rejected with 401', false);
  } catch (err) {
    assert('Tampered token rejected with 401', err.response?.status === 401);
  }

  // Test 4: Role-Based Authorization Guard (Customer vs Admin)
  console.log('\n--- 4. Testing Role-Based Authorization Guard ---');
  try {
    // Customer trying to create product
    await axios.post(`${GATEWAY_URL}/api/products`, {
      pname: 'Unauthorized TV',
      price: 1000,
      qty: 5
    }, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert('Non-admin product creation blocked with 403', false);
  } catch (err) {
    assert('Non-admin product creation blocked with 403 Forbidden', err.response?.status === 403);
  }

  // Generate Admin token
  const adminToken = jwt.sign(
    { uid: 999, username: 'admin', role: 'Admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  let createdPid = null;
  try {
    // Admin creates product
    const adminRes = await axios.post(`${GATEWAY_URL}/api/products`, {
      pname: `GW Gateway Product ${Date.now()}`,
      price: 500,
      qty: 20
    }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert('Admin product creation allowed with 201 Created', adminRes.status === 201);
    createdPid = adminRes.data.pid;
  } catch (err) {
    console.error('Admin create product error:', err.response?.data || err.message);
    assert('Admin product creation allowed with 201 Created', false);
  }

  // Test 5: Redis Caching for Product List
  console.log('\n--- 5. Testing Redis Caching for Products ---');
  try {
    // First request: Cache Miss
    const res1 = await axios.get(`${GATEWAY_URL}/api/products`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert('First GET /api/products returns 200 OK', res1.status === 200 && Array.isArray(res1.data.items || res1.data));
    assert('First request has X-Cache: MISS', res1.headers['x-cache'] === 'MISS');

    // Second request: Cache Hit
    const res2 = await axios.get(`${GATEWAY_URL}/api/products`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert('Second GET /api/products returns 200 OK', res2.status === 200);
    assert('Second request has X-Cache: HIT (served from Redis)', res2.headers['x-cache'] === 'HIT');
  } catch (err) {
    console.error('Cache test error:', err.response?.data || err.message);
    assert('Redis caching works', false);
  }

  console.log('\n======================================================');
  console.log(`GATEWAY VERIFICATION: ${passed}/${total} assertions passed`);
  console.log('======================================================\n');

  if (passed === total) {
    console.log('🎉 STEP 7 & STEP 8 VERIFICATION SUCCESSFUL!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME GATEWAY TESTS FAILED!\n');
    process.exit(1);
  }
}

runGatewayTests();
