const { fork } = require('child_process');
const path = require('path');

const services = [
  { name: 'auth-service', script: path.join(__dirname, 'services/auth-service/server.js') },
  { name: 'customer-service', script: path.join(__dirname, 'services/customer-service/server.js') },
  { name: 'product-service', script: path.join(__dirname, 'services/product-service/server.js') },
  { name: 'order-service', script: path.join(__dirname, 'services/order-service/server.js') },
  { name: 'shipment-service', script: path.join(__dirname, 'services/shipment-service/server.js') },
  { name: 'api-gateway', script: path.join(__dirname, 'gateway/server.js') },
];

const runningProcesses = [];

console.log('====================================================');
console.log('   Starting E-Commerce Microservices Architecture   ');
console.log('====================================================');

services.forEach(({ name, script }) => {
  const child = fork(script, [], {
    stdio: ['inherit', 'pipe', 'pipe', 'ipc']
  });

  child.stdout.on('data', (data) => {
    process.stdout.write(`[${name}] ${data}`);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(`[${name} ERROR] ${data}`);
  });

  child.on('exit', (code) => {
    console.log(`[${name}] Exited with code ${code}`);
  });

  runningProcesses.push(child);
});

function cleanup() {
  console.log('\nShutting down all microservices...');
  runningProcesses.forEach(child => {
    try {
      child.kill('SIGTERM');
    } catch (e) {}
  });
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
