# Complete Load Testing Configuration Guide
*Understanding every setting that affects high-load performance*

## Table of Contents
1. [API Layer Settings (Fastify + Drizzle)](#api-layer-settings)
2. [PGPool Connection Manager](#pgpool-connection-manager)
3. [PostgreSQL Database Settings](#postgresql-database-settings)
4. [System-Level Factors](#system-level-factors)
5. [Missing Factors to Consider](#missing-factors-to-consider)
6. [Monitoring and observability](#monitoring-and-observability---to-do)
7. [Load Testing Readiness Checklist](#load-testing-readiness-checklist---to-do)
8. [FAQ](#frequently-asked-questions-faq)

---

## API Layer Settings (Fastify + Drizzle)

### Database Connection Pool Settings

#### `DB_POOL_MIN="75"`
**What it does**: Sets the minimum number of database connections each API worker maintains at all times.

**Technical explanation**: Each of the 8 API workers will always keep 75 open connections to the database, even during low traffic periods.

**Simple explanation**: This maintains 75 phone lines always open to the database per worker. Even if no requests are active, the lines stay connected and ready.

**Impact on load testing**: Higher minimum = faster response times during traffic spikes (no connection setup delay), but uses more memory.

#### `DB_POOL_MAX="100"`
**What it does**: Maximum database connections each API worker can use when traffic is high.

**Technical explanation**: During peak load, each worker can scale up to 100 connections, providing 800 total connections (8 workers × 100) to handle concurrent requests.

**Simple explanation**: Like having 100 phone lines available per worker. When things get busy, all lines can be used simultaneously.

**Impact on load testing**: This represents the connection ceiling. At 100 connections per worker, the system can theoretically handle 800 simultaneous database operations across all workers.

#### `DB_POOL_IDLE_TIMEOUT="300000"`
**What it does**: How long (in milliseconds) a database connection can sit unused before being closed (300,000ms = 5 minutes).

**Technical explanation**: After 5 minutes of inactivity, connections above the minimum are terminated to free up resources.

**Simple explanation**: Like automatically hanging up phone lines that haven't been used for 5 minutes to save resources.

**Impact on load testing**: Longer timeout = better performance during intermittent traffic, but higher resource usage during quiet periods.

#### `DB_POOL_CONNECTION_TIMEOUT="5000"`
**What it does**: Maximum time (in milliseconds) to wait when trying to establish a new database connection (5 seconds).

**Technical explanation**: If creating a new connection takes longer than 5 seconds, the attempt fails and an error is returned.

**Simple explanation**: Similar to abandoning a phone call if it takes more than 5 seconds to connect.

**Impact on load testing**: Too short = premature failures during database overload; too long = slow error detection and poor system response.

#### `DB_STATEMENT_TIMEOUT="10000"`
**What it does**: Maximum time (in milliseconds) a database query can run before being cancelled (10 seconds).

**Technical explanation**: Any SQL query that takes longer than 10 seconds is automatically terminated to prevent resource hogging.

**Simple explanation**: Similar to terminating a phone call if the other party doesn't respond within 10 seconds.

**Impact on load testing**: Prevents slow queries from blocking the connection pool and causing cascade failures.

### Node.js Connection Pool Configuration (pg library)

#### TCP Keep-Alive Settings

##### `keepAlive: true`
**What it does**: Enables TCP keep-alive packets to maintain persistent connections.

**Technical explanation**: Sends periodic packets to verify the connection is still alive, preventing network equipment from timing out idle connections.

**Simple explanation**: Similar to periodically checking during a phone call to ensure the line remains connected.

**Impact on load testing**: Prevents connection drops during low-traffic periods, maintains pool stability.

##### `keepAliveInitialDelayMillis: 10000`
**What it does**: Waits 10 seconds after connection establishment before sending first keep-alive packet.

**Technical explanation**: Delays the start of keep-alive probes to avoid unnecessary network traffic on newly established connections.

**Simple explanation**: Similar to waiting 10 seconds before beginning to verify if the connection remains active.

**Impact on load testing**: Reduces network overhead while maintaining connection reliability.

### API Worker Configuration

#### 8 Workers (Cluster Mode)
**What it does**: Runs 8 separate copies of the application, each on a different CPU core.

**Technical explanation**: Node.js cluster module forks 8 processes, each capable of handling requests independently.

**Simple explanation**: Similar to having 8 identical restaurants instead of 1, enabling 8 times more concurrent customer service.

**Impact on load testing**: Multiplies system capacity by 8, but also multiplies database connections and memory usage.

---

## PGPool Connection Manager

### Connection Process Management

#### `PGPOOL_NUM_INIT_CHILDREN="800"`
**What it does**: Number of connection handler processes PGPool creates at startup.

**Technical explanation**: Pre-forks 800 processes that wait to handle incoming connections, eliminating process creation overhead.

**Simple explanation**: Similar to having 800 telephone operators ready to take calls when the system starts, eliminating hiring delays when calls arrive.

**Impact on load testing**: Higher number = better performance under load (no process creation delay), but uses more memory (~4MB per child = 3.2GB).

#### `PGPOOL_MAX_POOL="1000"`
**What it does**: Maximum number of backend database connections each PGPool child process can cache.

**Technical explanation**: Each of the 800 children can maintain up to 1000 reusable connections to PostgreSQL servers.

**Simple explanation**: Each telephone operator can remember up to 1000 direct lines to different departments, eliminating the need to look up numbers repeatedly.

**Impact on load testing**: Higher values reduce connection establishment overhead but increase memory usage per child process.

### Connection Lifecycle Management

#### `PGPOOL_CLIENT_IDLE_LIMIT="600"`
**What it does**: Time (in seconds) before disconnecting idle client connections (10 minutes).

**Technical explanation**: Client connections from the API that remain unused for 10 minutes are automatically closed to free up resources.

**Simple explanation**: Similar to ending phone calls where no one has spoken for 10 minutes.

**Impact on load testing**: Must be longer than the API's idle timeout to prevent premature disconnections during traffic lulls.

#### `PGPOOL_CONNECTION_LIFE_TIME="3600"`
**What it does**: Maximum age (in seconds) for backend database connections before forced renewal (1 hour).

**Technical explanation**: Every hour, connections to PostgreSQL are closed and recreated to prevent connection drift and resource leaks.

**Simple explanation**: Similar to hanging up and redialing phone connections every hour to ensure they remain fresh and reliable.

**Impact on load testing**: Causes periodic reconnection overhead but prevents long-term connection issues.

### Load Balancing Settings

#### `PGPOOL_LOAD_BALANCE_MODE="on"`
**What it does**: Enables automatic distribution of read queries across all PostgreSQL nodes.

**Technical explanation**: SELECT statements are distributed round-robin across all healthy PostgreSQL servers to spread the workload.

**Simple explanation**: Similar to having a receptionist who routes different customers to different service windows to avoid long lines.

**Impact on load testing**: Dramatically improves read performance by utilizing all database nodes, but writes still go to the primary node.

#### `PGPOOL_DISABLE_LOAD_BALANCE_ON_WRITE="transaction"`
**What it does**: After a write operation, subsequent reads in the same transaction go to the same (primary) node.

**Technical explanation**: Ensures read-after-write consistency by preventing reads from potentially lagged replica nodes within a transaction.

**Simple explanation**: After making a deposit at one bank teller, all questions about that deposit must go to the same teller who has the most up-to-date information.

**Impact on load testing**: Critical for data consistency but can create hotspots on the primary node during write-heavy workloads.

### Health Monitoring

#### `PGPOOL_HEALTH_CHECK_PERIOD` (Default: 30 seconds)
**What it does**: How often PGPool sends health check queries to each PostgreSQL node.

**Technical explanation**: Every 30 seconds, PGPool sends a simple query to each backend node to verify it's responsive and healthy.

**Simple explanation**: Similar to checking each database server's pulse every 30 seconds to ensure it remains alive and responding.

**Impact on load testing**: More frequent checks (10-15s) provide faster failure detection during stress testing but create more overhead.

**Current setup**: Uses the default 30-second interval since this environment variable isn't explicitly set.

#### `PGPOOL_HEALTH_CHECK_TIMEOUT="10"`
**What it does**: Time (in seconds) to wait for a health check response from PostgreSQL nodes.

**Technical explanation**: Every health check query must complete within 10 seconds or the node is considered unhealthy.

**Simple explanation**: Similar to giving each database server 10 seconds to respond "I'm okay" when checked.

**Impact on load testing**: Too short = false positive failures during high load; too long = slow failure detection.

#### `PGPOOL_HEALTH_CHECK_MAX_RETRIES="5"`
**What it does**: Number of failed health checks before marking a PostgreSQL node as down.

**Technical explanation**: A node must fail 5 consecutive health checks before being removed from the available pool.

**Simple explanation**: Similar to checking someone's pulse 5 times before declaring them unresponsive.

**Impact on load testing**: Higher retries = more tolerance for temporary issues but slower failure detection.

#### `PGPOOL_HEALTH_CHECK_RETRY_DELAY="5"`
**What it does**: Time (in seconds) between health check retry attempts.

**Technical explanation**: After a failed health check, waits 5 seconds before trying again.

**Simple explanation**: Similar to waiting 5 seconds between checking someone's pulse if they don't respond immediately.

**Impact on load testing**: Affects how quickly failed nodes are detected and recovered.

---

## PostgreSQL Database Settings

### Connection Management

#### `max_connections=500`
**What it does**: Maximum number of concurrent connections each PostgreSQL node can handle.

**Technical explanation**: Hard limit on simultaneous database sessions - once reached, new connections are rejected.

**Simple explanation**: Like a restaurant with exactly 500 seats - when full, new customers must wait outside.

**Impact on load testing**: This represents the ultimate bottleneck. With 3 nodes at 500 each, the system has 1,500 total connection capacity, but writes are limited to ~500 (primary node only).

#### `max_prepared_transactions=100`
**What it does**: Maximum number of transactions that can be in "prepared" state for two-phase commit (2PC) distributed transactions.

**Technical explanation**: Prepared transactions are part of distributed transaction coordination across multiple databases or external systems. A transaction is "prepared" (ready to commit) but waits for confirmation from all participants before actually committing.

**Two-phase commit example:**
```sql
-- Normal transaction (single system)
BEGIN; UPDATE accounts SET balance = balance - 100; COMMIT;

-- Prepared transaction (distributed system)
BEGIN; UPDATE accounts SET balance = balance - 100; 
PREPARE TRANSACTION 'payment_123'; -- Wait for external confirmation
-- Later: COMMIT PREPARED 'payment_123'; -- or ROLLBACK PREPARED
```

**When this would be used:**
- **Payment processing**: Coordinating database updates with credit card charges
- **Microservices**: Ensuring consistency across multiple service databases  
- **Multi-database operations**: Transactions spanning PostgreSQL + Redis + external APIs
- **E-commerce workflows**: Inventory reservation + payment + shipping coordination

**Simple explanation**: Similar to making a hotel reservation that's "held" until confirmed with a credit card - the room is reserved but not booked until both the hotel and payment processor agree.

**Current impact on this setup**: 
- **Memory usage**: 100 slots × ~600 bytes = ~60KB per node (negligible)
- **Load testing impact**: None currently - the system is not using distributed transactions
- **Performance**: No impact on the 250-300 RPS tests

**Future considerations for payment integration:**
- Keep this setting when integrating with payment processors
- The system may need distributed transactions for order/payment consistency
- Consider increasing if handling high volumes of payment transactions
- Monitor prepared transaction usage during payment processing load tests

### Memory Management

#### `shared_buffers=8GB`
**What it does**: Amount of memory PostgreSQL uses to cache frequently accessed data pages.

**Technical explanation**: RAM allocated for PostgreSQL's internal buffer pool, shared across all connections.

**Simple explanation**: Similar to having an 8GB memorization card that remembers the most frequently requested information to answer questions faster.

**Impact on load testing**: Higher values = better cache hit rates = faster query responses, especially for repeated data access patterns.

#### `effective_cache_size=22GB`
**What it does**: Tells PostgreSQL how much memory the operating system uses for caching files.

**Technical explanation**: Helps the query planner estimate how much data is likely cached in OS memory when choosing execution strategies.

**Simple explanation**: Similar to telling a librarian that they have 22GB of memory to remember where popular books are located.

**Impact on load testing**: Better query plans = more efficient execution = higher throughput under load.

#### `work_mem=64MB`
**What it does**: Memory available for each sorting or hashing operation within a query.

**Technical explanation**: Each sort, hash join, or similar operation can use up to 64MB of RAM before spilling to disk.

**Simple explanation**: Similar to giving each chef 64MB of counter space to prepare their dish - if they need more, they must use slower floor space.

**Impact on load testing**: **CRITICAL**: With many concurrent connections, total usage can exceed available RAM (500 connections × 64MB = 32GB potential usage). Monitor this closely during complex query load tests.

#### `maintenance_work_mem=2GB`
**What it does**: Memory available for maintenance operations like index creation, vacuuming, and bulk data operations.

**Technical explanation**: Operations like VACUUM, CREATE INDEX, and ALTER TABLE can use up to 2GB of RAM.

**Simple explanation**: Similar to having 2GB of dedicated space for deep cleaning and reorganizing the database.

**Impact on load testing**: Doesn't directly affect user queries but ensures maintenance operations don't slow down during background cleanup.

### Write-Ahead Logging (WAL)

#### `max_wal_size=4GB`
**What it does**: Maximum size the transaction log can grow before forcing a checkpoint.

**Technical explanation**: When WAL files reach 4GB total, PostgreSQL triggers a checkpoint to flush dirty buffers to disk and clean up old WAL files.

**Simple explanation**: Similar to having a 4GB notebook for recording changes - when it's full, everything must be organized and filed properly.

**Impact on load testing**: Larger size = fewer checkpoint interruptions during heavy write loads, but longer recovery time if the system crashes.

#### `wal_buffers=64MB`
**What it does**: Memory used to buffer transaction log writes before flushing to disk.

**Technical explanation**: WAL data is buffered in 64MB of RAM before being written to disk to improve write performance.

**Simple explanation**: Similar to having a 64MB temporary notepad before writing things into the permanent logbook.

**Impact on load testing**: Higher values can improve write throughput during burst periods but have diminishing returns beyond optimal size.

#### `checkpoint_completion_target=0.9`
**What it does**: Spreads checkpoint I/O activity over 90% of the checkpoint interval.

**Technical explanation**: Instead of doing all checkpoint work at once, spreads it over 90% of the time between checkpoints to reduce I/O spikes.

**Simple explanation**: Similar to doing filing work gradually over 90% of the day instead of rushing to complete it all at closing time.

**Impact on load testing**: Reduces I/O interference with user queries during high-load periods.

---

## System-Level Factors

### Hardware Resources (Per Container)
- **32GB RAM**: Memory available for all processes and caching
- **32 vCPU**: Processing power available for parallel operations
- **Network I/O**: Connection bandwidth between containers
- **Disk I/O**: Storage performance for database reads/writes

### Railway Platform Factors
- **Container orchestration**: How Railway manages and scales containers
- **Network latency**: Time for data to travel between containers
- **Load balancer behavior**: How external traffic is distributed to API containers
- **Resource throttling**: Platform limits on CPU/memory/network usage

---

## Missing Factors to Consider

- replicas -> how many / of what / how do they influence things etc.

### 1. Connection Pooler Settings Not Currently Configured

#### `PGPOOL_CHILD_LIFE_TIME` (Default: 5400 seconds)
**What it does**: How long a PGPool child process lives before being recycled.
**Why it matters**: Prevents memory leaks and ensures fresh processes during long-running load tests.
**Recommendation**: Setting to 5400 (1.5 hours) provides longer duration than connection lifetime (1800s).

#### `PGPOOL_CHILD_MAX_CONNECTIONS` (Default: 1000)
**What it does**: Maximum number of connections a single child process handles before being recycled.
**Why it matters**: Prevents memory accumulation in busy child processes.
**Recommendation**: Set to 1000 to recycle child processes after handling 1000 connections.

#### `PGPOOL_RESERVED_CONNECTIONS` (Default: 0)
**What it does**: Reserves connection slots for superuser connections when at capacity.
**Why it matters**: Ensures admin access during overload situations.
**Recommendation**: Set to 5-10 for emergency access during load tests.

### 2. PostgreSQL Settings Not Currently Configured - to investigate
- `max_worker_processes`
- `max_parallel_workers_per_gather`
- `random_page_cost`
- `seq_page_cost`
- sharding - for write scalability - related to both pgpool and nodes

### 3. API Application Settings to Consider - to investigate
- `keepAliveTimeout`
- `connectionTimeout`
- `bodyLimit`

### 4. Operating System Factors - to investigate
- File Descriptor Limits
- TCP Socket Settings
- Memory Overcommit Settings

### 5. Load Balancer Configuration - to investigate
- Session Affinity
- Health Check Settings
- Timeout Settings

---

## Monitoring and Observability - to do

---

## Load Testing Readiness Checklist - to do

---

## Frequently Asked Questions (FAQ)

### Q: Why does PGPool stay at 18GB memory usage at all times while other containers stay low?

**A:** The 18GB constant memory usage is caused by the `PGPOOL_NUM_INIT_CHILDREN="800"` setting. PGPool pre-forks all 800 child processes at startup, and each child uses ~23MB of memory (800 × 23MB = ~18GB). This includes:
- Basic process overhead (~4-6MB per child)
- Connection pool structures for `PGPOOL_MAX_POOL="1000"` cached connections
- Internal buffers for query processing and session management

This is normal behavior - PGPool keeps all children running permanently for instant response times. Memory usage can be reduced by lowering the number of children, but this trades memory efficiency for peak performance capacity.

### Q: Should DB_POOL_MAX × workers equal PGPOOL_NUM_INIT_CHILDREN for optimal setup?

**A:** Yes, for optimal setup they should be equal or very close:
```
PGPOOL_NUM_INIT_CHILDREN = API_WORKERS × DB_POOL_MAX
```

In this case: 8 workers × 100 max connections = 800 PGPool children needed.

Each PGPool child handles exactly ONE active client connection at a time, so having more children than possible connections wastes memory (~5GB for every 200 extra children), while having fewer causes connection queueing and performance degradation.

### Q: Does DB_POOL_IDLE_TIMEOUT close connections down to DB_POOL_MIN only?

**A:** Yes, exactly. With these settings:
- **During high traffic**: 800 active connections (8 workers × 100 each)
- **After 5 minutes idle**: Pool shrinks to 600 connections (8 workers × 75 each)  
- **Connections closed**: 200 connections are terminated

The `DB_POOL_MIN` acts as a "keep warm" reserve - the pool never shrinks below this minimum, ensuring 75 ready connections per worker are always available for instant response to new traffic.

### Q: Are the always-open minimum connections (600 total) recycled at any point?

**A:** The minimum connections are **not automatically recycled** by the connection pool itself - they stay open indefinitely as persistent connections. However, they do get closed and recreated by:

1. **PGPool's CONNECTION_LIFE_TIME="1800"**: Every 30 minutes, PGPool forces ALL backend connections (including minimum ones) to close and recreate fresh connections
2. **PostgreSQL events**: Server restarts, maintenance, network errors, or connection limit policies
3. **Application-level recycling**: Some connection libraries have max connection age settings (though not configured in the current setup)

The 30-minute PGPool recycling handles any connection staleness issues. The persistent minimum connections eliminate connection establishment overhead for baseline traffic, which is beneficial for performance.

### Q: Are the settings in the connection.ts file correctly configured?

**A:** The runtime configuration is correct because environment variables override code defaults, but there are some discrepancies to note:

**✅ Working correctly (env variables override defaults):**
- `min: 75` (env: `DB_POOL_MIN="75"` overrides code default `'10'`)
- `max: 100` (env: `DB_POOL_MAX="100"` overrides code default `'75'`)
- `idleTimeoutMillis: 300000` (env overrides code default `'30000'`)
- `statement_timeout: 10000` (env overrides code default `'30000'`)

**⚠️ Misleading code defaults:** The fallback values in the code don't match the actual environment variables, which could cause confusion during debugging or in different environments.

**✅ Additional TCP optimizations:**
- `keepAlive: true` - Maintains persistent connections and prevents timeouts
- `keepAliveInitialDelayMillis: 10000` - Reduces network overhead while maintaining reliability
- `ssl: false` - Appropriate for internal Railway network communication

**📊 Connection event logging:** The connection event handlers provide excellent visibility into pool behavior during load testing:
- `connect`: New connections established
- `acquire`: Connections taken from pool 
- `release`: Connections returned to pool
- `error`: Connection failures

**Recommendation:** Update the code defaults to match the production environment variables to avoid confusion.

### Q: Are DB_POOL_CONNECTION_TIMEOUT="5000" and DB_STATEMENT_TIMEOUT="10000" sufficient for high load?

**A:** Yes, these values are well-configured for the high-load setup:

**DB_POOL_CONNECTION_TIMEOUT="5000" (5 seconds):**
- ✅ Long enough for normal PGPool connection establishment
- ✅ Short enough to fail fast during PGPool overload  
- ✅ Prevents API requests from hanging during database issues

**DB_STATEMENT_TIMEOUT="10000" (10 seconds):**
- ✅ Longer than connection timeout (prevents cascade failures)
- ✅ Short enough to prevent runaway queries from blocking the pool
- ✅ Appropriate for most OLTP operations at 250-300 RPS

**Critical relationship:** Connection timeout (5s) < Statement timeout (10s) ensures proper failure hierarchy and retry opportunities. These values are optimal for the load testing scenarios and don't need adjustment.

### Q: How does TCP keep-alive detect dead connections? What happens when a keep-alive packet is sent to a dead connection?

**A:** TCP keep-alive works as an early warning system for dead connections:

**The Keep-Alive Detection Process:**
1. **After 10 seconds idle** (`keepAliveInitialDelayMillis`), Node.js sends small TCP probe packets asking "are you there?"
2. **Live connection**: PGPool responds with TCP ACK packet - connection stays active
3. **Dead connection**: No response or TCP RST (reset) packet received

**When Connection is Dead:**
- **Network/PGPool down**: Keep-alive probe gets no response → OS retries ~9 times over ~11 minutes → Socket marked dead → The `pool.on('error')` fires
- **Network equipment drops connection**: TCP RST packet received immediately → Socket closed instantly → Immediate error detection

**Benefits for Load Testing:**
- **Early detection**: Dead connections found before the next query attempt
- **Prevents mysterious errors**: No "connection reset by peer" during load tests  
- **Network tolerance**: Railway load balancers won't timeout idle connections
- **Pool stability**: Maintains steady connection count between load test runs

**The logging captures these events:**
```javascript
pool.on('error', (err, client) => {
  // Errors: ECONNRESET, ETIMEDOUT, EHOSTUNREACH
});
```

The 10-second delay ensures no overhead during active connections while providing automatic cleanup of dead connections for pool health.

### Q: With 32 vCPUs, is 8 workers optimal? How do Node.js workers use CPU cores?

**A:** 8 workers is conservative for 32 vCPUs. Here's how Node.js workers actually utilize CPU resources:

**How Workers Use CPUs:**
- Each worker is a **separate process** that can use **ALL 32 vCPUs** when needed
- Workers don't get "assigned" specific CPU cores
- The OS scheduler manages CPU time between workers
- Workers compete for CPU resources, they don't divide them

**Why 8 workers might underutilize 32 vCPUs:**
Most web applications are **I/O bound** (waiting for database responses), not CPU bound:
```
Current: 8 workers handling requests
Database response time: ~50ms average  
During those 50ms: Worker is blocked, CPU mostly idle
```

**With more workers (12-16):**
- While Worker 1 waits for database → Workers 2-16 handle new requests
- Better concurrent request handling during I/O waits
- Higher overall CPU utilization

**Optimal Worker Calculation:**
```javascript
// Current (conservative)
const numWorkers = Math.min(numCPUs, 8); // Capped at 8

// Better for I/O-bound apps
const numWorkers = Math.min(numCPUs * 0.75, 16); // 12-16 workers
```

**Trade-off consideration:** More workers = more database connections needed:
- 12 workers × 100 max connections = 1,200 total connections
- Would require `PGPOOL_NUM_INIT_CHILDREN="1200"`

**For load testing >500 RPS:** Consider scaling to 12-16 workers to better utilize the 32 vCPUs during I/O-bound operations.

### Q: What exactly is PostgreSQL's internal buffer pool and OS file cache? How do they work together?

**A:** These are two different levels of caching that work together to speed up database queries:

**PostgreSQL Internal Buffer Pool (shared_buffers = 8GB):**
- **Dedicated RAM** that PostgreSQL allocates exclusively for itself
- **Structured cache** storing 8KB data pages and index pages
- **Smart management**: PostgreSQL controls what data stays cached using LRU algorithms
- **Query-aware**: Optimized for database access patterns
- **Shared across connections**: All database users benefit from the same cache

**OS File Cache (estimated 14GB of the 22GB effective_cache_size):**
- **Operating system's automatic** caching of file contents in remaining RAM
- **Transparent to PostgreSQL** - OS manages it automatically
- **Raw file caching**: Stores PostgreSQL data files (.dat), WAL files, indexes
- **Larger capacity**: Can cache more total data than shared_buffers alone

**Two-level caching in action:**
```sql
-- Example query: SELECT * FROM products WHERE category = 'electronics';

Level 1 - PostgreSQL shared_buffers (8GB):
✅ Cache hit: Return immediately (~0.01ms - fastest)
❌ Cache miss: Go to Level 2

Level 2 - OS file cache (14GB):  
✅ Cache hit: Return from OS cache (~0.1ms - still fast)
❌ Cache miss: Read from SSD (~1-5ms - slower)
```

**Why both matter for load testing:**
- **shared_buffers**: Provides fastest access to frequently queried data
- **OS file cache**: Larger backup layer catches data PostgreSQL doesn't prioritize
- **Combined 22GB**: Gives query planner realistic cache estimates for optimal execution plans

**Memory relationship:**
- `shared_buffers = 8GB` (actual PostgreSQL allocation)
- `effective_cache_size = 22GB` (shared_buffers + OS cache estimate)
- **NOT additive**: 22GB includes the 8GB, doesn't add to it

This two-level caching system maximizes your chances of serving queries from RAM rather than disk during high-load scenarios.

### Q: How should memory allocation be calculated for PostgreSQL nodes? What's the breakdown for 32GB containers?

**A:** Here's the proper memory allocation calculation for the 32GB PostgreSQL containers:

**Complete Memory Breakdown:**
```
PostgreSQL shared_buffers:     8GB  (25%) - PostgreSQL internal cache
Connection processes:          2GB  (6%)  - 500 connections × ~4MB each
work_mem headroom:             4GB  (12%) - Memory for sorting/hashing operations
maintenance_work_mem:          2GB  (6%)  - VACUUM, index rebuilding operations  
OS kernel/overhead:            2GB  (7%)  - System processes and overhead
                              ----
Used for applications:        18GB
Available for OS file cache:  14GB  (44%) - Operating system file caching
                              ----
Total:                        32GB
```

**Key Memory Settings Derived:**
- `shared_buffers = 8GB` (25% of total RAM - PostgreSQL's dedicated cache)
- `effective_cache_size = 22GB` (8GB shared_buffers + 14GB OS cache estimate)
- `work_mem = 32-64MB` (Total headroom ÷ max connections = 4GB ÷ 500 = ~8MB per operation, with safety margin)
- `maintenance_work_mem = 2GB` (For VACUUM and index operations)

**Memory Allocation Rules:**
1. **shared_buffers**: 25-30% of total RAM (rarely more than 8-12GB)
2. **Connection overhead**: ~4MB per connection for process memory
3. **work_mem headroom**: Reserve memory for concurrent operations (sorts, joins)
4. **Maintenance operations**: Reserve 1-2GB for background maintenance
5. **OS overhead**: 2-4GB for kernel and system processes
6. **OS file cache**: Remaining RAM for automatic file caching

**effective_cache_size calculation:**
```
effective_cache_size = shared_buffers + OS file cache
        22GB         =      8GB       +     14GB
```

**Critical for load testing:**
- This allocation ensures stable performance under 500 concurrent connections
- Prevents out-of-memory conditions during high query volumes
- Balances PostgreSQL's internal cache with OS-level file caching
- Reserves adequate memory for maintenance operations that run during load tests
