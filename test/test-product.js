const http = require('http');

const BASE_URL = 'http://localhost:5003';

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
  console.log('=== Running Test Cases for Product Catalog (product-service) ===\n');
  await new Promise((r) => setTimeout(r, 1000));

  // TC-PRO-01: Lấy danh sách Product
  console.log('[TC-PRO-01] Testing get product list...');
  const res1 = await request('GET', '/api/products');
  console.log('Items count:', res1.data.items?.length);
  if (res1.status !== 200 || !Array.isArray(res1.data.items) || res1.data.items.length === 0) {
    throw new Error('TC-PRO-01 Failed');
  }

  // TC-PRO-02: Lấy Product tồn tại
  console.log('\n[TC-PRO-02] Testing get existing product (pid: 1)...');
  const res2 = await request('GET', '/api/products/1');
  console.log('Result:', res2.status, res2.data);
  if (res2.status !== 200 || res2.data.pid !== 1) throw new Error('TC-PRO-02 Failed');

  // TC-PRO-03: Lấy Product không tồn tại
  console.log('\n[TC-PRO-03] Testing get non-existent product...');
  const res3 = await request('GET', '/api/products/99999');
  console.log('Result:', res3.status, res3.data);
  if (res3.status !== 404) throw new Error('TC-PRO-03 Failed');

  // TC-PRO-04: Tạo Product
  console.log('\n[TC-PRO-04] Testing create product...');
  const res4 = await request('POST', '/api/products', {
    pname: '4K Gaming Monitor',
    price: 499.99,
    quantity: 15
  });
  console.log('Created product:', res4.data);
  if (res4.status !== 201 || !res4.data.pid) throw new Error('TC-PRO-04 Failed');
  const newPid = res4.data.pid;

  // TC-PRO-05: Cập nhật tồn kho
  console.log('\n[TC-PRO-05] Testing update product quantity...');
  const res5 = await request('PUT', `/api/products/${newPid}`, {
    quantity: 25
  });
  console.log('Update result:', res5.data);
  const verifyProd = await request('GET', `/api/products/${newPid}`);
  console.log('Verified quantity:', verifyProd.data.quantity);
  if (res5.status !== 200 || verifyProd.data.quantity !== 25) {
    throw new Error('TC-PRO-05 Failed');
  }

  console.log('\n>>> ALL PRODUCT TEST CASES PASSED SUCCESSFULLY! <<<\n');
  process.exit(0);
}

run().catch((e) => {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
});
