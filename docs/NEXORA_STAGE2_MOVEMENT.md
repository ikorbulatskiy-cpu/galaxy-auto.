# NEXORA Stage 2: 2D room movement

## Implemented

- `room_player_positions` stores one persistent position per user and room.
- `/ws-movement` is a separate authenticated WebSocket so the existing public chat socket and its protocol remain unchanged.
- `/api/movement/rooms/:roomId/positions` returns saved coordinates for the current planet.
- Scene taps and clicks produce a destination; the client sends small movement steps.
- The server validates room access, coordinate bounds, update frequency, and movement speed before saving.
- PostgreSQL LISTEN/NOTIFY distributes movement events across Render instances.
- Room positions survive disconnects and are reused on the next visit.

## Safety and deployment

The migration is `007_room_player_movement.sql` and is registered in `scripts/migrate.js`. It creates a new table and does not rewrite existing account, character, room, or message records. It will be applied automatically by the existing `npm run db:migrate` command after this branch is merged and deployed.

The change is on `nexora-stage2-movement`, stacked on the Stage 1 branch. It is not deployed to production. No production database connection string or data was changed.

## Verification still required

- GitHub Actions: run #380 passed on commit `b7281c66d0acfc35f40f60ff6d13c5540666c2f1` (34 tests passed, 0 failed; syntax checks and both migration passes succeeded).
- Two-account test in the same room.
- iOS Safari touch test and desktop Chrome pointer test.
- Reconnect and saved-position test.
- Cross-instance test with two Render instances.

Source-level implementation and unit tests do not replace those live checks.