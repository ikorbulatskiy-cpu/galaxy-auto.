# NEXORA — Functional specification based on the supplied Galaxy manual

## Purpose and boundaries

This specification translates the user-provided description of Galaxy into an original NEXORA product plan. It is a functional reference, not a request to copy Mobstudio source code, private APIs, proprietary artwork, trademarks, or user data. NEXORA must use its own code, name, interface, illustrations, animations, and content.

The supplied manual may describe legacy or changed Galaxy features. Treat every item as a research lead; verify current public behavior before claiming exact compatibility.

## A. Client shell and main menu

- Responsive main menu and in-app navigation.
- Character registration: nickname, presentation/sex selection, initial appearance.
- Character recovery using a one-time recovery credential or secure account recovery flow. Never expose a reusable password-like recovery code in logs or support tools.
- News and update feed (NEXORA News).
- Settings: sound, music, arrival/departure notices, chat cursor, language, private-message notifications, mention notifications, browsing/away indicator, optional device passcode/biometric unlock where supported.
- Help center: character appearance, planets/rooms, abilities, touch controls, chat reactions/emotes, FAQ.
- Invite friends with shareable referral links. SMS invitations only through a compliant provider with explicit user action and consent.
- Internet connection diagnostics and official website links.

## B. Main virtual-world interface

### Chat panel
- Room/planet topic.
- Realtime public messages, virtual actions, arrivals and departures.
- Nickname and role labels.
- Scrollback with pagination/virtualization.
- Delivery state: queued, delivered, failed. Do not claim delivery until server acknowledgement.

### World/planet panel
- Original planet scene/background and decorations.
- Visible avatars and presence.
- Select/focus avatar; responsive touch controls.
- Room occupancy and capacity.

### Event panel
- New private messages, friend activity, system notices, invitations, game events.
- Connection and message-delivery status with accessible text labels, not color alone.

### Avatar presentation
- Head/body, outfit, accessories, aura/halo cosmetics, owner/supervisor markers, emotes.
- Username and group label near selected avatar.
- All role markers must reflect server-authorized roles.

### Navigation and shortcuts
- Menu, exit/back, focus-self, recent room activity, event center, emote picker.
- Keyboard and touch equivalents; shortcuts configurable and documented.

## C. Own-character menu

- Speak and insert approved emoji/emotes.
- Perform self-actions; planet owners can configure allowed action catalog.
- Extras: private messages, friends, groups/clans, ratings, search, dating/discovery ads, weddings/families, newspaper, blogs, polls, privileges, information/rules, support.
- Entertainment: safe mini-games, contests, pets, broadcasts/information feeds where licensed and available.
- Settings: account recovery, wardrobe, appearance change, planet management, language/skin/theme, account protection and inactivity settings.
- Travel to another planet; move avatar within a room.
- My Info: profile, online state, authority, privileges, relationships, pets, balances (private by default), blog, gallery, personal details, owned items, planets and supervisor roles.
- Personal history: moderation actions, appeals, account creation date, playtime, referral statistics, achievements, notes visible only to the note author, awards and penalty history.
- Planet Info: creation date, owner, population/capacity, access mode, lists, subject, scene, decorations, weather effects, catalog categories, supervisors and permissions.
- Shop and inventory.
- Support and FAQ.
- Clearly labeled room announcement feature with rate limits and owner/moderator controls.
- Emotes and clear-local-chat option.

## D. Other-character menu

- Speak/highlighted mention, view profile, view public photo gallery, achievements, pets, blog and privileges.
- Contextual actions: private message, add/remove friend, send gift, consensual transfer of earned virtual currency where permitted, propose virtual relationship/marriage, adoption request, invite to clan.
- Move/focus near another avatar only as a cosmetic movement action in the same room, subject to privacy and room rules.
- Owner/supervisor actions only when authorized: remove from room, remove and block re-entry, add/remove allow-list entry, appoint/remove supervisor.
- Every moderation action requires a reason, permission check, audit record, and appeal path.

## E. Friends, groups and social life

### Friends
- Requests, accept/decline, friend list, privacy-controlled presence/location sharing, birthday visibility only when user opts in, activity feed controls.
- Never reveal hidden/invisible location or private profile data.

### Clans/groups (original NEXORA implementation)
- Name, home planet, journal, motto, description, emblem.
- Founder/leader, assistants, member roles, invitations, join/leave history.
- Shared treasury with a transactional ledger, member contribution history, limits and audit.
- Membership progression and group leaderboards.
- No inter-group harassment or coordinated targeting.

### Dating and relationships
- Discovery/search, user-authored dating ads, optional promoted placement with clear labeling.
- Virtual marriage/relationship requests requiring mutual consent; divorce/end relationship.
- Adoption/family links require explicit consent from both accounts and privacy controls. No real-world legal implications.

## F. Reputation, ratings and contests

- Authority, reputation, popularity, experience and level are separate server-calculated metrics.
- Weekly and continuous leaderboards: community favorites, helpful members, creators/reporters, game achievements, generous gifting (without rewarding coercive behavior), group/planet rankings, pet-care achievements, photo contests and referral milestones.
- Voting limits, anti-brigading, bot detection, eligibility rules, transparent scoring periods and appeal/report mechanisms.
- Awards, badges, titles and visual effects.
- Never sell authority or allow paid vote manipulation.

## G. Blogs, photo gallery, newspaper and polls

- Public/friends-only/private blog posts, comments, reactions and reporting.
- Photo albums with visibility controls, upload limits, consent/report tools and moderation.
- Community newspaper with sections, reporter subscriptions, notifications, editors, proofreaders and moderators.
- Polls with audience, closing time, eligibility and anti-manipulation rules.
- Editorial privileges are assigned through a documented role and election/approval process.

## H. Privileges and governance

- Permission-based roles such as mentor, reporter, proofreader, newspaper moderator, room moderator, senior moderator, support, event organizer, developer.
- Role descriptions, eligibility, applications, review/election workflow, term history, revocation and appeals.
- Separate platform-wide roles from planet-specific owner/supervisor roles.
- No automatic trust in client-provided role names; enforce permissions on the server.
- Avoid stigmatizing or humiliating role labels. Moderation must be proportionate and reviewable.

## I. Planets, rooms and travel

- Planet catalog by category, popularity, favorites, search by name/letter, owned planets.
- Planet profile: creation date, owner, population/capacity, open/closed state, subject, background, decor, weather, category, supervisors and permissions.
- Owner tools: rename, theme, decor, capacity, open/closed, allow-list, block-list, supervisor rights, room action catalog, profanity filter, feature/promotion period, auction listing.
- Travel with ticket/fee rules, route animation, arrival/departure events and server-side validation.
- Planet auction only as a virtual-item marketplace with transparent rules, no cash-out, escrow/ledger and dispute handling.

## J. Prison and moderation

- In-world roleplay prison with sentence duration, reason, start/end, visitor rules and activities.
- Distinguish roleplay detention from platform moderation sanctions.
- Moderation sanctions require evidence reference, reason, authorized staff role, expiry, notification, appeal and audit trail.
- No user-to-user imprisonment without authorized, reviewable moderation powers.

## K. Pets and companions

- Pet species, name, presentation, age stage, health, hunger, cleanliness, happiness, vaccination/care status, fighter/non-fighter cosmetic/game mode.
- Care actions and items: home, bowl, food, toys, treatment.
- Visit other pets, gift pet items, optional breeding only with clear consent and safeguards.
- Nursery/adoption marketplace for virtual pets.
- Pet progression and non-cash competitive events. Do not create real-money animal fighting or cash wagering.

## L. Games and events

- Civilization-style asynchronous strategy with original races, buildings, resources, population, treasury, upgrades, maintenance, artifacts and diplomacy. Avoid real-world harm instructions; conflict remains abstract game mechanics.
- Team football-style mini-game with teams, captains, player skills, matches, stadium rooms, team and scorer rankings.
- Hurdling/time-trial game.
- Anagram, arithmetic and quiz rooms with bot-hosted rounds, scoring and anti-cheat.
- Seasonal events, daily tasks, contests, tournaments, leaderboards and cosmetic rewards.
- Live sports text updates only from licensed/approved data sources.

## M. Economy, shop and account services

- Virtual soft currency and premium currency, wallet, transaction ledger, shop, gifts, wardrobe rentals/expiry, permanent cosmetics, pets, pet items, planets, decorations and skins.
- Top-up/payment integration only through a compliant provider and only after legal, tax, platform and provider requirements are met.
- No real-money lotteries, sports betting, tote betting, cash prizes, or wagering in the initial product. Replace with free-entry skill contests and non-transferable cosmetic rewards.
- No sale or transfer of accounts, usernames, staff roles or privileged access.
- Character inactivity policy must be transparent, with advance notices, export/recovery options and no silent destructive reset.
- Account protection, device/session management and secure recovery.

## N. Integrations and privacy replacements

- Do not collect third-party service passwords (for example, legacy ICQ credentials).
- Do not implement covert tracking, hidden “bugging devices”, or location surveillance. Replace with opt-in presence sharing, user-visible notifications, and revocable consent.
- SMS/email/push notifications must be opt-in, rate-limited and privacy-preserving.
- External email sending requires a configured provider and anti-abuse controls.
- Real-world phone numbers and precise location are private by default.

## O. Security and engineering requirements

- PostgreSQL schema and migrations; typed API contracts.
- Secure password hashing, verified email, session rotation, CSRF protection where cookie auth is used, XSS prevention, input validation, rate limiting and abuse detection.
- Authorization enforced server-side for every privileged action.
- Atomic/idempotent ledger operations and immutable audit events.
- Upload validation, malware scanning where available, private object storage and signed URLs.
- Data export/deletion, retention policy, backups and restore drills.
- Automated unit, integration, authorization, abuse and end-to-end tests.
- Accessible responsive UI; reduced-motion and low-bandwidth modes.
- No fake buttons or demo data represented as live functionality.

## Delivery order

1. Audit existing repository and document current implementation.
2. Data model, migrations, API contracts, test setup and deployment configuration.
3. Accounts, profiles, secure recovery, settings and privacy.
4. Realtime chat, presence, friends, blocks and reports.
5. Avatar, wardrobe, inventory and shop.
6. Planet catalog, room instances, movement and moderation.
7. Authority, achievements, ratings, groups and relationships.
8. Blogs, photo gallery, newspaper, polls and privileges.
9. Pets, mini-games, contests and events.
10. Admin console, security review, observability, backups and load tests.

## Definition of done

Do not claim the whole platform is complete until every promised module has a working UI, backend behavior, persistent data where applicable, permission checks, tests, error handling, and deployment verification. Clearly label unavailable external integrations and unfinished modules.
