# NEXORA — Galaxy feature parity roadmap

This document defines the functional scope for NEXORA. The goal is to reproduce publicly observable categories of social-game functionality with original implementation, original visual assets, and NEXORA branding. It is not a copy of Mobstudio source code, private APIs, user data, or protected assets.

## Product principles

- Adults-only service (18+), with age gate and moderation workflows.
- Mobile-first responsive web application; desktop support.
- Server-authoritative state for identity, inventory, balances, travel, moderation, and reputation.
- Every economy mutation is transactional, auditable, and idempotent.
- User safety: block, report, mute, privacy controls, rate limits, and moderator audit logs.
- Do not mark a feature complete until it has implementation, persistence, authorization checks, and tests.

## Feature inventory

### Accounts and identity
- Registration, email verification, login/logout, password reset, secure sessions.
- Profile, nickname, avatar, biography, interests, age visibility, location visibility.
- Online/presence state, privacy settings, account deletion/export.
- Friends, friend requests, favorites, blocks, mutes, reports.

### Avatar, appearance, wardrobe
- Character body, head/face, skin tone, hair, facial hair, clothing, footwear, accessories.
- Outfit presets, owned-item inventory, equip/unequip, preview.
- Original 2D/3D asset pipeline; asset metadata, rarity, categories, gender/body compatibility.
- Character actions, emotes, animations, visual effects, aura/halo/title cosmetics.

### Reputation, authority, progression
- Separate authority, popularity, reputation, level, and experience values.
- Server-calculated score events with reason codes and immutable history.
- Daily/weekly/all-time leaderboards, titles, badges, achievements, progression rewards.
- Anti-abuse controls: rate limits, duplicate/reciprocal vote detection, suspicious activity review.
- Purchases must not directly fabricate reputation.

### Planets, rooms, travel
- Galaxy map, planet directory, themed locations, room instances and occupancy.
- Planet owner and moderator roles, visitor limits, access lists, public/private settings.
- Planet descriptions, rules, themes, backgrounds/interiors, room configuration.
- Tickets, routes, travel animation/state, travel costs, arrival/departure events.
- Planet chat and location-specific activities.
- VIP/exclusive areas must have explicit entitlement checks.

### Prison and moderation gameplay
- In-world prison locations, sentence records, reason codes, start/end timestamps.
- Server-enforced movement restrictions while a sentence is active.
- Authorized moderator actions, appeals/reports, early release workflow, audit trail.
- Prison visitor permissions, permitted chat areas, activities and release notifications.
- Distinguish playful game mechanics from real-world law enforcement claims.

### Social and relationship systems
- Discovery feed, profile search and filters, likes, mutual matches.
- Friends, relationship status/consent flows, virtual weddings and family features.
- Gifts, shared character photos/poses, notifications.
- User-controlled privacy and the ability to revoke relationship/family links.

### Clans, pets, groups and community
- Clans/groups, membership requests, roles, emblem, shared treasury with ledger.
- Pets/companions, ownership, care/progression, cosmetics.
- Blogs/posts, comments, reactions, reporting and moderation.
- Community newspaper/editorial posts with editor permissions.
- Events, contests, tournaments, mini-games, daily/seasonal missions.

### Messaging and realtime
- Direct, group, planet, and private-room chats.
- Realtime delivery, read state, presence, notifications.
- Image upload with validation, scanning/moderation, storage access controls.
- Blocking and reporting enforced on the server.

### Economy and commerce
- Separate soft and premium currencies (Nexora Coins and Nexora Diamonds).
- Append-only ledger, balances, transfers, gifts, shop catalog, purchase history.
- Tickets, clothing, accessories, pet items, gifts, VIP subscriptions.
- Atomic transactions, idempotency keys, fraud controls, admin adjustment audit.
- Payment provider integration only after provider credentials and legal requirements are supplied.

### Privileges and administration
- Explicit role/permission model for support, moderators, planet owners, editors, admins, developers.
- User moderation, reports queue, bans/mutes/prison, appeal handling.
- Planet/item/catalog/event management.
- Currency adjustments with reason and immutable audit log.
- Metrics, operational logs, feature flags, developer tools protected from ordinary users.

## Delivery phases

1. **Foundation:** repository audit, architecture, PostgreSQL schema/migrations, configuration validation, health checks, test harness.
2. **Identity:** registration, verification, login, sessions, profile, privacy, blocks/reports.
3. **Social core:** discovery, likes/matches, friends, messaging and realtime presence.
4. **Avatar economy:** character editor, wardrobe, inventory, catalog, gifts and ledger.
5. **Reputation:** authority/progression events, titles, achievements and leaderboards.
6. **Virtual world:** planet map, rooms, room administration, travel and planet chat.
7. **Activities:** emotes/actions, pets, clans, relationships, blogs, newspaper, events and mini-games.
8. **Prison/moderation:** sentence lifecycle, access rules, appeals and audit.
9. **Operations:** admin console, monitoring, backups, security review, deployment and load testing.

## Verification checklist

A feature is complete only when:
- Its UI has real loading, empty, success, and error states.
- Its API validates input and checks authorization.
- Data persists in PostgreSQL where applicable.
- Sensitive operations are server-authoritative and logged.
- Automated tests cover success, failure, permission denial, and abuse cases.
- Documentation describes configuration and operational requirements.

## Research status

This is a product scope based on publicly described and observable feature categories. Exact current behavior, limits, formulas, and screen-by-screen details must be verified against the current official app and public documentation. Do not invent undocumented formulas or claim complete parity before testing.
