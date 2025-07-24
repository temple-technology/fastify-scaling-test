import { Gauge, Counter, Registry } from 'prom-client';
import type { Pool } from 'pg';

export function setupPoolMetrics(pool: Pool, register: Registry) {
  // Define metrics
  const poolSize = new Gauge({
    name: 'pg_pool_size',
    help: 'The current size of the connection pool',
    labelNames: ['pool_name'],
    registers: [register]
  });

  const poolMax = new Gauge({
    name: 'pg_pool_max',
    help: 'The maximum size of the connection pool',
    labelNames: ['pool_name'],
    registers: [register]
  });

  const activeConnections = new Gauge({
    name: 'pg_pool_active_connections',
    help: 'The number of active connections',
    labelNames: ['pool_name'],
    registers: [register]
  });

  const idleConnections = new Gauge({
    name: 'pg_pool_idle_connections',
    help: 'The number of idle connections',
    labelNames: ['pool_name'],
    registers: [register]
  });

  const waitingConnections = new Gauge({
    name: 'pg_pool_waiting_connections',
    help: 'The number of waiting connections',
    labelNames: ['pool_name'],
    registers: [register]
  });

  const connectionsCreated = new Counter({
    name: 'pg_pool_connections_created_total',
    help: 'Total number of connections created',
    labelNames: ['pool_name'],
    registers: [register]
  });

  const connectionsRemoved = new Counter({
    name: 'pg_pool_connections_removed_total',
    help: 'Total number of connections removed',
    labelNames: ['pool_name'],
    registers: [register]
  });

  const poolErrors = new Counter({
    name: 'pg_pool_errors_total',
    help: 'Total number of pool errors',
    labelNames: ['pool_name', 'error_type'],
    registers: [register]
  });

  // Set static metrics
  poolMax.set({ pool_name: 'main' }, pool.options.max || 10);

  // Update metrics periodically
  const updateMetrics = () => {
    const total = pool.totalCount;
    const idle = pool.idleCount;
    const waiting = pool.waitingCount;

    poolSize.set({ pool_name: 'main' }, total);
    idleConnections.set({ pool_name: 'main' }, idle);
    activeConnections.set({ pool_name: 'main' }, total - idle);
    waitingConnections.set({ pool_name: 'main' }, waiting);
  };

  // Update metrics every 5 seconds
  const interval = setInterval(updateMetrics, 5000);
  
  // Initial update
  updateMetrics();

  // Track events
  pool.on('connect', () => {
    connectionsCreated.inc({ pool_name: 'main' });
    updateMetrics();
  });

  pool.on('remove', () => {
    connectionsRemoved.inc({ pool_name: 'main' });
    updateMetrics();
  });

  pool.on('error', (err: Error) => {
    poolErrors.inc({ 
      pool_name: 'main', 
      error_type: (err as any).code || 'unknown' 
    });
  });

  // Cleanup function
  return () => {
    clearInterval(interval);
  };
}