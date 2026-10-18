const fs = require('fs');
const path = require('path');

const adminToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOjEsInVzZXJuYW1lIjoiQWRtaW4iLCJyb2xlIjoiQWRtaW4iLCJpYXQiOjE3OTA1MDEwOTYsImV4cCI6MjEwNTg2MTA5Nn0.yAQuSrdD3oMGlVKi3uG8xQ5wu0EaW3AegVeiGDi9lA0";

const collection = {
  info: {
    _postman_id: "e0a124c1-6f42-4919-8664-9b88dbb51f04",
    name: "E-Commerce Microservices P3 (Full 25 Test Cases)",
    description: "Bộ kiểm thử tự động toàn diện 25 Test Cases qua 5 Bounded Contexts theo đặc tả 25_TestCases_5_BoundedContexts.xlsx",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  variable: [
    { key: "base_url", value: "http://localhost:8080", type: "string" },
    { key: "admin_token", value: adminToken, type: "string" },
    { key: "token", value: "", type: "string" },
    { key: "uid", value: "1", type: "string" },
    { key: "pid", value: "1", type: "string" },
    { key: "oid", value: "1", type: "string" },
    { key: "username", value: "user_" + Date.now(), type: "string" }
  ],
  item: [
    // FOLDER 1: IDENTITY & ACCESS
    {
      name: "1. Identity & Access (TC-IAM-01 -> TC-IAM-05)",
      item: [
        {
          name: "TC-IAM-01: Đăng ký tài khoản mới hợp lệ",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 201 Created', function () { pm.response.to.have.status(201); });",
                "var json = pm.response.json();",
                "if (json.uid) { pm.collectionVariables.set('uid', json.uid); }"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: { mode: "raw", raw: JSON.stringify({ username: "{{username}}", password: "Password@123", fullname: "Nguyen Van A" }, null, 2) },
            url: { raw: "{{base_url}}/api/auth/register", host: ["{{base_url}}"], path: ["api", "auth", "register"] }
          },
          response: []
        },
        {
          name: "TC-IAM-02: Đăng ký username đã tồn tại",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 409 Conflict', function () { pm.response.to.have.status(409); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: { mode: "raw", raw: JSON.stringify({ username: "{{username}}", password: "Password@123", fullname: "Duplicate User" }, null, 2) },
            url: { raw: "{{base_url}}/api/auth/register", host: ["{{base_url}}"], path: ["api", "auth", "register"] }
          },
          response: []
        },
        {
          name: "TC-IAM-03: Đăng ký thiếu password",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 400 Bad Request', function () { pm.response.to.have.status(400); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: { mode: "raw", raw: JSON.stringify({ username: "nopass_user", password: "", fullname: "Missing Pass" }, null, 2) },
            url: { raw: "{{base_url}}/api/auth/register", host: ["{{base_url}}"], path: ["api", "auth", "register"] }
          },
          response: []
        },
        {
          name: "TC-IAM-04: Đăng nhập đúng thông tin",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Token returned', function () { pm.expect(json.accessToken).to.not.be.empty; });",
                "if (json.accessToken) { pm.collectionVariables.set('token', json.accessToken); }"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: { mode: "raw", raw: JSON.stringify({ username: "{{username}}", password: "Password@123" }, null, 2) },
            url: { raw: "{{base_url}}/api/auth/login", host: ["{{base_url}}"], path: ["api", "auth", "login"] }
          },
          response: []
        },
        {
          name: "TC-IAM-05: Đăng nhập sai password",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 401 Unauthorized', function () { pm.response.to.have.status(401); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: { mode: "raw", raw: JSON.stringify({ username: "{{username}}", password: "WrongPassword" }, null, 2) },
            url: { raw: "{{base_url}}/api/auth/login", host: ["{{base_url}}"], path: ["api", "auth", "login"] }
          },
          response: []
        }
      ]
    },

    // FOLDER 2: CUSTOMER & MEMBERSHIP
    {
      name: "2. Customer & Membership (TC-CUS-01 -> TC-CUS-05)",
      item: [
        {
          name: "TC-CUS-01: Lấy thông tin Customer tồn tại",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Customer has fullname', function () { pm.expect(json.fullname).to.not.be.empty; });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{token}}" }],
            url: { raw: "{{base_url}}/api/customers/{{uid}}", host: ["{{base_url}}"], path: ["api", "customers", "{{uid}}"] }
          },
          response: []
        },
        {
          name: "TC-CUS-02: Lấy Customer không tồn tại",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 404 Not Found', function () { pm.response.to.have.status(404); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{token}}" }],
            url: { raw: "{{base_url}}/api/customers/999999", host: ["{{base_url}}"], path: ["api", "customers", "999999"] }
          },
          response: []
        },
        {
          name: "TC-CUS-03: Cập nhật fullname khách hàng",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Fullname updated', function () { pm.expect(json.fullname).to.eql('Nguyen Van A Updated'); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{token}}" }
            ],
            body: { mode: "raw", raw: JSON.stringify({ fullname: "Nguyen Van A Updated" }, null, 2) },
            url: { raw: "{{base_url}}/api/customers/{{uid}}", host: ["{{base_url}}"], path: ["api", "customers", "{{uid}}"] }
          },
          response: []
        },
        {
          name: "TC-CUS-04: Lấy thông tin Membership",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Membership exists', function () { pm.expect(json.mname || json.membership.mname).to.not.be.empty; });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{token}}" }],
            url: { raw: "{{base_url}}/api/customers/{{uid}}", host: ["{{base_url}}"], path: ["api", "customers", "{{uid}}"] }
          },
          response: []
        },
        {
          name: "TC-CUS-05: Truy vấn không gửi kèm token",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 401 Unauthorized', function () { pm.response.to.have.status(401); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "GET",
            header: [],
            url: { raw: "{{base_url}}/api/customers/{{uid}}", host: ["{{base_url}}"], path: ["api", "customers", "{{uid}}"] }
          },
          response: []
        }
      ]
    },

    // FOLDER 3: PRODUCT CATALOG
    {
      name: "3. Product Catalog (TC-PRO-01 -> TC-PRO-05)",
      item: [
        {
          name: "TC-PRO-01: Lấy danh sách sản phẩm",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Items array returned', function () { pm.expect(json.items || json).to.be.an('array'); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{token}}" }],
            url: { raw: "{{base_url}}/api/products", host: ["{{base_url}}"], path: ["api", "products"] }
          },
          response: []
        },
        {
          name: "TC-PRO-04: Thêm sản phẩm mới (Admin)",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 201 Created', function () { pm.response.to.have.status(201); });",
                "var json = pm.response.json();",
                "if (json.pid) { pm.collectionVariables.set('pid', json.pid); }"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{admin_token}}" }
            ],
            body: { mode: "raw", raw: JSON.stringify({ pname: "Postman Test Product " + Date.now(), price: 1200, quantity: 50 }, null, 2) },
            url: { raw: "{{base_url}}/api/products", host: ["{{base_url}}"], path: ["api", "products"] }
          },
          response: []
        },
        {
          name: "TC-PRO-02: Lấy chi tiết sản phẩm tồn tại",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Product details returned', function () { pm.expect(json.pid).to.eql(pm.collectionVariables.get('pid')); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{token}}" }],
            url: { raw: "{{base_url}}/api/products/{{pid}}", host: ["{{base_url}}"], path: ["api", "products", "{{pid}}"] }
          },
          response: []
        },
        {
          name: "TC-PRO-03: Lấy sản phẩm không tồn tại",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 404 Not Found', function () { pm.response.to.have.status(404); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{token}}" }],
            url: { raw: "{{base_url}}/api/products/999999", host: ["{{base_url}}"], path: ["api", "products", "999999"] }
          },
          response: []
        },
        {
          name: "TC-PRO-05: Cập nhật tồn kho sản phẩm",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "PUT",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{admin_token}}" }
            ],
            body: { mode: "raw", raw: JSON.stringify({ quantity: 80 }, null, 2) },
            url: { raw: "{{base_url}}/api/products/{{pid}}", host: ["{{base_url}}"], path: ["api", "products", "{{pid}}"] }
          },
          response: []
        }
      ]
    },

    // FOLDER 4: ORDER MANAGEMENT
    {
      name: "4. Order Management (TC-ORD-01 -> TC-ORD-05)",
      item: [
        {
          name: "TC-ORD-02: Tạo đơn hàng không có JWT",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 401 Unauthorized', function () { pm.response.to.have.status(401); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: { mode: "raw", raw: JSON.stringify({ items: [{ pid: 1, qty: 1 }] }, null, 2) },
            url: { raw: "{{base_url}}/api/orders", host: ["{{base_url}}"], path: ["api", "orders"] }
          },
          response: []
        },
        {
          name: "TC-ORD-03: Đặt số lượng vượt tồn kho",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 409 Conflict', function () { pm.response.to.have.status(409); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{token}}" }
            ],
            body: { mode: "raw", raw: JSON.stringify({ items: [{ pid: 1, qty: 9999 }] }, null, 2) },
            url: { raw: "{{base_url}}/api/orders", host: ["{{base_url}}"], path: ["api", "orders"] }
          },
          response: []
        },
        {
          name: "TC-ORD-01: Tạo đơn hàng hợp lệ",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 201 Created', function () { pm.response.to.have.status(201); });",
                "var json = pm.response.json();",
                "if (json.oid) { pm.collectionVariables.set('oid', json.oid); }"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{token}}" }
            ],
            body: { mode: "raw", raw: JSON.stringify({ items: [{ pid: 1, qty: 1 }] }, null, 2) },
            url: { raw: "{{base_url}}/api/orders", host: ["{{base_url}}"], path: ["api", "orders"] }
          },
          response: []
        },
        {
          name: "TC-ORD-04: Tính chiết khấu theo điểm score",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 201 Created', function () { pm.response.to.have.status(201); });",
                "var json = pm.response.json();",
                "pm.test('Discount is calculated', function () { pm.expect(json.discount).to.not.be.undefined; });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{token}}" }
            ],
            body: { mode: "raw", raw: JSON.stringify({ items: [{ pid: 1, qty: 1 }] }, null, 2) },
            url: { raw: "{{base_url}}/api/orders", host: ["{{base_url}}"], path: ["api", "orders"] }
          },
          response: []
        },
        {
          name: "TC-ORD-05: Lưu đơn và phát sự kiện",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Order details retrieved', function () { pm.expect(json.oid).to.eql(pm.collectionVariables.get('oid')); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{token}}" }],
            url: { raw: "{{base_url}}/api/orders/{{oid}}", host: ["{{base_url}}"], path: ["api", "orders", "{{oid}}"] }
          },
          response: []
        }
      ]
    },

    // FOLDER 5: SHIPMENT
    {
      name: "5. Shipment (TC-SHP-01 -> TC-SHP-05)",
      item: [
        {
          name: "TC-SHP-01: Tiếp nhận sự kiện OrderCreated",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Shipment status is PENDING', function () { pm.expect(json.status).to.eql('PENDING'); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "GET",
            header: [{ key: "Authorization", value: "Bearer {{token}}" }],
            url: { raw: "{{base_url}}/api/shipments/{{oid}}", host: ["{{base_url}}"], path: ["api", "shipments", "{{oid}}"] }
          },
          response: []
        },
        {
          name: "TC-SHP-02: Xử lý sự kiện thiếu oid",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 400 Bad Request', function () { pm.response.to.have.status(400); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: { mode: "raw", raw: JSON.stringify({ uid: 1, total_amount: 100 }, null, 2) },
            url: { raw: "http://localhost:5005/internal/process-event", protocol: "http", host: ["localhost"], port: "5005", path: ["internal", "process-event"] }
          },
          response: []
        },
        {
          name: "TC-SHP-03: Cập nhật trạng thái giao hàng",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Status updated to SHIPPING', function () { pm.expect(json.status).to.eql('SHIPPING'); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "PATCH",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{admin_token}}" }
            ],
            body: { mode: "raw", raw: JSON.stringify({ status: "SHIPPING" }, null, 2) },
            url: { raw: "{{base_url}}/api/shipments/{{oid}}/status", host: ["{{base_url}}"], path: ["api", "shipments", "{{oid}}", "status"] }
          },
          response: []
        },
        {
          name: "TC-SHP-04: Cập nhật Shipment không tồn tại",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 404 Not Found', function () { pm.response.to.have.status(404); });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "PATCH",
            header: [
              { key: "Content-Type", value: "application/json" },
              { key: "Authorization", value: "Bearer {{admin_token}}" }
            ],
            body: { mode: "raw", raw: JSON.stringify({ status: "SHIPPING" }, null, 2) },
            url: { raw: "{{base_url}}/api/shipments/999999/status", host: ["{{base_url}}"], path: ["api", "shipments", "999999", "status"] }
          },
          response: []
        },
        {
          name: "TC-SHP-05: Xử lý trùng lặp sự kiện (Idempotent)",
          event: [{
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is 200 OK', function () { pm.response.to.have.status(200); });",
                "var json = pm.response.json();",
                "pm.test('Event is marked duplicate or already processed', function () { pm.expect(json.duplicate || json.message).to.be.ok; });"
              ],
              type: "text/javascript"
            }
          }],
          request: {
            method: "POST",
            header: [{ key: "Content-Type", value: "application/json" }],
            body: { mode: "raw", raw: JSON.stringify({ oid: 9991, uid: 1, total_amount: 250 }, null, 2) },
            url: { raw: "http://localhost:5005/internal/process-event", protocol: "http", host: ["localhost"], port: "5005", path: ["internal", "process-event"] }
          },
          response: []
        }
      ]
    }
  ]
};

fs.writeFileSync(path.join(__dirname, '../postman_collection.json'), JSON.stringify(collection, null, 2));
console.log('Successfully generated full 25 Test Cases Postman collection!');
