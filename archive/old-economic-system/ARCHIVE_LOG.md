# Old Economic System Archive

This directory contains the old economic system files that were replaced by the v2 economic system.

## Archived Files (Date: 2025-09-26)

1. **cash-manager.js** - Old client-side cash management system
   - Replaced by: Server-authoritative cash management in server-economic-engine-v2.js

2. **economic-engine.js** - Old client-side economic calculations
   - Replaced by: server-economic-engine-v2.js (server-authoritative)

3. **economic-types.js** - Old economic type definitions
   - Replaced by: Integrated into server-economic-engine-v2.js

4. **economic-performance.js** - Old performance calculation system
   - Replaced by: Performance calculations in server-economic-engine-v2.js

5. **client-economic-api.js** - Old client API layer
   - Replaced by: economic-client-v2.js

6. **server-economic-engine.js** - Old server economic engine (v1)
   - Replaced by: server-economic-engine-v2.js

## Key Improvements in v2 System

- **Server-Authoritative**: All calculations happen server-side
- **Global JEEFHH**: All buildings affected by worst-performing resource
- **Local CARENS**: Building-specific multipliers based on adjacent parcels
- **Attenuation System**: Distance-based effects for CARENS impacts
- **Transaction-Based**: BUILD_START/BUILD_COMPLETE transactions
- **Construction Timing**: Buildings contribute 0 resources until completion
- **Multiplayer Ready**: Designed for shared global state

## Migration Notes

- All economic calculations moved from client to server
- Cash management now server-authoritative
- Building performance calculation completely rewritten
- CARENS system enhanced with local/global split
- Construction timing fixed (no immediate JEEFHH impact)