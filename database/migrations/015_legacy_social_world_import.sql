-- Import the isolated Social World accounts into the full NEXORA identity model.
-- The source schema is intentionally retained. This migration is additive and idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_social_account_id BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_recovery_code_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_legacy_social_account_uidx
  ON users(legacy_social_account_id) WHERE legacy_social_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS planet_access (
  planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level VARCHAR(16) NOT NULL CHECK (access_level IN ('member','staff','invited')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (planet_id,user_id)
);
CREATE INDEX IF NOT EXISTS planet_access_user_idx ON planet_access(user_id,planet_id);

CREATE TABLE IF NOT EXISTS planet_bans (
  planet_id UUID NOT NULL REFERENCES planets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(500) NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (planet_id,user_id)
);

CREATE TABLE IF NOT EXISTS legacy_social_character_map (
  legacy_account_id BIGINT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID NOT NULL UNIQUE REFERENCES characters(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS legacy_social_conversation_map (
  legacy_conversation_id BIGINT PRIMARY KEY,
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS legacy_social_inventory (
  legacy_account_id BIGINT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_code VARCHAR(64) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (legacy_account_id,item_code)
);
CREATE TABLE IF NOT EXISTS legacy_social_role_assignments (
  legacy_account_id BIGINT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legacy_role VARCHAR(24) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_by_legacy_account_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $migration$
BEGIN
  IF to_regclass('nexora_social_world.accounts') IS NULL THEN
    RAISE NOTICE 'Legacy Social World schema not found; account import skipped.';
    RETURN;
  END IF;

  -- Keep the existing recovery credentials. New login code accepts both the
  -- original lowercase lookup hash and the old bcrypt-only format.
  EXECUTE $q$
    INSERT INTO users
      (email,username,password_hash,character_code_hash,legacy_social_account_id,
       legacy_recovery_code_hash,role,status,created_at,updated_at)
    SELECT
      NULL,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM users existing
          WHERE LOWER(existing.username)=a.nickname_normalized
            AND existing.legacy_social_account_id IS DISTINCT FROM a.id
        )
        THEN LEFT(a.nickname,GREATEST(1,24-LENGTH('_nx'||a.id::text)))||'_nx'||a.id::text
        ELSE a.nickname
      END,
      NULL,
      a.recovery_code_lookup_hash,
      a.id,
      CASE WHEN a.recovery_code_lookup_hash IS NULL THEN a.recovery_code_hash ELSE NULL END,
      CASE COALESCE(dr.role,'USER')
        WHEN 'DEVELOPER' THEN 'developer'
        WHEN 'ADMIN' THEN 'admin'
        WHEN 'MODERATOR' THEN 'moderator'
        ELSE 'user'
      END,
      CASE WHEN EXISTS (
        SELECT 1 FROM nexora_social_world.moderation_actions ma
        WHERE ma.target_account_id=a.id AND ma.action_type='BAN'
          AND ma.revoked_at IS NULL AND (ma.expires_at IS NULL OR ma.expires_at>NOW())
      ) THEN 'suspended' ELSE 'active' END,
      a.created_at,NOW()
    FROM nexora_social_world.accounts a
    LEFT JOIN nexora_social_world.developer_role_assignments dr ON dr.account_id=a.id
    ON CONFLICT (legacy_social_account_id) DO NOTHING
  $q$;

  -- A stable UUID lets all related legacy rows be imported without changing
  -- the original bigint identifiers in the retained source schema.
  EXECUTE $q$
    INSERT INTO legacy_social_character_map(legacy_account_id,user_id,character_id)
    SELECT a.id,u.id,md5('nexora-legacy-character:'||a.id::text)::uuid
    FROM nexora_social_world.accounts a
    JOIN users u ON u.legacy_social_account_id=a.id
    ON CONFLICT (legacy_account_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO characters
      (id,user_id,name,gender,bio,appearance,level,experience,authority,aura,is_active,created_at,updated_at)
    SELECT
      m.character_id,m.user_id,LEFT(COALESCE(c.nickname,a.nickname),32),
      CASE LOWER(COALESCE(c.avatar->>'spriteGender',''))
        WHEN 'female' THEN 'female' WHEN 'male' THEN 'male' ELSE 'unspecified' END,
      LEFT(COALESCE(c.profile_bio,''),500),
      COALESCE(c.avatar,'{}'::jsonb),
      GREATEST(1,COALESCE(c.level,1)),GREATEST(0,COALESCE(c.experience,0)),
      GREATEST(0,COALESCE(c.authority,0)),
      CASE COALESCE(c.authority_title,'NOVICE')
        WHEN 'BEDA' THEN 'angel' WHEN 'PAPA' THEN 'god'
        WHEN 'ANGEL' THEN 'almighty' WHEN 'CREATOR' THEN 'legend'
        ELSE CASE WHEN COALESCE(c.aura_enabled,FALSE) THEN 'angel' ELSE 'none' END
      END,
      TRUE,COALESCE(c.updated_at,a.created_at),COALESCE(c.updated_at,a.created_at)
    FROM nexora_social_world.accounts a
    JOIN legacy_social_character_map m ON m.legacy_account_id=a.id
    LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
    WHERE NOT EXISTS (SELECT 1 FROM characters existing WHERE existing.user_id=m.user_id)
    ON CONFLICT (id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO profiles(user_id,display_name,bio)
    SELECT u.id,LEFT(COALESCE(c.nickname,a.nickname),32),LEFT(COALESCE(c.profile_bio,''),500)
    FROM nexora_social_world.accounts a
    JOIN users u ON u.legacy_social_account_id=a.id
    LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
    ON CONFLICT (user_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO reputation(user_id,authority,popularity,reputation_score,experience,level)
    SELECT u.id,GREATEST(0,COALESCE(c.authority,0)),0,GREATEST(0,COALESCE(c.authority,0)),
           GREATEST(0,COALESCE(c.experience,0)),GREATEST(1,COALESCE(c.level,1))
    FROM nexora_social_world.accounts a
    JOIN users u ON u.legacy_social_account_id=a.id
    LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
    ON CONFLICT (user_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO wallet_balances(user_id,coins,diamonds)
    SELECT u.id,GREATEST(0,COALESCE(w.balance,0)),0
    FROM nexora_social_world.accounts a
    JOIN users u ON u.legacy_social_account_id=a.id
    LEFT JOIN nexora_social_world.wallets w ON w.account_id=a.id
    ON CONFLICT (user_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO wallet_ledger(user_id,currency,amount,reason)
    SELECT u.id,'coins',w.balance,'Перенос баланса из предыдущей версии NEXORA'
    FROM nexora_social_world.wallets w
    JOIN users u ON u.legacy_social_account_id=w.account_id
    WHERE w.balance>0
      AND NOT EXISTS (
        SELECT 1 FROM wallet_ledger l
        WHERE l.user_id=u.id AND l.reason='Перенос баланса из предыдущей версии NEXORA'
      )
  $q$;

  -- Public aliases preserve the three original prototype locations without
  -- turning the existing paid planets into free destinations.
  INSERT INTO planets(slug,name,description,access_type,ticket_price,settings)
  VALUES
    ('legacy-club','Клуб','Перенесённая общественная локация.','public',0,'{"theme":"club","legacy":true}'::jsonb),
    ('legacy-beach','Пляж','Перенесённая общественная локация.','public',0,'{"theme":"beach","legacy":true}'::jsonb)
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO rooms(planet_id,slug,name,description,capacity)
  SELECT p.id,'central-hall','Главная комната',p.description,60
  FROM planets p WHERE p.slug IN ('legacy-club','legacy-beach')
  ON CONFLICT (planet_id,slug) DO NOTHING;

  EXECUTE $q$
    INSERT INTO planets(slug,name,description,access_type,ticket_price,is_active,settings,owner_user_id)
    SELECT
      'custom-'||cp.id::text,cp.name,cp.description,
      CASE WHEN cp.access_mode='public' THEN 'public' ELSE 'vip' END,
      0,(cp.status='active'),
      jsonb_build_object(
        'theme',cp.theme,'accent_color',cp.accent_color,
        'legacy_access_mode',cp.access_mode,'capacity',cp.capacity,
        'welcome_message',cp.welcome_message,'legacy_planet_id',cp.id
      )||COALESCE(ps.settings,'{}'::jsonb),
      u.id
    FROM nexora_social_world.custom_planets cp
    JOIN users u ON u.legacy_social_account_id=cp.owner_account_id
    LEFT JOIN nexora_social_world.planet_settings ps ON ps.planet_id=cp.id
    ON CONFLICT (slug) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO rooms(planet_id,slug,name,description,capacity)
    SELECT p.id,'central-hall','Главная комната',LEFT(COALESCE(cp.welcome_message,cp.description,''),300),
           GREATEST(2,LEAST(500,cp.capacity))
    FROM nexora_social_world.custom_planets cp
    JOIN planets p ON p.slug='custom-'||cp.id::text
    ON CONFLICT (planet_id,slug) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO planet_access(planet_id,user_id,access_level,permissions,created_at)
    SELECT p.id,u.id,'member','[]'::jsonb,pm.joined_at
    FROM nexora_social_world.planet_members pm
    JOIN planets p ON p.slug='custom-'||pm.planet_id::text
    JOIN users u ON u.legacy_social_account_id=pm.account_id
    ON CONFLICT (planet_id,user_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO planet_access(planet_id,user_id,access_level,permissions,created_at)
    SELECT p.id,u.id,'staff',COALESCE(ps.permissions,'[]'::jsonb),ps.created_at
    FROM nexora_social_world.planet_staff ps
    JOIN planets p ON p.slug='custom-'||ps.planet_id::text
    JOIN users u ON u.legacy_social_account_id=ps.account_id
    ON CONFLICT (planet_id,user_id) DO UPDATE SET
      access_level='staff',permissions=EXCLUDED.permissions
  $q$;

  EXECUTE $q$
    INSERT INTO planet_access(planet_id,user_id,access_level,permissions,expires_at,created_at)
    SELECT p.id,u.id,'invited','[]'::jsonb,pi.expires_at,pi.created_at
    FROM nexora_social_world.planet_invites pi
    JOIN planets p ON p.slug='custom-'||pi.planet_id::text
    JOIN users u ON u.legacy_social_account_id=pi.invited_account_id
    WHERE pi.used_at IS NULL AND pi.expires_at>NOW()
    ON CONFLICT (planet_id,user_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO planet_bans(planet_id,user_id,reason,expires_at,created_at)
    SELECT p.id,u.id,pb.reason,pb.expires_at,pb.created_at
    FROM nexora_social_world.planet_bans pb
    JOIN planets p ON p.slug='custom-'||pb.planet_id::text
    JOIN users u ON u.legacy_social_account_id=pb.account_id
    ON CONFLICT (planet_id,user_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO user_locations(user_id,planet_id,arrived_at)
    SELECT u.id,COALESCE(destination.id,starter.id),COALESCE(c.updated_at,NOW())
    FROM nexora_social_world.accounts a
    JOIN users u ON u.legacy_social_account_id=a.id
    LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
    JOIN planets starter ON starter.slug='newbies-1'
    LEFT JOIN planets destination ON destination.slug=CASE COALESCE(c.planet,'starter')
      WHEN 'starter' THEN 'newbies-1' WHEN 'club' THEN 'legacy-club'
      WHEN 'beach' THEN 'legacy-beach' ELSE c.planet END
    LEFT JOIN planet_bans active_ban ON active_ban.planet_id=destination.id AND active_ban.user_id=u.id
      AND (active_ban.expires_at IS NULL OR active_ban.expires_at>NOW())
    WHERE active_ban.user_id IS NULL
    ON CONFLICT (user_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO friendships(requester_id,addressee_id,status,created_at)
    SELECT u1.id,u2.id,'accepted',MIN(f.created_at)
    FROM (
      SELECT LEAST(account_id,friend_account_id) AS a, GREATEST(account_id,friend_account_id) AS b, MIN(created_at) AS created_at
      FROM nexora_social_world.friends GROUP BY 1,2
    ) f
    JOIN users u1 ON u1.legacy_social_account_id=f.a
    JOIN users u2 ON u2.legacy_social_account_id=f.b
    WHERE f.a<>f.b
    GROUP BY u1.id,u2.id
    ON CONFLICT (requester_id,addressee_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO friendships(requester_id,addressee_id,status,created_at)
    SELECT u1.id,u2.id,
      CASE WHEN fr.status='pending' THEN 'pending' ELSE 'rejected' END,fr.created_at
    FROM nexora_social_world.friend_requests fr
    JOIN users u1 ON u1.legacy_social_account_id=fr.from_account_id
    JOIN users u2 ON u2.legacy_social_account_id=fr.to_account_id
    WHERE fr.status IN ('pending','declined','cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM friendships existing
        WHERE existing.requester_id=u1.id AND existing.addressee_id=u2.id
      )
    ON CONFLICT (requester_id,addressee_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO blocks(blocker_id,blocked_id,created_at)
    SELECT u1.id,u2.id,b.created_at
    FROM nexora_social_world.user_blocks b
    JOIN users u1 ON u1.legacy_social_account_id=b.account_id
    JOIN users u2 ON u2.legacy_social_account_id=b.blocked_account_id
    ON CONFLICT (blocker_id,blocked_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO legacy_social_conversation_map(legacy_conversation_id,conversation_id)
    SELECT c.id,md5('nexora-legacy-conversation:'||c.id::text)::uuid
    FROM nexora_social_world.conversations c
    ON CONFLICT (legacy_conversation_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO conversations(id,created_at)
    SELECT m.conversation_id,c.created_at
    FROM nexora_social_world.conversations c
    JOIN legacy_social_conversation_map m ON m.legacy_conversation_id=c.id
    ON CONFLICT (id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO conversation_members(conversation_id,user_id,joined_at)
    SELECT m.conversation_id,u.id,c.created_at
    FROM nexora_social_world.conversations c
    JOIN legacy_social_conversation_map m ON m.legacy_conversation_id=c.id
    JOIN users u ON u.legacy_social_account_id=c.participant_a
    UNION
    SELECT m.conversation_id,u.id,c.created_at
    FROM nexora_social_world.conversations c
    JOIN legacy_social_conversation_map m ON m.legacy_conversation_id=c.id
    JOIN users u ON u.legacy_social_account_id=c.participant_b
    ON CONFLICT (conversation_id,user_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO messages(id,conversation_id,sender_id,body,created_at,read_at)
    SELECT md5('nexora-legacy-dm:'||dm.id::text)::uuid,m.conversation_id,u.id,dm.body,dm.created_at,dm.read_at
    FROM nexora_social_world.direct_messages dm
    JOIN legacy_social_conversation_map m ON m.legacy_conversation_id=dm.conversation_id
    JOIN users u ON u.legacy_social_account_id=dm.sender_account_id
    ON CONFLICT (id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO notifications(id,user_id,actor_user_id,kind,title,body,data,read_at,created_at)
    SELECT md5('nexora-legacy-notification:'||n.id::text)::uuid,u.id,actor.id,
      LEFT(n.type,40),COALESCE(NULLIF(n.payload->>'title',''),'Уведомление'),
      LEFT(COALESCE(n.payload->>'body',''),500),COALESCE(n.payload,'{}'::jsonb),n.read_at,n.created_at
    FROM nexora_social_world.notifications n
    JOIN users u ON u.legacy_social_account_id=n.account_id
    LEFT JOIN users actor ON actor.legacy_social_account_id=n.actor_account_id
    ON CONFLICT (id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO room_messages(id,room_id,user_id,character_id,body,created_at)
    SELECT md5('nexora-legacy-planet-chat:'||m.id::text)::uuid,
      (SELECT rm.id FROM rooms rm WHERE rm.planet_id=p.id AND rm.is_active=TRUE ORDER BY rm.created_at LIMIT 1),
      u.id,cm.character_id,LEFT(m.message,1000),m.created_at
    FROM nexora_social_world.planet_chat_messages m
    JOIN users u ON u.legacy_social_account_id=m.account_id
    JOIN planets p ON p.slug=CASE m.planet_key
      WHEN 'starter' THEN 'newbies-1' WHEN 'club' THEN 'legacy-club'
      WHEN 'beach' THEN 'legacy-beach' ELSE m.planet_key END
    LEFT JOIN legacy_social_character_map cm ON cm.legacy_account_id=m.account_id
    WHERE EXISTS (SELECT 1 FROM rooms rm WHERE rm.planet_id=p.id AND rm.is_active=TRUE)
    ON CONFLICT (id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO room_messages(id,room_id,user_id,character_id,body,created_at)
    SELECT md5('nexora-legacy-message:'||m.id::text)::uuid,
      (SELECT rm.id FROM rooms rm WHERE rm.planet_id=p.id AND rm.is_active=TRUE ORDER BY rm.created_at LIMIT 1),
      u.id,cm.character_id,LEFT(m.message_text,1000),m.created_at
    FROM nexora_social_world.messages m
    JOIN users u ON u.legacy_social_account_id=m.account_id
    JOIN planets p ON p.slug=CASE m.planet
      WHEN 'starter' THEN 'newbies-1' WHEN 'club' THEN 'legacy-club'
      WHEN 'beach' THEN 'legacy-beach' ELSE m.planet END
    LEFT JOIN legacy_social_character_map cm ON cm.legacy_account_id=m.account_id
    WHERE EXISTS (SELECT 1 FROM rooms rm WHERE rm.planet_id=p.id AND rm.is_active=TRUE)
    ON CONFLICT (id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO avatar_items(slug,name,description,category,rarity,price_coins,price_diamonds,is_active)
    SELECT DISTINCT
      'legacy-gift-'||SUBSTRING(md5(gift_type),1,16),LEFT(gift_type,100),
      'Подарок, перенесённый из предыдущей версии NEXORA.',
      'accessory','common',0,0,FALSE
    FROM nexora_social_world.gifts
    ON CONFLICT (slug) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO gifts(id,sender_user_id,receiver_user_id,item_id,message,idempotency_key,created_at)
    SELECT md5('nexora-legacy-gift-id:'||g.id::text)::uuid,
      sender.id,receiver.id,item.id,'Подарок из предыдущей версии NEXORA.',
      md5('nexora-legacy-gift-key:'||g.id::text)::uuid,g.created_at
    FROM nexora_social_world.gifts g
    JOIN users receiver ON receiver.legacy_social_account_id=g.to_account_id
    JOIN users sender ON sender.legacy_social_account_id=g.from_account_id
    JOIN avatar_items item ON item.slug='legacy-gift-'||SUBSTRING(md5(g.gift_type),1,16)
    WHERE sender.id<>receiver.id
    ON CONFLICT (idempotency_key) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO legacy_social_inventory(legacy_account_id,user_id,item_code,quantity,metadata)
    SELECT i.account_id,u.id,i.item_code,i.quantity,i.metadata
    FROM nexora_social_world.inventory i
    JOIN users u ON u.legacy_social_account_id=i.account_id
    ON CONFLICT (legacy_account_id,item_code) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO legacy_social_role_assignments(legacy_account_id,user_id,legacy_role,permissions,assigned_by_legacy_account_id,created_at,updated_at)
    SELECT dr.account_id,u.id,dr.role,dr.permissions,dr.assigned_by,dr.created_at,dr.updated_at
    FROM nexora_social_world.developer_role_assignments dr
    JOIN users u ON u.legacy_social_account_id=dr.account_id
    ON CONFLICT (legacy_account_id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO moderation_actions(id,moderator_id,target_user_id,action,reason,ends_at,created_at)
    SELECT md5('nexora-legacy-moderation:'||ma.id::text)::uuid,
      actor.id,target.id,
      CASE ma.action_type WHEN 'BAN' THEN 'suspend' ELSE 'warn' END,
      LEFT(ma.reason,500),ma.expires_at,ma.created_at
    FROM nexora_social_world.moderation_actions ma
    JOIN users target ON target.legacy_social_account_id=ma.target_account_id
    JOIN users actor ON actor.legacy_social_account_id=ma.actor_account_id
    ON CONFLICT (id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO admin_logs(id,admin_user_id,action,target_type,target_id,details,created_at)
    SELECT md5('nexora-legacy-admin-log:'||l.id::text)::uuid,actor.id,
      LEFT(l.action,80),'legacy_account',NULL,
      jsonb_build_object('targetLegacyAccountId',l.target_account_id,'reason',l.reason,'details',l.details),
      l.created_at
    FROM nexora_social_world.developer_audit_logs l
    JOIN users actor ON actor.legacy_social_account_id=l.actor_account_id
    ON CONFLICT (id) DO NOTHING
  $q$;

  EXECUTE $q$
    INSERT INTO reputation_events(user_id,event_type,authority_delta,metadata,created_at)
    SELECT u.id,'legacy_title_change',0,
      jsonb_build_object('oldTitle',h.old_title,'newTitle',h.new_title,'source',h.source,'reason',h.reason),
      h.created_at
    FROM nexora_social_world.authority_history h
    JOIN users u ON u.legacy_social_account_id=h.account_id
  $q$;

  RAISE NOTICE 'Legacy Social World accounts and supported data imported. Original schema retained.';
END
$migration$;
