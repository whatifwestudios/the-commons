# The Commons - Development Notes

## Core Design Philosophy: Multiplayer-First

**IMPORTANT**: This game is fundamentally multiplayer. Solo play is merely a special case of multiplayer with one participant.

### Key Principles:

1. **Shared State Priority**: All game systems should assume shared state as the default
2. **Real-time Systems**: Optimize for real-time multiplayer synchronization and conflict resolution
3. **Multiplayer UX**: Design all interfaces and interactions with multiple concurrent players in mind
4. **Player Interaction**: Core gameplay revolves around player-to-player interactions (auctions, governance, economic competition)
5. **State Management**: Use multiplayer state management patterns even for solo play

### Architecture Implications:

- State synchronization is critical, not optional
- Player ownership and permissions must be robust for multiplayer context
- UI should show multiple players' activities simultaneously
- Real-time updates and WebSocket/SSE systems are core infrastructure
- Economic systems designed for player competition and collaboration
- All features should work seamlessly with 2+ players

### Current Multiplayer Systems:

- WebSocket/SSE state synchronization (`api/websocket.js`)
- Player identification and ownership (`isCurrentPlayer()` helper)
- Real-time auction system with bid conflicts and extensions
- Shared parcel ownership and building construction
- Multiplayer-aware context menus and UI elements

Remember: When implementing any feature, ask "How does this work with multiple players?" first, not "How do we make this multiplayer-compatible?" later.