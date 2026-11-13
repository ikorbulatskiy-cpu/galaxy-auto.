-- Minimal realistic legacy dataset for the additive account migration CI.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO nexora_social_world.accounts
  (id,nickname,nickname_normalized,recovery_code_hash,recovery_code_lookup_hash,created_at,last_login_at)
OVERRIDING SYSTEM VALUE
VALUES
  (900001,'LegacyOwner','legacyowner','legacy-bcrypt-placeholder',encode(digest('legacy1234','sha256'),'hex'),NOW()-INTERVAL '30 days',NOW()-INTERVAL '1 day'),
  (900002,'LegacyStaff','legacystaff','legacy-bcrypt-placeholder',NULL,NOW()-INTERVAL '20 days',NOW()-INTERVAL '2 days');

INSERT INTO nexora_social_world.characters
  (account_id,nickname,avatar,planet,position_x,authority,updated_at,profile_status,profile_bio,level,experience,authority_title,aura_enabled)
VALUES
  (900001,'LegacyOwner','{"spriteGender":"female","body":"slim","hair":"long","outfit":"rose"}'::jsonb,'custom-90001',0.61,245,NOW()-INTERVAL '1 day','Владелец старого мира','Профиль перенесён без потери кода.',7,1250,'ANGEL',TRUE),
  (900002,'LegacyStaff','{"spriteGender":"male","body":"regular","hair":"short","outfit":"blue"}'::jsonb,'starter',0.44,80,NOW()-INTERVAL '2 days','Модератор','Тестовый аккаунт для проверки миграции.',3,420,'BEDA',TRUE);

INSERT INTO nexora_social_world.wallets(account_id,balance,updated_at)
VALUES (900001,1234,NOW()),(900002,345,NOW());

INSERT INTO nexora_social_world.sessions(account_id,token_hash,expires_at,created_at)
VALUES (900001,encode(digest('old-session-token','sha256'),'hex'),NOW()+INTERVAL '7 days',NOW()-INTERVAL '1 hour');

INSERT INTO nexora_social_world.friends(account_id,friend_account_id,created_at)
VALUES (900001,900002,NOW()-INTERVAL '5 days');

INSERT INTO nexora_social_world.friend_requests(from_account_id,to_account_id,status,created_at,updated_at)
VALUES (900002,900001,'pending',NOW()-INTERVAL '3 days',NOW()-INTERVAL '3 days');

INSERT INTO nexora_social_world.conversations(id,participant_a,participant_b,created_at,updated_at)
VALUES (70001,900001,900002,NOW()-INTERVAL '4 days',NOW()-INTERVAL '1 hour');

INSERT INTO nexora_social_world.direct_messages(id,conversation_id,sender_account_id,body,created_at,read_at)
VALUES (71001,70001,900001,'Старое личное сообщение',NOW()-INTERVAL '1 hour',NULL);

INSERT INTO nexora_social_world.notifications(account_id,actor_account_id,type,payload,created_at)
VALUES (900002,900001,'friend_request','{"title":"Старая заявка","body":"Проверь перенос уведомлений."}'::jsonb,NOW()-INTERVAL '2 hours');

INSERT INTO nexora_social_world.custom_planets
  (id,owner_account_id,name,description,category,theme,accent_color,access_mode,capacity,welcome_message,status,total_visits,created_at,updated_at)
VALUES (90001,900001,'Старая планета','Планета для проверки переноса.','social','aurora','#9d8cff','invite',45,'Добро пожаловать!','active',12,NOW()-INTERVAL '10 days',NOW());

INSERT INTO nexora_social_world.planet_staff(planet_id,account_id,role,permissions,created_at)
VALUES (90001,900002,'MODERATOR','["chat.moderate","player.remove"]'::jsonb,NOW()-INTERVAL '9 days');

INSERT INTO nexora_social_world.planet_members(planet_id,account_id,joined_at)
VALUES (90001,900002,NOW()-INTERVAL '8 days');

INSERT INTO nexora_social_world.planet_chat_messages(planet_key,account_id,nickname,message,created_at)
VALUES ('custom-90001',900001,'LegacyOwner','История чата тоже переносится.',NOW()-INTERVAL '30 minutes');

INSERT INTO nexora_social_world.gifts(from_account_id,to_account_id,gift_type,authority_added,created_at)
VALUES (900001,900002,'rose',5,NOW()-INTERVAL '6 hours');

INSERT INTO nexora_social_world.inventory(account_id,item_code,quantity,metadata)
VALUES (900001,'legacy_crown',3,'{"color":"gold"}'::jsonb);

INSERT INTO nexora_social_world.developer_role_assignments(account_id,role,permissions,assigned_by,created_at,updated_at)
VALUES (900001,'DEVELOPER','["users.view","planets.manage"]'::jsonb,900001,NOW()-INTERVAL '10 days',NOW());

INSERT INTO nexora_social_world.authority_history(account_id,old_title,new_title,source,actor_account_id,reason,created_at)
VALUES (900001,'BEDA','ANGEL','DEVELOPER',900001,'Проверка истории званий.',NOW()-INTERVAL '2 days');

INSERT INTO nexora_social_world.moderation_actions(actor_account_id,target_account_id,action_type,reason,expires_at,created_at)
VALUES (900001,900002,'WARN','Тестовая запись предупреждения.',NULL,NOW()-INTERVAL '1 day');

INSERT INTO nexora_social_world.developer_audit_logs(actor_account_id,target_account_id,action,reason,details,created_at)
VALUES (900001,900002,'legacy.test','Проверка аудита.','{"source":"ci"}'::jsonb,NOW()-INTERVAL '1 day');

INSERT INTO nexora_social_world.account_consents(account_id,age_confirmed_at,personal_data_consent_at,legal_terms_accepted_at,legal_version)
VALUES ('900001',NOW()-INTERVAL '30 days',NOW()-INTERVAL '30 days',NOW()-INTERVAL '30 days','ci-fixture');
