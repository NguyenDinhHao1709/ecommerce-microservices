const http = require('http');

const BASE_URL = 'http://localhost:5001';

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
  console.log('=== Running Test Cases for Identity & Access (auth-service) ===\n');
  await new Promise((r) => setTimeout(r, 1000));

  const testUser = `john_${Date.now()}`;

  // TC-IAM-01: Đăng ký tài khoản hợp lệ
  console.log('[TC-IAM-01] Testing valid registration...');
  const res1 = await request('POST', '/api/auth/register', {
    username: testUser,
    password: 'P@ssword123',
    fullname: 'John Doe'
  });
  console.log('Result:', res1.status, res1.data);
  if (res1.status !== 201 || !res1.data.uid) throw new Error('TC-IAM-01 Failed');

  // TC-IAM-02: Đăng ký username đã tồn tại
  console.log('\n[TC-IAM-02] Testing duplicate username registration...');
  const res2 = await request('POST', '/api/auth/register', {
    username: testUser,
    password: 'P@ssword123'
  });
  console.log('Result:', res2.status, res2.data);
  if (res2.status !== 409) throw new Error('TC-IAM-02 Failed');

  // TC-IAM-03: Đăng ký thiếu password
  console.log('\n[TC-IAM-03] Testing registration missing password...');
  const res3 = await request('POST', '/api/auth/register', {
    username: `user_${Date.now()}`
  });
  console.log('Result:', res3.status, res3.data);
  if (res3.status !== 400) throw new Error('TC-IAM-03 Failed');

  // TC-IAM-04: Đăng nhập đúng thông tin
  console.log('\n[TC-IAM-04] Testing valid login...');
  const res4 = await request('POST', '/api/auth/login', {
    username: testUser,
    password: 'P@ssword123'
  });
  console.log('Result:', res4.status, '| AccessToken exists:', !!res4.data.accessToken);
  if (res4.status !== 200 || !res4.data.accessToken) throw new Error('TC-IAM-04 Failed');

  // TC-IAM-05: Đăng nhập sai password
  console.log('\n[TC-IAM-05] Testing login with wrong password...');
  const res5 = await request('POST', '/api/auth/login', {
    username: testUser,
    password: 'WrongPassword'
  });
  console.log('Result:', res5.status, res5.data);
  if (res5.status !== 401) throw new Error('TC-IAM-05 Failed');

  console.log('\n>>> ALL 5 IAM TEST CASES PASSED SUCCESSFULLY! <<<\n');
  process.exit(0);
}

run().catch((e) => {
  console.error('\n❌ Test failed:', e.message);
  process.exit(1);
});
