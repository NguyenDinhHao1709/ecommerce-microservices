require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());

const PORT = process.env.PORT_PRODUCT || 5003;
const MONGO_URI = process.env.PRODUCT_MONGO_URI || 'mongodb://localhost:27018/product_db';

let db, productsCol;

async function initDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('product_db');
  productsCol = db.collection('products');

  // Create unique index on pid
  await productsCol.createIndex({ pid: 1 }, { unique: true });

  // Seed sample products if empty
  const count = await productsCol.countDocuments();
  if (count === 0) {
    await productsCol.insertMany([
      { pid: 1, pname: 'Laptop', price: 1500, quantity: 10 },
      { pid: 2, pname: 'Wireless Mouse', price: 25, quantity: 50 },
      { pid: 3, pname: 'Mechanical Keyboard', price: 80, quantity: 30 }
    ]);
    console.log('[product-service] Initial products seeded into MongoDB');
  }
  console.log('[product-service] Connected to MongoDB product_db');
}

// 1. Healthcheck
app.get('/health', async (req, res) => {
  try {
    await db.command({ ping: 1 });
    return res.status(200).json({ status: 'UP', service: 'product-service', database: 'connected' });
  } catch (error) {
    return res.status(503).json({ status: 'DOWN', service: 'product-service', error: error.message });
  }
});

// 2. Get product list (API-PRO-01)
app.get('/api/products', async (req, res) => {
  try {
    const products = await productsCol.find({}, { projection: { _id: 0 } }).toArray();
    return res.status(200).json({ items: products });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 3. Get product by pid (API-PRO-02)
app.get('/api/products/:pid', async (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    const product = await productsCol.findOne({ pid }, { projection: { _id: 0 } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    return res.status(200).json(product);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 4. Create product (API-PRO-03)
app.post('/api/products', async (req, res) => {
  try {
    const { pname, price } = req.body;
    const quantity = req.body.quantity !== undefined ? req.body.quantity : req.body.qty;
    if (!pname || price === undefined || quantity === undefined) {
      return res.status(400).json({ message: 'Missing required fields: pname, price, quantity' });
    }

    // Auto-generate incrementing pid
    const highest = await productsCol.find().sort({ pid: -1 }).limit(1).toArray();
    const pid = highest.length > 0 ? highest[0].pid + 1 : 1;

    const newProduct = {
      pid,
      pname,
      price: parseFloat(price),
      quantity: parseInt(quantity)
    };

    await productsCol.insertOne(newProduct);
    const { _id, ...cleanProduct } = newProduct;
    return res.status(201).json(cleanProduct);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 5. Update product (API-PRO-04)
app.put('/api/products/:pid', async (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    const { pname, price, quantity } = req.body;

    const updateDoc = {};
    if (pname !== undefined) updateDoc.pname = pname;
    if (price !== undefined) updateDoc.price = parseFloat(price);
    if (quantity !== undefined) updateDoc.quantity = parseInt(quantity);

    const result = await productsCol.updateOne({ pid }, { $set: updateDoc });
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    return res.status(200).json({ message: 'Product updated successfully', pid, ...updateDoc });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 6. Delete product (API-PRO-05)
app.delete('/api/products/:pid', async (req, res) => {
  try {
    const pid = parseInt(req.params.pid);
    const result = await productsCol.deleteOne({ pid });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    return res.status(200).json({ message: 'Product deleted successfully', pid });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// 7. Internal Endpoint: Check stock and deduct inventory for Order Service
app.post('/internal/products/check-and-deduct', async (req, res) => {
  try {
    const { items } = req.body; // [ { pid, qty } ]
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invalid items array' });
    }

    const processedItems = [];

    // Step 1: Validate all items exist and have sufficient stock
    for (const it of items) {
      const prod = await productsCol.findOne({ pid: parseInt(it.pid) });
      if (!prod) {
        return res.status(404).json({ message: `Product ID ${it.pid} not found` });
      }
      if (prod.quantity < it.qty) {
        return res.status(409).json({
          message: `Insufficient stock for '${prod.pname}'. Available: ${prod.quantity}, requested: ${it.qty}`
        });
      }
      processedItems.push({
        pid: prod.pid,
        pname: prod.pname,
        unit_price: prod.price,
        qty: parseInt(it.qty)
      });
    }

    // Step 2: Deduct inventory
    for (const it of processedItems) {
      await productsCol.updateOne(
        { pid: it.pid },
        { $inc: { quantity: -it.qty } }
      );
    }

    return res.status(200).json({
      success: true,
      items: processedItems
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[product-service] Running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('[product-service] MongoDB connection error:', err.message);
});

module.exports = app;
