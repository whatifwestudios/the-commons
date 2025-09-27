# Database Design for Scalable Logging

## Problem Statement
Scale The Commons game to thousands of concurrent players while maintaining economic integrity and debugging capability.

## Current Issues at Scale
- **File-based logging bottleneck**: 1000 players × 10 transactions/min = 10,000 writes/min
- **Log rotation complexity**: Multiple processes writing to same files
- **Search/analysis difficulty**: Can't query "show me all failed parcel purchases today"
- **Storage explosion**: Even with 90% reduction, still massive at scale

## Recommended Multi-Tier Logging Architecture

### Tier 1: Critical Economic Transactions → Database
```javascript
// Permanent audit trail for economic integrity
CRITICAL_TRANSACTIONS = ['CASH_SPEND', 'PARCEL_PURCHASE', 'BUILD_COMPLETE', 'DESTROY_BUILDING', 'REPAIR_BUILDING']
→ PostgreSQL/MySQL table with indexing
→ Never deleted, used for disputes/analysis
→ ~10MB/day/1000 players
```

**Database Schema:**
```sql
CREATE TABLE transaction_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    player_id VARCHAR(50) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2),
    location_row INT,
    location_col INT,
    timestamp BIGINT NOT NULL,
    game_day DECIMAL(10,4),
    result JSON,
    INDEX idx_player_timestamp (player_id, timestamp),
    INDEX idx_type_timestamp (transaction_type, timestamp),
    INDEX idx_game_day (game_day)
);
```

### Tier 2: Recent Activity → In-Memory Circular Buffer
```javascript
// Fast access for debugging/monitoring
class GameLogger {
    constructor(maxEntries = 10000) {
        this.buffer = new Array(maxEntries);
        this.index = 0;
        this.size = 0;
    }

    log(entry) {
        this.buffer[this.index] = { ...entry, timestamp: Date.now() };
        this.index = (this.index + 1) % this.buffer.length;
        if (this.size < this.buffer.length) this.size++;
    }

    getRecent(minutes = 10) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return this.buffer
            .filter(entry => entry && entry.timestamp >= cutoff)
            .sort((a, b) => b.timestamp - a.timestamp);
    }
}
```

### Tier 3: Errors Only → File Logging
```javascript
// Only system errors, startup/shutdown events
// ~1MB/day even at massive scale
if (level === 'ERROR' || level === 'FATAL') {
    fileLogger.write(entry);
}
```

## Implementation Strategy

### Phase 1: Add Database Logging
```javascript
// In server-economic-engine-v2.js
const CRITICAL_TRANSACTIONS = ['CASH_SPEND', 'PARCEL_PURCHASE', 'BUILD_COMPLETE', 'DESTROY_BUILDING', 'REPAIR_BUILDING'];

async logCriticalTransaction(transaction, result) {
    if (CRITICAL_TRANSACTIONS.includes(transaction.type)) {
        await db.query(`
            INSERT INTO transaction_log
            (player_id, transaction_type, amount, location_row, location_col, timestamp, game_day, result)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            transaction.playerId,
            transaction.type,
            transaction.amount || null,
            transaction.location ? transaction.location[0] : null,
            transaction.location ? transaction.location[1] : null,
            Date.now(),
            this.gameState.gameTime,
            JSON.stringify(result)
        ]);
    }
}
```

### Phase 2: In-Memory Buffer
```javascript
// Replace console.log with tiered logging
this.gameLogger.log({
    level: 'INFO',
    type: 'TRANSACTION',
    playerId: transaction.playerId,
    data: transaction
});
```

### Phase 3: Analytics Integration
- Send aggregated metrics to external service (DataDog, New Relic)
- Player activity heatmaps
- Economic balance monitoring
- Performance metrics

## Performance Benefits at Scale

### Performance Characteristics
- **Database writes**: ~100/sec (manageable for modern databases)
- **Memory access**: Microseconds for recent data
- **File I/O**: ~1% of current volume

### Reliability Features
- **Economic transactions never lost**: Database ACID properties
- **Recent activity survives server restarts**: Quick reload from DB
- **Error investigation capability maintained**: File logs for critical issues

### Analytics Capabilities
- **SQL queries**: "Show economic imbalance trends over last week"
- **Real-time monitoring**: "Active players in last 5 minutes"
- **Performance tracking**: "Average transaction processing time by type"
- **Economic analysis**: "Parcel purchase patterns by game day"

## Database Connection Configuration
```javascript
// database-config.js
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'commons_user',
    password: process.env.DB_PASS || 'secure_password',
    database: process.env.DB_NAME || 'the_commons',
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000
};

const pool = mysql.createPool(dbConfig);
module.exports = pool;
```

## Migration Strategy
1. **Development**: Implement database logging alongside existing logging
2. **Testing**: Verify economic transaction integrity
3. **Production**: Gradually reduce console.log verbosity
4. **Optimization**: Add indexes and optimize queries based on usage patterns

## Estimated Resource Requirements
- **Database storage**: ~10MB/day/1000 players for critical transactions
- **Memory usage**: ~50MB for 10,000 entry circular buffer
- **CPU overhead**: <1% additional load for database writes
- **Network**: Minimal impact (local database connections)