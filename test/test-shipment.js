const http = require('http');

const BASE_URL = 'http://localhost:5005';

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
  console.log('=== Running Test Cases for Shipment Bounded Context (shipment-service) ===\n');
  await new Promise((r) => setTimeout(r, 1000));

  const testOid = 9991;

  // TC-SHP-01: Nhận OrderCreated Event -> Shipment được tạo
  console.log('[TC-SHP-01] Testing process OrderCreated event...');
  const res1 = await request('POST', '/internal/process-event', {
    oid: testOid,
    uid: 100,
    items: [{ pid: 1, qty: 1 }]
  });
  console.log('Shipment creation result:', res1.status, res1.data);
  if (res1.status !== 200 || !res1.data.shipment || res1.data.shipment.status !== 'PENDING') {
    throw new Error('TC-SHP-01 Failed');
  }
  const createdShipId = res1.data.shipment.shipid;

  // TC-SHP-02: Event thiếu oid -> Không tạo Shipment
  console.log('\n[TC-SHP-02] Testing event missing oid...');
  const res2 = await request('POST', '/internal/process-event', {
    uid: 100
  });
  console.log('Missing oid result:', res2.status, res2.data);
  if (res2.status !== 400 || res2.data.success !== false) {
    throw new Error('TC-SHP-02 Failed');
  }

  // TC-SHP-03: Cập nhật trạng thái Shipment -> status = SHIPPING
  console.log(`\n[TC-SHP-03] Testing update shipment ${createdShipId} status to SHIPPING...`);
  const res3 = await request('PATCH', `/api/shipments/${createdShipId}/status`, {
    status: 'SHIPPING'
  });
  console.log('Update result:', res3.status, res3.data);
  if (res3.status !== 200 || res3.data.status !== 'SHIPPING') {
    throw new Error('TC-SHP-03 Failed');
  }

  // TC-SHP-04: Cập nhật Shipment không tồn tại -> 404
  console.log('\n[TC-SHP-04] Testing update non-existent shipment...');
  const res4 = await request('PATCH', '/api/shipments/999999/status', {
    status: 'DELIVERED'
  });
  console.log('Non-existent result:', res4.status, res4.data);
  if (res4.status !== 404) throw new Error('TC-SHP-04 Failed');

  // TC-SHP-05: Nhận cùng Event hai lần (Idempotency)
  console.log('\n[TC-SHP-05] Testing duplicate OrderCreated event idempotency...');
  const res5 = await request('POST', '/internal/process-event', {
    oid: testOid,
    uid: 100
  });
  console.log('Duplicate event result:', res5.status, '| duplicate:', res5.data.duplicate);
  if (res5.status !== 200 || res5.data.duplicate !== true) {
    throw new Error('TC-SHP-05 Failed');
  }

  console.log('\n>>> ALL SHIPMENT TEST CASES PASSED SUCCESSFULLY! <<<\n');
  process.exit(0);
}

run().catch((e) => {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
});
