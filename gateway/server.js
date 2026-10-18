require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const axios = require('axios');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const PORT = process.env.PORT_GATEWAY || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_microservices_2026';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 });
redis.on('connect', () => console.log('[api-gateway] Connected to Redis'));
redis.on('error', (err) => console.warn('[api-gateway] Redis warning:', err.message));

// Microservices URLs
const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:5001',
  customer: process.env.CUSTOMER_SERVICE_URL || 'http://localhost:5002',
  product: process.env.PRODUCT_SERVICE_URL || 'http://localhost:5003',
  order: process.env.ORDER_SERVICE_URL || 'http://localhost:5004',
  shipment: process.env.SHIPMENT_SERVICE_URL || 'http://localhost:5005'
};

// 1. Structured Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[GATEWAY LOG] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// 2. Redis Rate Limiter Middleware
app.use(async (req, res, next) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const key = `ratelimit:${ip}`;
    const requests = await redis.incr(key);
    if (requests === 1) {
      await redis.expire(key, 60); // 1 minute window
    }
    if (requests > 120) { // Limit 120 reqs/min
      return res.status(429).json({ message: 'Too many requests, please slow down' });
    }
  } catch (err) {
    // If Redis is temporarily down, bypass rate limiter
  }
  next();
});

// 3. Centralized Healthcheck (API-HEALTH-01)
app.get('/api/health', async (req, res) => {
  const serviceChecks = {};
  let overallUp = true;

  for (const [name, url] of Object.entries(SERVICES)) {
    try {
      const resp = await axios.get(`${url}/health`, { timeout: 1500 });
      serviceChecks[name] = resp.data.status || 'UP';
    } catch (e) {
      serviceChecks[name] = 'DOWN';
      overallUp = false;
    }
  }

  let redisStatus = 'connected';
  try {
    await redis.ping();
  } catch {
    redisStatus = 'disconnected';
    overallUp = false;
  }

  const statusCode = overallUp ? 200 : 503;
  return res.status(statusCode).json({
    status: overallUp ? 'UP' : 'DEGRADED',
    message: 'E-commerce API is running',
    redis: redisStatus,
    services: serviceChecks,
    timestamp: new Date().toISOString()
  });
});

// 4. JWT Authentication & Role Authorization Middleware
app.use((req, res, next) => {
  // Public routes that bypass auth
  const isPublic =
    req.path === '/' ||
    req.path === '/api/health' ||
    req.path === '/api/auth/register' ||
    req.path === '/api/auth/login';

  if (isPublic) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied: Missing or invalid token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // Attach user identity to headers for downstream microservices
    req.headers['x-user-id'] = String(decoded.uid || decoded.sub);
    req.headers['x-user-role'] = decoded.role || 'Customer';
    req.headers['x-user-name'] = decoded.username || '';

    // Role-based Authorization checks
    // Admin only routes for products modification
    if (
      req.path.startsWith('/api/products') &&
      ['POST', 'PUT', 'DELETE'].includes(req.method)
    ) {
      if (decoded.role !== 'Admin') {
        return res.status(403).json({ message: 'Forbidden: Admin privilege required' });
      }
    }

    // Shipment staff/admin role for updating shipment status
    if (
      req.path.startsWith('/api/shipments') &&
      req.method === 'PATCH'
    ) {
      if (decoded.role !== 'Admin' && decoded.role !== 'Staff') {
        return res.status(403).json({ message: 'Forbidden: Shipment staff or admin required' });
      }
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Access denied: Token expired or invalid' });
  }
});

// 5. Redis Caching for Product List
app.get('/api/products', async (req, res, next) => {
  try {
    const cached = await redis.get('cache:products');
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(JSON.parse(cached));
    }
  } catch (e) {
    // Continue to proxy on cache error
  }
  next();
});

// Invalidate cache on product modification
app.use('/api/products', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          await redis.del('cache:products');
          console.log('[api-gateway] Redis cache:products invalidated');
        } catch {}
      }
    });
  }
  next();
});

// 6. Reverse Proxy Dispatcher
async function proxyRequest(targetUrl, req, res) {
  try {
    const response = await axios({
      method: req.method,
      url: `${targetUrl}${req.originalUrl}`,
      data: req.body,
      headers: {
        ...req.headers,
        host: undefined
      },
      validateStatus: () => true // Allow all status codes through
    });

    // If it was a GET /api/products response, cache it in Redis
    if (req.method === 'GET' && req.originalUrl === '/api/products' && response.status === 200) {
      try {
        await redis.setex('cache:products', 30, JSON.stringify(response.data));
      } catch {}
      res.setHeader('X-Cache', 'MISS');
    }

    return res.status(response.status).json(response.data);
  } catch (err) {
    return res.status(502).json({
      message: 'Bad Gateway: Microservice unavailable',
      error: err.message
    });
  }
}

// Route Mappings
app.use('/api/auth', (req, res) => proxyRequest(SERVICES.auth, req, res));
app.use('/api/customers', (req, res) => proxyRequest(SERVICES.customer, req, res));
app.use('/api/products', (req, res) => proxyRequest(SERVICES.product, req, res));
app.use('/api/orders', (req, res) => proxyRequest(SERVICES.order, req, res));
app.use('/api/shipments', (req, res) => proxyRequest(SERVICES.shipment, req, res));

app.listen(PORT, () => {
  console.log(`[api-gateway] Running on port ${PORT}`);
});

module.exports = app;
