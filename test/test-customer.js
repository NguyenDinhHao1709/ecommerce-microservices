const http = require('http');

const BASE_URL = 'http://localhost:5002';

function request(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: { 'Content-Type': 'application/json' }
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
  console.log('=== Running Test Cases for Customer & Membership (customer-service) ===\n');
  await new Promise((r) => setTimeout(r, 1000));

  // Seed 1 customer via internal endpoint
  await request('POST', '/internal/customers', {
    uid: 100,
    fullname: 'Alice Wonderland',
    mid: 2 // Silver (score 100)
  });

  // TC-CUS-01: Lấy Customer tồn tại
  console.log('[TC-CUS-01] Testing get existing customer...');
  const res1 = await request('GET', '/api/customers/100');
  console.log('Result:', res1.status, res1.data);
  if (res1.status !== 200 || res1.data.uid !== 100) throw new Error('TC-CUS-01 Failed');

  // TC-CUS-02: Lấy Customer không tồn tại
  console.log('\n[TC-CUS-02] Testing get non-existent customer...');
  const res2 = await request('GET', '/api/customers/999999');
  console.log('Result:', res2.status, res2.data);
  if (res2.status !== 404) throw new Error('TC-CUS-02 Failed');

  // TC-CUS-03: Cập nhật fullname Customer
  console.log('\n[TC-CUS-03] Testing update customer fullname...');
  const res3 = await request('PUT', '/api/customers/100', {
    fullname: 'Alice Cooper'
  });
  console.log('Result:', res3.status, res3.data);
  const verifyUpdate = await request('GET', '/api/customers/100');
  if (res3.status !== 200 || verifyUpdate.data.fullname !== 'Alice Cooper') {
    throw new Error('TC-CUS-03 Failed');
  }

  // TC-CUS-04: Lấy thông tin Membership (mname, score)
  console.log('\n[TC-CUS-04] Testing retrieve membership mname and score...');
  const res4 = await request('GET', '/api/customers/100');
  console.log('Membership info:', { mname: res4.data.mname, score: res4.data.score });
  if (res4.status !== 200 || res4.data.mname !== 'Silver' || res4.data.score !== 100) {
    throw new Error('TC-CUS-04 Failed');
  }

  console.log('\n>>> ALL CUSTOMER TEST CASES PASSED SUCCESSFULLY! <<<\n');
  process.exit(0);
}

run().catch((e) => {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
});
