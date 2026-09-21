'use strict';
// Internal Prometheus endpoint. Requires only clusterMonitor, never application data.
const fs = require('node:fs');
const http = require('node:http');
const { MongoClient } = require('/app/node_modules/mongoose').mongo;
const client = new MongoClient(fs.readFileSync('/run/secrets/monitor-uri', 'utf8').trim(), {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 5000,
  maxPoolSize: 2,
});
let body = 'mantec_mongo_up 0\n';
let collecting = false;
async function collect() {
  if (collecting) return;
  collecting = true;
  const metrics = {};
  try {
    const admin = client.db('admin');
    const hello = await admin.command({ hello: 1 });
    const status = await admin.command({ replSetGetStatus: 1 });
    const server = await admin.command({ serverStatus: 1 });
    metrics.mantec_mongo_up = 1;
    metrics.mantec_mongo_primary_available = Number(hello.isWritablePrimary === true);
    metrics.mantec_mongo_healthy_data_members = status.members.filter(
      (m) => m.health === 1 && [1, 2].includes(m.state),
    ).length;
    metrics.mantec_mongo_connections = server.connections.current;
    metrics.mantec_mongo_resident_memory_bytes = server.mem.resident * 1024 * 1024;
  } catch {
    // Never log driver errors: some include the connection URI.
    metrics.mantec_mongo_up = 0;
    metrics.mantec_mongo_primary_available = 0;
    metrics.mantec_mongo_healthy_data_members = 0;
  }
  try {
    const timestamp = Number(fs.readFileSync('/backup/last-success', 'utf8').trim());
    if (!Number.isFinite(timestamp) || timestamp <= 0) throw Error('invalid timestamp');
    metrics.mantec_backup_last_success_seconds = timestamp;
  } catch {
    metrics.mantec_backup_last_success_seconds = 0;
  }
  try {
    const disk = fs.statfsSync('/backup/last-success');
    metrics.mantec_backup_disk_available_bytes = disk.bavail * disk.bsize;
    metrics.mantec_backup_disk_total_bytes = disk.blocks * disk.bsize;
  } catch {
    metrics.mantec_backup_disk_available_bytes = 0;
    metrics.mantec_backup_disk_total_bytes = 1;
  }
  metrics.mantec_monitor_last_collection_seconds = Date.now() / 1000;
  body = Object.entries(metrics).map(([name, value]) => `${name} ${value}\n`).join('');
  collecting = false;
}
http.createServer((request, response) => {
  if (request.url !== '/metrics') {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
  response.end(body);
}).listen(9217, '0.0.0.0');
void collect();
setInterval(() => void collect(), 15000);
process.on('SIGTERM', () => { void client.close().finally(() => process.exit(0)); });
