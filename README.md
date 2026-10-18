# BÀI TẬP PROMPT 3: E-COMMERCE MICROSERVICES ARCHITECTURE (DDD & DATABASE-PER-SERVICE)

---

## 1. TỔNG QUAN BÀI TOÁN & YÊU CẦU NGHIỆP VỤ

### 1.1. Bối cảnh & Mục tiêu
Chuyển đổi và nâng cấp hệ thống thương mại điện tử từ mô hình Monolith (P2) lên kiến trúc **Microservices phân tán**, áp dụng triệt để phương pháp luận **Domain-Driven Design (DDD)** và mẫu thiết kế **Database-per-Service** bằng nền tảng **Node.js**.

Hệ thống phục vụ phiên bản Minimum Viable Product (MVP) với mục tiêu:
- Tách biệt rõ ràng ranh giới nghiệp vụ (Bounded Contexts).
- Độc lập lưu trữ dữ liệu (Polyglot Persistence: kết hợp PostgreSQL và MongoDB).
- Giao tiếp bất đồng bộ qua Message Broker (**Apache Kafka**) áp dụng mẫu **Transactional Outbox Pattern**.
- Cổng giao tiếp tập trung (**API Gateway**) tích hợp **Redis** đảm nhiệm: Định tuyến (Routing), Xác thực & Phân quyền (Authentication/Authorization với JWT), Giới hạn tần suất truy cập (Rate Limiting), Bộ nhớ đệm (Caching), và Nhật ký hệ thống (Logging).
- Đóng gói toàn bộ hệ thống bằng **Docker Compose** sẵn sàng chạy trên môi trường local.
- Giám sát sức khỏe (**Health Check**) toàn diện cho từng service và toàn bộ hệ thống.

---

### 1.2. Nhu cầu khách hàng (Customer Requirements)
Khách hàng mong muốn một hệ thống bán hàng trực tuyến an toàn, linh hoạt:
- Người dùng đăng nhập, xem sản phẩm, đặt hàng với số lượng mong muốn.
- Hệ thống tự động nhận biết điểm thành viên (Membership Score) của khách hàng để áp dụng mức giảm giá (Discount) phù hợp.
- Kiểm tra tồn kho và cập nhật số lượng sản phẩm ngay sau khi đơn hàng được tạo.
- Tự động chuyển giao thông tin sang bộ phận vận chuyển để cập nhật tiến trình đơn hàng (Shipment Status).
- Khách hàng có thể tra cứu đơn hàng và theo dõi tình trạng xử lý/vận chuyển.
- Khả năng mở rộng độc lập khi lưu lượng và quy mô người dùng tăng cao.

---

### 1.3. Ma trận truy vết nghiệp vụ (Traceability Matrix)

| Yêu cầu KH (CR) | Nghiệp vụ (BR) | Yêu cầu chức năng (FR) | Use Case (UC) | API / Kênh giao tiếp |
| :--- | :--- | :--- | :--- | :--- |
| **CR01**: Đăng ký | BR01: Đăng ký tài khoản mới | FR01: Đăng ký | UC01: Register | `POST /api/auth/register` |
| **CR02**: Đăng nhập an toàn | BR02: Xác thực & cấp JWT | FR02: Đăng nhập; FR13: Phân quyền | UC02: Login; UC13: Authorization | `POST /api/auth/login` |
| **CR03**: Xem sản phẩm & tồn kho | BR03: Duyệt danh mục | FR06: Xem sản phẩm | UC04: View product | `GET /api/products`, `GET /api/products/:pid` |
| **CR04**: Đặt hàng & giảm giá | BR04: Áp dụng chiết khấu theo điểm | FR07: Đặt hàng; FR08: Tính giảm giá; FR10: Lưu đơn | UC06: Place order; UC07: Calculate discount; UC09: Create order | `POST /api/orders` |
| **CR05**: Cập nhật tồn kho tự động | BR05: Khấu trừ kho an toàn | FR09: Cập nhật tồn kho | UC08: Update inventory | Internal gRPC / HTTP Service-to-Service |
| **CR06**: Theo dõi giao hàng | BR06: Vận chuyển & cập nhật trạng thái | FR11: Quản lý giao hàng; FR12: Xem trạng thái | UC11: Update shipment; UC12: View order status | `GET /api/shipments/:shipid`, `PATCH /api/shipments/:shipid/status` |
| **CR07**: Quản lý tài khoản cá nhân | BR07: Xem/sửa hồ sơ & hạng thẻ | FR04: Quản lý khách hàng | UC03: Manage account | `GET /api/customers/:uid`, `PUT /api/customers/:uid` |

---

## 2. THIẾT KẾ KIẾN TRÚC HỆ THỐNG MICROSERVICES

```
                                  [ CLIENTS ]
                                       │
                                       ▼ (HTTP REST)
┌─────────────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY (Express.js)                              │
│   • Reverse Proxy & Routing           • JWT Validation & Auth Guard         │
│   • Redis Cache & Rate Limiting       • Structured Request Logging          │
└──────────────┬───────────────────┬──────────────────┬─────────────────┬─────┘
               │ (Proxy)           │ (Proxy)          │ (Proxy)         │ (Proxy)
               ▼                   ▼                  ▼                 ▼
     ┌───────────────────┐ ┌───────────────┐ ┌────────────────┐ ┌───────────────┐
     │ Identity & Access │ │  Customer &   │ │Product Catalog │ │     Order     │
     │      Service      │ │  Membership   │ │    Service     │ │  Management   │
     └─────────┬─────────┘ └───────┬───────┘ └───────┬────────┘ └───────┬───────┘
               │                   │                 │                  │
         (PostgreSQL)        (PostgreSQL)        (MongoDB)              │ (gRPC Check Stock)
               │                   │                 ▲                  │
               └───────────────────┴─────────────────┼──────────────────┘
                                                     │
                                                     │ (Kafka Event: OrderCreated)
                                                     ▼
                                            ┌─────────────────┐
                                            │    Shipment     │
                                            │    Service      │
                                            └────────┬────────┘
                                                     │
                                                 (MongoDB)
```

### 2.1. 5 Bounded Contexts & Chiến lược Polyglot Persistence

1. **Identity & Access Context (`auth-service`)**:
   - **Nhiệm vụ:** Đăng ký tài khoản, đăng nhập, mã hóa mật khẩu (`bcryptjs`), phát hành và xác thực JSON Web Token (JWT).
   - **Database:** PostgreSQL (`User`, `Role`).

2. **Customer & Membership Context (`customer-service`)**:
   - **Nhiệm vụ:** Quản lý thông tin định danh khách hàng, quản lý hạng thành viên (`Standard`, `Silver`, `Gold`) và điểm tích lũy (`score`).
   - **Database:** PostgreSQL (`Customer`, `MemberShip`).

3. **Product Catalog Context (`product-service`)**:
   - **Nhiệm vụ:** Quản lý danh mục sản phẩm, giá bán, số lượng tồn kho. Cung cấp API truy vấn nhanh và endpoint nội bộ (gRPC/HTTP) để trừ tồn kho nguyên tử.
   - **Database:** MongoDB (`Product` document collection) — tối ưu tốc độ đọc và schema linh hoạt.

4. **Order Management Context (`order-service`)**:
   - **Nhiệm vụ:** Tiếp nhận yêu cầu đặt hàng, gọi nội bộ kiểm tra/khấu trừ kho, truy vấn điểm score để tính toán chiết khấu (Discount), lưu `Order` và `OrderDetail`.
   - **Mẫu thiết kế cốt lõi:** **Transactional Outbox Pattern** — ghi Order và OutboxEvent vào cùng một Database Transaction trên PostgreSQL để đảm bảo không mất sự kiện khi xuất bản sang Kafka.
   - **Database:** PostgreSQL (`Order`, `OrderDetail`, `OutboxEvent`).

5. **Shipment Context (`shipment-service`)**:
   - **Nhiệm vụ:** Lắng nghe sự kiện `OrderCreated` từ Kafka topic `orders.created`, tự động khởi tạo bản ghi vận chuyển với trạng thái `PENDING`. Cho phép nhân viên cập nhật trạng thái (`SHIPPING`, `DELIVERED`, `CANCELLED`).
   - **Database:** MongoDB (`Shipment` collection).

---

### 2.2. Thành phần hạ tầng kỹ thuật (Infrastructure Components)

1. **API Gateway (Node.js/Express + Redis)**:
   - **Routing:** Điểm tiếp nhận duy nhất cho toàn bộ Frontend/Client, điều phối yêu cầu đến các microservice tương ứng qua mạng nội bộ Docker.
   - **Authentication & Authorization:** Kiểm tra tính hợp lệ của Header `Authorization: Bearer <JWT>`, trích xuất thông tin người dùng (`uid`, `role`) gắn vào request header chuyển tiếp.
   - **Rate Limiting:** Sử dụng Redis làm bộ đếm (sliding window/token bucket) ngăn chặn tấn công brute-force hoặc spam API.
   - **Caching:** Cache danh sách sản phẩm phổ biến trên Redis để giảm tải cho Product Service.
   - **Centralized Logging:** Ghi log tập trung mọi truy vết request (Method, Path, Response Time, Status Code).

2. **Message Broker (Apache Kafka & Zookeeper/KRaft)**:
   - Đảm bảo tính phi tập trung (Decoupling) và chịu tải cao.
   - Topic chính: `orders.created`. Producer: `order-service` (thông qua Outbox worker). Consumer: `shipment-service`.

3. **Health Check System**:
   - Endpoint `/api/health` tại Gateway kiểm tra sức khỏe tổng thể.
   - Mỗi Microservice cung cấp endpoint `/health` nội bộ tự kiểm tra:
     - Trạng thái tiến trình Node.js.
     - Trạng thái kết nối Database (PostgreSQL pool / MongoDB connection / Kafka connection).

---

## 3. ĐẶC TẢ CHI TIẾT RESTFUL API (API SPECIFICATION)

| API ID | Bounded Context | Method | Endpoint | Yêu cầu Auth | Mô tả & Chức năng | Response thành công |
| :--- | :--- | :---: | :--- | :---: | :--- | :---: |
| **API-AUTH-01** | Identity & Access | `POST` | `/api/auth/register` | Public | Đăng ký tài khoản người dùng mới | `201 Created` |
| **API-AUTH-02** | Identity & Access | `POST` | `/api/auth/login` | Public | Đăng nhập và nhận mã Bearer JWT | `200 OK` |
| **API-CUS-01** | Customer & Membership | `GET` | `/api/customers/:uid` | Bearer JWT | Xem thông tin khách hàng & hạng thẻ | `200 OK` |
| **API-CUS-02** | Customer & Membership | `PUT` | `/api/customers/:uid` | Bearer JWT | Cập nhật thông tin khách hàng | `200 OK` |
| **API-PRO-01** | Product Catalog | `GET` | `/api/products` | Bearer JWT | Xem danh sách tất cả sản phẩm | `200 OK` |
| **API-PRO-02** | Product Catalog | `GET` | `/api/products/:pid` | Bearer JWT | Xem chi tiết 1 sản phẩm | `200 OK` |
| **API-PRO-03** | Product Catalog | `POST` | `/api/products` | Bearer JWT (Admin) | Thêm sản phẩm mới vào kho | `201 Created` |
| **API-PRO-04** | Product Catalog | `PUT` | `/api/products/:pid` | Bearer JWT (Admin) | Cập nhật thông tin/giá sản phẩm | `200 OK` |
| **API-PRO-05** | Product Catalog | `DELETE` | `/api/products/:pid` | Bearer JWT (Admin) | Xóa sản phẩm khỏi danh mục | `200 OK` |
| **API-ORD-01** | Order Management | `POST` | `/api/orders` | Bearer JWT | Tạo đơn hàng, tính discount, trừ kho | `201 Created` |
| **API-ORD-02** | Order Management | `GET` | `/api/orders` | Bearer JWT | Xem danh sách đơn hàng của người dùng | `200 OK` |
| **API-ORD-03** | Order Management | `GET` | `/api/orders/:oid` | Bearer JWT | Xem chi tiết đơn hàng theo mã `oid` | `200 OK` |
| **API-SHP-01** | Shipment | `GET` | `/api/shipments/:shipid`| Bearer JWT | Tra cứu tiến trình giao hàng | `200 OK` |
| **API-SHP-02** | Shipment | `PATCH`| `/api/shipments/:shipid/status`| Bearer JWT (Staff/Admin)| Cập nhật trạng thái vận chuyển | `200 OK` |
| **API-HEALTH-01**| System Gateway | `GET` | `/api/health` | Public | Giám sát sức khỏe Gateway & Services | `200 OK` / `503` |

---

## 4. BỘ 25 TEST CASES CHUẨN THEO 5 BOUNDED CONTEXTS

| STT | Mã Test Case | Bounded Context | Tên kịch bản kiểm thử | Dữ liệu đầu vào & Điều kiện | Kết quả mong đợi |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | `TC-IAM-01` | Identity & Access | Đăng ký tài khoản hợp lệ | `username`, `password`, `email` hợp lệ | Tạo User thành công, trả về `201 Created` |
| **2** | `TC-IAM-02` | Identity & Access | Đăng ký username đã tồn tại | `username` đã có trong database | Không tạo mới, trả về `409 Conflict` |
| **3** | `TC-IAM-03` | Identity & Access | Đăng ký thiếu password | `username` hợp lệ, `password` rỗng | Trả về `400 Bad Request` |
| **4** | `TC-IAM-04` | Identity & Access | Đăng nhập đúng thông tin | `username` + `password` chính xác | Đăng nhập thành công, trả về JWT Access Token |
| **5** | `TC-IAM-05` | Identity & Access | Đăng nhập sai password | `username` đúng, `password` sai | Trả về `401 Unauthorized` |
| **6** | `TC-CUS-01` | Customer & Membership| Lấy thông tin Customer tồn tại | `uid` hợp lệ kèm JWT token | Trả về thông tin khách hàng và mã HTTP `200` |
| **7** | `TC-CUS-02` | Customer & Membership| Lấy Customer không tồn tại | `uid` không có trong hệ thống | Trả về `404 Not Found` |
| **8** | `TC-CUS-03` | Customer & Membership| Cập nhật fullname khách hàng | `fullname` mới hợp lệ | Thông tin được cập nhật, trả về `200 OK` |
| **9** | `TC-CUS-04` | Customer & Membership| Lấy thông tin Membership | Khách hàng có liên kết `mid` | Trả về chi tiết `mname` và điểm `score` |
| **10**| `TC-CUS-05` | Customer & Membership| Truy vấn không gửi kèm token | Request không có Authorization header | Bị Gateway chặn, trả về `401 Unauthorized` |
| **11**| `TC-PRO-01` | Product Catalog | Lấy danh sách sản phẩm | `GET /api/products` kèm token | Trả về danh sách mảng sản phẩm (`200 OK`) |
| **12**| `TC-PRO-02` | Product Catalog | Lấy chi tiết sản phẩm tồn tại | `pid` hợp lệ | Trả về thông tin chi tiết sản phẩm |
| **13**| `TC-PRO-03` | Product Catalog | Lấy sản phẩm không tồn tại | `pid` không có trong database | Trả về `404 Not Found` |
| **14**| `TC-PRO-04` | Product Catalog | Thêm sản phẩm mới (Admin) | Quyền Admin, dữ liệu `pname`, `price`, `qty` đủ | Sản phẩm được lưu vào MongoDB, trả về `201` |
| **15**| `TC-PRO-05` | Product Catalog | Cập nhật tồn kho sản phẩm | `pid` và `quantity` mới hợp lệ | Tồn kho được cập nhật chính xác trong MongoDB |
| **16**| `TC-ORD-01` | Order Management | Tạo đơn hàng hợp lệ | Token khách hàng + sản phẩm đủ tồn kho | Tạo Order & OrderDetail, trừ kho, trả `201` |
| **17**| `TC-ORD-02` | Order Management | Tạo đơn hàng không có JWT | Không truyền Bearer Token | Bị từ chối truy cập, trả về `401 Unauthorized` |
| **18**| `TC-ORD-03` | Order Management | Đặt số lượng vượt tồn kho | `qty` đặt mua lớn hơn tồn kho khả dụng | Từ chối tạo đơn, trả về `409 Conflict` |
| **19**| `TC-ORD-04` | Order Management | Tính chiết khấu theo điểm score | Khách hàng có điểm tích lũy | Tự động tính đúng mức `discount` vào đơn |
| **20**| `TC-ORD-05` | Order Management | Lưu đơn và phát sự kiện | Đơn hàng tạo thành công | Bản ghi ghi vào Outbox và đẩy sang Kafka topic |
| **21**| `TC-SHP-01` | Shipment | Tiếp nhận sự kiện `OrderCreated` | Kafka Event hợp lệ từ Order Service | Khởi tạo bản ghi Shipment mới (`PENDING`) |
| **22**| `TC-SHP-02` | Shipment | Xử lý sự kiện thiếu `oid` | Kafka payload bị thiếu trường bắt buộc | Ghi log lỗi, không tạo bản ghi rác |
| **23**| `TC-SHP-03` | Shipment | Cập nhật trạng thái giao hàng | Cập nhật `status = SHIPPING` | Trạng thái được cập nhật vào MongoDB (`200 OK`)|
| **24**| `TC-SHP-04` | Shipment | Cập nhật Shipment không tồn tại | `shipid` không hợp lệ | Trả về `404 Not Found` |
| **25**| `TC-SHP-05` | Shipment | Xử lý trùng lặp sự kiện (Idempotent)| Nhận cùng 1 sự kiện `OrderCreated` 2 lần| Kiểm tra trùng lặp, không tạo 2 lần shipment |



---

## 5. KẾ HOẠCH TRIỂN KHAI TỪNG BƯỚC (GOAL-DRIVEN EXECUTION)

Theo quy tắc **Think Before Coding** & **Goal-Driven Execution** trong `CLAUDE.md`, tiến trình xây dựng hệ thống Microservices sẽ được triển khai tuần tự theo 10 bước:

```markdown
1. Khởi tạo cấu trúc monorepo/multi-service & Docker Compose nền tảng (Postgres, MongoDB, Redis, Kafka)
   → verify: Tất cả container hạ tầng khởi động Up (healthy).
2. Xây dựng Identity & Access Service (auth-service) với PostgreSQL
   → verify: Đăng ký, Đăng nhập, mã hóa bcrypt và sinh JWT token hợp lệ.
3. Xây dựng Customer & Membership Service (customer-service) với PostgreSQL
   → verify: CRUD thông tin khách hàng, phân hạng và quản lý điểm score.
4. Xây dựng Product Catalog Service (product-service) với MongoDB
   → verify: CRUD sản phẩm, API khấu trừ tồn kho nguyên tử.
5. Xây dựng Order Management Service (order-service) với PostgreSQL & Outbox Pattern
   → verify: Tính discount theo score, tạo Order/OrderDetail, lưu OutboxEvent.
6. Xây dựng Shipment Service (shipment-service) với MongoDB & Kafka Consumer
   → verify: Lắng nghe sự kiện OrderCreated từ Kafka, tạo và cập nhật trạng thái Shipment.
7. Xây dựng API Gateway (Express + Redis)
   → verify: Routing chính xác tới 5 service, JWT Guard, Rate Limiting, Caching hoạt động.
8. Tích hợp Health Check phân tán toàn hệ thống
   → verify: GET /api/health trả về 200 OK với trạng thái healthy của toàn bộ service phụ thuộc.
9. Đóng gói hoàn chỉnh hệ thống bằng Docker Compose
   → verify: Lệnh `docker compose up -d` khởi chạy đồng thời toàn bộ microservices trên máy local.
10. Thực thi kịch bản kiểm thử tự động toàn diện 25 Test Cases
   → verify: Chạy script kiểm thử tự động đạt kết quả 25/25 Test Cases Passed (100%).
```

---

## 6. HƯỚNG DẪN CHẠY & TRÌNH BÀY THEO BẢNG CHẤM THỰC HÀNH 3 (STT 1 → 8)

Trước khi bắt đầu, mở PowerShell tại thư mục P3:
```powershell
cd D:\HK1_26_27\Bai_Tap_Thay_The_PROJECT\Project\P3\ecommerce-microservices
```

---

### STT 1: Giải thích các `proto` và cấu trúc dự án (1 điểm)

* **Thao tác:** Mở cây thư mục `P3/ecommerce-microservices` và thư mục [`proto/`](file:///D:/HK1_26_27/Bai_Tap_Thay_The_PROJECT/Project/P3/ecommerce-microservices/proto) trên VS Code.
* **Giải thích các file `.proto` (Hợp đồng giao tiếp gRPC / Schema Contract giữa các Microservices):**
  1. [`proto/customer.proto`](file:///D:/HK1_26_27/Bai_Tap_Thay_The_PROJECT/Project/P3/ecommerce-microservices/proto/customer.proto): Định nghĩa `CustomerService` với hàm `GetCustomerScore(uid)` (trả về `uid, fullname, mid, mname, score` để `order-service` tính chiết khấu) và `SyncCustomer` (đồng bộ khách hàng mới khi đăng ký từ `auth-service`).
  2. [`proto/product.proto`](file:///D:/HK1_26_27/Bai_Tap_Thay_The_PROJECT/Project/P3/ecommerce-microservices/proto/product.proto): Định nghĩa `ProductService` với hàm `CheckAndDeductStock(items)` để kiểm tra tồn kho và khấu trừ số lượng sản phẩm nguyên tử khi tạo đơn hàng.
  3. [`proto/order.proto`](file:///D:/HK1_26_27/Bai_Tap_Thay_The_PROJECT/Project/P3/ecommerce-microservices/proto/order.proto): Định nghĩa `OrderService` và cấu trúc message `OrderCreatedEvent` phát lên Kafka topic `orders.created`.
* **Giải thích cấu trúc dự án theo DDD (5 Bounded Contexts + API Gateway):**
  - `gateway/server.js` (Port `8080`): Cổng giao tiếp duy nhất tích hợp **Redis** đảm nhiệm Routing, JWT Validation, Role Authorization, Rate Limiting (120 reqs/phút) và Caching (`cache:products`).
  - `services/auth-service/` (Port `5001` - PostgreSQL `auth_db`): Quản lý `User`, `Role`, đăng ký, đăng nhập và cấp phát JWT.
  - `services/customer-service/` (Port `5002` - PostgreSQL `customer_db`): Quản lý `Customer` và hạng thẻ `MemberShip` (`Standard: 10`, `Silver: 100`, `Gold: 500`).
  - `services/product-service/` (Port `5003` - MongoDB `product_db`): Quản lý danh mục sản phẩm và khấu trừ tồn kho nguyên tử.
  - `services/order-service/` (Port `5004` - PostgreSQL `order_db`): Tính `discount` theo `score`, lưu `Order`, `OrderDetail`, `OutboxEvent` (Transactional Outbox Pattern) và bắn sự kiện lên Kafka.
  - `services/shipment-service/` (Port `5005` - MongoDB `shipment_db`): Kafka Consumer lắng nghe topic `orders.created` để tự động tạo vận đơn `PENDING` (xử lý chống trùng lặp Idempotent).

---

### STT 2: CLI: Tiến hành compose và liệt kê danh sách container đúng thiết kế (1 điểm)

* **Thao tác trên PowerShell:**
  ```powershell
  docker compose up -d
  docker ps
  curl.exe http://localhost:8080/api/health
  ```
* **Chỉ kết quả trên màn hình (Đủ 11 containers của P3):**
  1. **5 Hạ tầng (Infrastructure):** `p3-postgres` (5433), `p3-mongodb` (27018), `p3-redis` (6379), `p3-kafka` (9092), `p3-zookeeper` (2181).
  2. **6 Ứng dụng (Gateway + 5 Microservices):** `p3-api-gateway` (8080), `p3-auth-service` (5001), `p3-customer-service` (5002), `p3-product-service` (5003), `p3-order-service` (5004), `p3-shipment-service` (5005).

---

### STT 3: Kiểm tra và giải thích hệ thống Kafka (1 điểm)

* **Thao tác trên PowerShell:**
  1. Kiểm tra danh sách Topic đang có trên Kafka container:
     ```powershell
     docker exec p3-kafka kafka-topics --bootstrap-server localhost:9092 --list
     ```
     *(Hiển thị topic: `orders.created`)*.
  2. Kiểm tra log kết nối Kafka Producer (bên `order-service`) và Kafka Consumer (bên `shipment-service`):
     ```powershell
     docker logs p3-order-service
     docker logs p3-shipment-service
     ```
* **Lời giải thích cho giảng viên:**
  > *"Thưa thầy, hệ thống sử dụng **Apache Kafka** kết hợp **Transactional Outbox Pattern**. Khi khách đặt hàng, `order-service` lưu `Order`, `OrderDetail` và `OutboxEvent` vào PostgreSQL trong cùng 1 transaction, sau đó Kafka Producer đẩy sự kiện `OrderCreated` vào topic `orders.created`. Phía bên kia, `shipment-service` đóng vai trò Kafka Consumer thuộc group `shipment-group`, lắng nghe topic `orders.created` và tự động tạo bản ghi vận chuyển `Shipment` với trạng thái `PENDING` vào MongoDB."*

---

### CHUẨN BỊ TOKEN TRƯỚC KHI TEST POSTMAN (STT 4 → STT 8)
Trước khi bấm các Test Case từ STT 4 đến STT 8 trên Postman, bạn lấy JWT Token bằng cách:
- **Method:** `POST` | **URL:** `http://localhost:8080/api/auth/login`
- **Body (raw -> JSON):**
  ```json
  {
    "username": "admin",
    "password": "admin123"
  }
  ```
- Bấm **Send** -> Copy chuỗi **`accessToken`** trong kết quả trả về để dán vào mục **Authorization -> Bearer Token** của các bước dưới.
  *(Hoặc nếu आपने đã Import file `P3/ecommerce-microservices/postman_collection.json` vào Postman thì chỉ cần bấm vào đúng tên Test Case tương ứng trong Collection, Postman đã tự động lưu sẵn `{{customer_token}}` và `{{admin_token}}`!).*

---

### STT 4: `TC-PRO-01`: Lấy danh sách Product (1 điểm)

* **Thao tác trên Postman:**
  - **Method:** `GET`
  - **URL:** `http://localhost:8080/api/products`
  - **Authorization:** Chọn **Bearer Token** -> Dán token vào.
  - Bấm **Send**.
* **Kết quả (`200 OK`):**
  - Trả về danh sách các sản phẩm từ MongoDB (`product-service`), đồng thời API Gateway lưu cache vào Redis (`X-Cache: MISS` ở lần gọi đầu và `X-Cache: HIT` ở lần gọi thứ 2):
    ```json
    {
      "items": [
        { "pid": 1, "pname": "Laptop", "price": 1500, "quantity": 10 },
        { "pid": 2, "pname": "Wireless Mouse", "price": 25, "quantity": 50 },
        { "pid": 3, "pname": "Mechanical Keyboard", "price": 80, "quantity": 30 }
      ]
    }
    ```

---

### STT 5: `TC-CUS-04`: Lấy thông tin Membership (1 điểm)

* **Thao tác trên Postman:**
  - **Method:** `GET`
  - **URL:** `http://localhost:8080/api/customers/1`
  - **Authorization:** Chọn **Bearer Token** -> Dán token vào.
  - Bấm **Send**.
* **Kết quả (`200 OK`):**
  - Trả về thông tin khách hàng kèm đối tượng `membership` hiển thị rõ hạng thành viên `mname` và điểm tích lũy `score`:
    ```json
    {
      "uid": 1,
      "fullname": "System Admin (Gold)",
      "mid": 3,
      "mname": "Gold",
      "score": 500,
      "membership": {
        "mid": 3,
        "mname": "Gold",
        "score": 500
      }
    }
    ```

---

### STT 6: `TC-CUS-05`: Truy vấn Customer không có token (1 điểm)

* **Thao tác trên Postman:**
  - **Method:** `GET`
  - **URL:** `http://localhost:8080/api/customers/1`
  - **Authorization:** Chọn **No Auth** (không truyền token).
  - Bấm **Send**.
* **Kết quả (`401 Unauthorized`):**
  - Bị API Gateway chặn ngay tại tầng biên:
    ```json
    {
      "message": "Access denied: Missing or invalid token"
    }
    ```

---

### STT 7: `TC-ORD-04`: Tính discount theo score (1 điểm)

* **Quy tắc tính Discount trong `order-service`:**
  - Hạng `Gold` (`score >= 500`) $\rightarrow$ Giảm **`15%`** (`discount: 15`)
  - Hạng `Silver` (`score >= 100`) $\rightarrow$ Giảm **`10%`** (`discount: 10`)
  - Hạng `Standard` (`score >= 10`) $\rightarrow$ Giảm **`5%`** (`discount: 5`)
* **Thao tác trên Postman:**
  - **Method:** `POST`
  - **URL:** `http://localhost:8080/api/orders`
  - **Authorization:** Chọn **Bearer Token** -> Dán token vào.
  - **Body (raw -> JSON):**
    ```json
    {
      "uid": 1,
      "items": [
        { "pid": 1, "qty": 1 }
      ]
    }
    ```
  - Bấm **Send**.
* **Kết quả (`201 Created`):**
  - Khách hàng `uid = 1` có `score = 500` nên hệ thống tự động tính `discount = 15` (15%), giảm từ `subtotal: 1500` xuống `totalamount: 1275`:
    ```json
    {
      "oid": 1,
      "uid": 1,
      "subtotal": 1500,
      "discount": 15,
      "totalamount": 1275,
      "items": [
        { "pid": 1, "pname": "Laptop", "unit_price": 1500, "qty": 1 }
      ],
      "shipment": {
        "status": "PENDING"
      }
    }
    ```

---

### STT 8: `TC-ORD-05`: Tạo Order và phát sự kiện (1 điểm)

* **Thao tác kiểm chứng sau khi tạo Order ở STT 7:**
  1. **Trên Postman — Kiểm tra Shipment đã tự động được tạo nhờ sự kiện Kafka:**
     - **Method:** `GET`
     - **URL:** `http://localhost:8080/api/shipments/1` *(hoặc `http://localhost:8080/api/shipments/SHP-1`)*
     - **Authorization:** **Bearer Token**
     - **Kết quả (`200 OK`):**
       ```json
       {
         "shipid": 5001,
         "oid": 1,
         "status": "PENDING",
         "created_at": "..."
       }
       ```
  2. **Trên CLI (PowerShell) — Kiểm tra bảng `OutboxEvent` đã chuyển sang `PUBLISHED` và log Kafka:**
     ```powershell
     docker exec p3-postgres psql -U postgres -d order_db -c 'SELECT id, aggregate_type, aggregate_id, event_type, status FROM "OutboxEvent";'
     docker logs --tail 10 p3-shipment-service
     ```
     - Bảng `OutboxEvent` hiển thị `event_type = OrderCreated`, `status = PUBLISHED`.
     - Log của `p3-shipment-service` hiển thị: `Received Kafka event on orders.created` $\rightarrow$ `Created Shipment 5001 for Order 1 with status PENDING`.

---

## 7. BẢNG LỆNH TÓM TẮT (COPY-PASTE NHANH KHI LÊN CHẤM P3)

```powershell
cd D:\HK1_26_27\Bai_Tap_Thay_The_PROJECT\Project\P3\ecommerce-microservices

# [STT 2] Khởi chạy Docker Compose & liệt kê danh sách 11 containers
docker compose up -d
docker ps
curl.exe http://localhost:8080/api/health

# [STT 3] Kiểm tra hệ thống Kafka & danh sách Topic
docker exec p3-kafka kafka-topics --bootstrap-server localhost:9092 --list
docker logs --tail 10 p3-order-service
docker logs --tail 10 p3-shipment-service

# [STT 8] Kiểm tra OutboxEvent đã PUBLISHED sang Kafka
docker exec p3-postgres psql -U postgres -d order_db -c 'SELECT id, aggregate_type, aggregate_id, event_type, status FROM "OutboxEvent";'

# Chạy tự động toàn bộ 25/25 Test Cases trên CLI (nếu giảng viên yêu cầu chạy script tổng)
npm test
```

