begin;

create extension if not exists pgcrypto;

create schema if not exists aura_private;
revoke all on schema aura_private from public, anon, authenticated;

create table if not exists public.clinics (
  id text primary key,
  name text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED')),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.clinics (id, name, is_internal)
values
  ('AURA-INTERNAL-TEST', 'Aura EyeGym 內部測試', true),
  ('AURA-VIP', 'Aura EyeGym VIP', true)
on conflict (id) do nothing;

-- The owner confirmed that every pre-migration row is personal test data.
-- Keep it, but isolate it from all future clinic tenants.
update public.activation_codes
set clinic_id = 'AURA-INTERNAL-TEST';

update public.patients_mapping
set clinic_id = 'AURA-INTERNAL-TEST';

update public.training_logs
set clinic_id = 'AURA-INTERNAL-TEST';

alter table public.activation_codes
  alter column status set default 'AVAILABLE';

update public.activation_codes
set status = 'AVAILABLE'
where status is null or status not in ('AVAILABLE', 'ACTIVE', 'USED', 'EXPIRED');

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id text not null references public.clinics(id) on delete cascade,
  role text not null default 'STAFF'
    check (role in ('ADMIN', 'STAFF', 'VIEWER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, clinic_id)
);

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  clinic_id text not null references public.clinics(id),
  label text not null,
  code_hash bytea not null unique,
  code_last4 text not null,
  code_type text not null default 'CLINIC'
    check (code_type in ('CLINIC', 'VIP')),
  entitlement_level text not null default 'FULL'
    check (entitlement_level in ('STANDARD', 'FULL', 'VIP')),
  max_active_users integer not null default 1
    check (max_active_users between 1 and 100000),
  expires_at timestamptz,
  is_enabled boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.access_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.access_codes(id) on delete restrict,
  line_uid text not null,
  real_name text not null,
  clinic_id text not null references public.clinics(id),
  redeemed_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);

create unique index if not exists access_code_redemptions_one_active_per_user
  on public.access_code_redemptions (line_uid)
  where revoked_at is null;

create unique index if not exists access_code_redemptions_one_active_per_code_user
  on public.access_code_redemptions (code_id, line_uid)
  where revoked_at is null;

create index if not exists access_code_redemptions_code_active_idx
  on public.access_code_redemptions (code_id, revoked_at);

alter table public.patients_mapping
  add column if not exists access_code_id uuid references public.access_codes(id),
  add column if not exists redemption_id uuid references public.access_code_redemptions(id),
  add column if not exists entitlement_level text not null default 'STANDARD',
  add column if not exists revoked_at timestamptz;

alter table public.training_logs
  add column if not exists event_id uuid,
  add column if not exists access_code_id uuid references public.access_codes(id),
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists signature_version text;

update public.training_logs
set event_id = gen_random_uuid()
where event_id is null;

update public.training_logs
set signature_version = 'legacy-client-v1'
where signature_version is null;

alter table public.training_logs
  alter column event_id set default gen_random_uuid(),
  alter column event_id set not null,
  alter column signature_version set default 'server-v2',
  alter column signature_version set not null;

create unique index if not exists training_logs_event_id_key
  on public.training_logs (event_id);

create index if not exists training_logs_clinic_created_idx
  on public.training_logs (clinic_id, created_at desc);

create index if not exists training_logs_line_created_idx
  on public.training_logs (line_uid, created_at desc);

create index if not exists training_logs_line_sequence_idx
  on public.training_logs (line_uid, sequence_id desc);

create table if not exists aura_private.app_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

insert into aura_private.app_secrets (name, value)
values ('training_log_hmac_v2', encode(gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function aura_private.normalize_access_code(p_code text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select upper(regexp_replace(btrim(p_code), '\s+', '', 'g'));
$$;

create or replace function aura_private.hash_access_code(p_code text)
returns bytea
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select digest(aura_private.normalize_access_code(p_code), 'sha256');
$$;

insert into public.access_codes (
  clinic_id,
  label,
  code_hash,
  code_last4,
  code_type,
  entitlement_level,
  max_active_users,
  expires_at,
  is_enabled,
  created_at
)
select
  legacy.clinic_id,
  '舊版授權碼 …' || right(legacy.code, 4),
  aura_private.hash_access_code(legacy.code),
  right(legacy.code, 4),
  'CLINIC',
  'FULL',
  1,
  legacy.expires_at,
  legacy.status in ('AVAILABLE', 'ACTIVE', 'USED')
    and (legacy.expires_at is null or legacy.expires_at > now()),
  coalesce(legacy.created_at, now())
from public.activation_codes legacy
on conflict (code_hash) do nothing;

insert into public.access_code_redemptions (
  code_id,
  line_uid,
  real_name,
  clinic_id,
  redeemed_at
)
select
  access_code.id,
  mapping.line_uid,
  mapping.real_name,
  mapping.clinic_id,
  coalesce(mapping.created_at, now())
from public.patients_mapping mapping
join public.activation_codes legacy
  on legacy.code = mapping.activation_code
join public.access_codes access_code
  on access_code.code_hash = aura_private.hash_access_code(legacy.code)
on conflict do nothing;

update public.patients_mapping mapping
set
  access_code_id = redemption.code_id,
  redemption_id = redemption.id,
  entitlement_level = access_code.entitlement_level
from public.access_code_redemptions redemption
join public.access_codes access_code on access_code.id = redemption.code_id
where redemption.line_uid = mapping.line_uid
  and redemption.revoked_at is null;

update public.training_logs logs
set access_code_id = mapping.access_code_id
from public.patients_mapping mapping
where mapping.line_uid = logs.line_uid
  and logs.access_code_id is null;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.platform_admins admins
    where admins.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_clinic(p_clinic_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.clinic_members members
      where members.user_id = auth.uid()
        and members.clinic_id = p_clinic_id
        and members.is_active
    );
$$;

create or replace function public.can_manage_clinic(p_clinic_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.clinic_members members
      where members.user_id = auth.uid()
        and members.clinic_id = p_clinic_id
        and members.role = 'ADMIN'
        and members.is_active
    );
$$;

create or replace function aura_private.canonical_training_log(p_log public.training_logs)
returns text
language sql
stable
security definer
set search_path = public, aura_private, pg_catalog
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'event_id', p_log.event_id,
    'session_id', p_log.session_id,
    'sequence_id', p_log.sequence_id,
    'previous_hash', p_log.previous_hash,
    'line_uid', p_log.line_uid,
    'access_code_id', p_log.access_code_id,
    'clinic_id', p_log.clinic_id,
    'real_name', p_log.real_name,
    'device_info', p_log.device_info,
    'training_context', p_log.training_context,
    'performance_metrics', p_log.performance_metrics,
    'objective_metrics', p_log.objective_metrics,
    'state_machine_details', p_log.state_machine_details,
    'created_at', p_log.created_at
  ))::text;
$$;

create or replace function aura_private.sign_training_log()
returns trigger
language plpgsql
security definer
set search_path = public, aura_private, pg_catalog
as $$
declare
  signing_key text;
begin
  if new.signature_version = 'server-v2' then
    select value into signing_key
    from aura_private.app_secrets
    where name = 'training_log_hmac_v2';

    if signing_key is null then
      raise exception '伺服器簽章金鑰尚未初始化';
    end if;

    new.digital_signature := encode(
      hmac(aura_private.canonical_training_log(new), signing_key, 'sha256'),
      'hex'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists training_logs_server_signature on public.training_logs;
create trigger training_logs_server_signature
before insert or update on public.training_logs
for each row execute function aura_private.sign_training_log();

create or replace function public.training_log_integrity(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, aura_private, pg_catalog
as $$
declare
  log_row public.training_logs%rowtype;
  signing_key text;
  expected_signature text;
begin
  select * into log_row
  from public.training_logs
  where id = p_id;

  if not found then
    return 'MISSING';
  end if;

  if auth.uid() is not null and not public.can_access_clinic(log_row.clinic_id) then
    raise exception '沒有讀取此訓練紀錄的權限';
  end if;

  if log_row.signature_version <> 'server-v2' then
    return 'LEGACY';
  end if;

  select value into signing_key
  from aura_private.app_secrets
  where name = 'training_log_hmac_v2';

  expected_signature := encode(
    hmac(aura_private.canonical_training_log(log_row), signing_key, 'sha256'),
    'hex'
  );

  if expected_signature = log_row.digital_signature then
    return 'VERIFIED';
  end if;
  return 'TAMPERED';
end;
$$;

create or replace function public.redeem_access_code(
  p_code text,
  p_line_uid text,
  p_real_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, aura_private, pg_catalog
as $$
declare
  selected_code public.access_codes%rowtype;
  existing_redemption public.access_code_redemptions%rowtype;
  new_redemption public.access_code_redemptions%rowtype;
  active_count integer;
begin
  if p_line_uid is null or length(btrim(p_line_uid)) < 8 then
    raise exception '請先完成 LINE 登入，再兌換授權碼';
  end if;

  if p_real_name is null or btrim(p_real_name) = '' then
    raise exception '無法取得 LINE 顯示名稱';
  end if;

  select * into selected_code
  from public.access_codes
  where code_hash = aura_private.hash_access_code(p_code)
  for update;

  if not found or not selected_code.is_enabled then
    raise exception '授權碼不存在或已停用';
  end if;

  if selected_code.expires_at is not null and selected_code.expires_at <= now() then
    raise exception '授權碼已過期';
  end if;

  select * into existing_redemption
  from public.access_code_redemptions
  where code_id = selected_code.id
    and line_uid = p_line_uid
    and revoked_at is null;

  if found then
    if inserted_log.line_uid is distinct from btrim(p_line_uid) then
      raise exception '訓練事件識別碼已被其他使用者使用';
    end if;
    return jsonb_build_object(
      'ok', true,
      'already_redeemed', true,
      'redemption_id', existing_redemption.id,
      'clinic_id', existing_redemption.clinic_id,
      'entitlement_level', selected_code.entitlement_level,
      'code_type', selected_code.code_type
    );
  end if;

  if exists (
    select 1
    from public.access_code_redemptions
    where line_uid = p_line_uid and revoked_at is null
  ) then
    raise exception '此 LINE 帳號已有有效授權；如需轉換方案，請聯絡管理者';
  end if;

  select count(*) into active_count
  from public.access_code_redemptions
  where code_id = selected_code.id and revoked_at is null;

  if active_count >= selected_code.max_active_users then
    raise exception '此授權碼的可用名額已滿';
  end if;

  insert into public.access_code_redemptions (
    code_id, line_uid, real_name, clinic_id
  ) values (
    selected_code.id,
    btrim(p_line_uid),
    left(btrim(p_real_name), 120),
    selected_code.clinic_id
  )
  returning * into new_redemption;

  insert into public.patients_mapping (
    line_uid,
    clinic_id,
    real_name,
    activation_code,
    bound_at,
    access_code_id,
    redemption_id,
    entitlement_level,
    revoked_at
  ) values (
    btrim(p_line_uid),
    selected_code.clinic_id,
    left(btrim(p_real_name), 120),
    '••••' || selected_code.code_last4,
    now()::text,
    selected_code.id,
    new_redemption.id,
    selected_code.entitlement_level,
    null
  )
  on conflict (line_uid) do update set
    clinic_id = excluded.clinic_id,
    real_name = excluded.real_name,
    activation_code = excluded.activation_code,
    bound_at = excluded.bound_at,
    access_code_id = excluded.access_code_id,
    redemption_id = excluded.redemption_id,
    entitlement_level = excluded.entitlement_level,
    revoked_at = null;

  return jsonb_build_object(
    'ok', true,
    'already_redeemed', false,
    'redemption_id', new_redemption.id,
    'clinic_id', selected_code.clinic_id,
    'entitlement_level', selected_code.entitlement_level,
    'code_type', selected_code.code_type
  );
end;
$$;

create or replace function public.get_active_entitlement(p_line_uid text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'ok', true,
    'redemption_id', redemption.id,
    'clinic_id', redemption.clinic_id,
    'entitlement_level', access_code.entitlement_level,
    'code_type', access_code.code_type
  )
  from public.access_code_redemptions redemption
  join public.access_codes access_code on access_code.id = redemption.code_id
  where redemption.line_uid = p_line_uid
    and redemption.revoked_at is null
    and access_code.is_enabled
    and (access_code.expires_at is null or access_code.expires_at > now())
  order by redemption.redeemed_at desc
  limit 1;
$$;

create or replace function public.append_training_log(
  p_line_uid text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, aura_private, pg_catalog
as $$
declare
  mapping public.patients_mapping%rowtype;
  access_code public.access_codes%rowtype;
  event_uuid uuid;
  session_value text;
  occurred_at timestamptz;
  next_sequence integer;
  previous_signature text;
  inserted_log public.training_logs%rowtype;
begin
  if p_line_uid is null or length(btrim(p_line_uid)) < 8 then
    raise exception '缺少有效的 LINE 使用者識別';
  end if;

  select * into mapping
  from public.patients_mapping
  where line_uid = p_line_uid and revoked_at is null;

  if not found or mapping.access_code_id is null then
    raise exception '使用者尚未取得有效授權';
  end if;

  select * into access_code
  from public.access_codes
  where id = mapping.access_code_id
    and is_enabled
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception '使用者授權已停用或過期';
  end if;

  begin
    event_uuid := (p_payload ->> 'event_id')::uuid;
  exception when others then
    raise exception '訓練事件識別碼格式錯誤';
  end;

  select * into inserted_log
  from public.training_logs
  where event_id = event_uuid;

  if found then
    if inserted_log.line_uid is distinct from btrim(p_line_uid) then
      raise exception '訓練事件識別碼已被其他使用者使用';
    end if;
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'id', inserted_log.id,
      'sequence_id', inserted_log.sequence_id,
      'server_signature', inserted_log.digital_signature
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(btrim(p_line_uid), 0));

  select * into inserted_log
  from public.training_logs
  where event_id = event_uuid;

  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'id', inserted_log.id,
      'sequence_id', inserted_log.sequence_id,
      'server_signature', inserted_log.digital_signature
    );
  end if;

  select coalesce(max(sequence_id), 0) + 1
  into next_sequence
  from public.training_logs
  where line_uid = p_line_uid;

  select digital_signature
  into previous_signature
  from public.training_logs
  where line_uid = p_line_uid
  order by sequence_id desc nulls last, received_at desc
  limit 1;

  previous_signature := coalesce(
    previous_signature,
    'GENESIS_HASH_00000000000000000000'
  );

  session_value := coalesce(nullif(p_payload ->> 'session_id', ''), event_uuid::text);

  begin
    occurred_at := (p_payload ->> 'occurred_at')::timestamptz;
  exception when others then
    occurred_at := now();
  end;

  if occurred_at > now() + interval '5 minutes'
     or occurred_at < now() - interval '90 days' then
    occurred_at := now();
  end if;

  insert into public.training_logs (
    event_id,
    session_id,
    sequence_id,
    previous_hash,
    line_uid,
    auth_code,
    clinic_id,
    real_name,
    device_info,
    training_context,
    performance_metrics,
    objective_metrics,
    state_machine_details,
    digital_signature,
    created_at,
    received_at,
    signature_version,
    access_code_id
  ) values (
    event_uuid,
    session_value,
    next_sequence,
    previous_signature,
    mapping.line_uid,
    access_code.label,
    mapping.clinic_id,
    mapping.real_name,
    coalesce(p_payload -> 'device_info', '{}'::jsonb),
    coalesce(p_payload -> 'training_context', '{}'::jsonb),
    coalesce(p_payload -> 'performance_metrics', '{}'::jsonb),
    coalesce(p_payload -> 'objective_metrics', '{}'::jsonb),
    coalesce(p_payload -> 'state_machine_details', '{}'::jsonb),
    '',
    occurred_at,
    now(),
    'server-v2',
    access_code.id
  )
  returning * into inserted_log;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'id', inserted_log.id,
    'sequence_id', inserted_log.sequence_id,
    'server_signature', inserted_log.digital_signature
  );
end;
$$;

create or replace function public.issue_access_code(
  p_clinic_id text,
  p_label text,
  p_code_type text default 'CLINIC',
  p_max_active_users integer default 1,
  p_expires_at timestamptz default null
)
returns table (
  access_code text,
  code_id uuid,
  expires_at timestamptz,
  max_active_users integer
)
language plpgsql
security definer
set search_path = public, aura_private, pg_catalog
as $$
declare
  raw_code text;
  normalized_type text := upper(p_code_type);
  inserted_code public.access_codes%rowtype;
begin
  if normalized_type not in ('CLINIC', 'VIP') then
    raise exception '不支援的授權碼類型';
  end if;

  if p_max_active_users < 1 or p_max_active_users > 100000 then
    raise exception '授權人數必須介於 1 到 100000';
  end if;

  if normalized_type = 'VIP' then
    if not public.is_platform_admin() or p_clinic_id <> 'AURA-VIP' then
      raise exception '只有平台管理員能建立 VIP 授權碼';
    end if;
  elsif not public.can_manage_clinic(p_clinic_id) then
    raise exception '沒有管理此診所授權碼的權限';
  end if;

  raw_code := 'AURA-' || normalized_type || '-' || upper(encode(gen_random_bytes(8), 'hex'));

  insert into public.access_codes (
    clinic_id,
    label,
    code_hash,
    code_last4,
    code_type,
    entitlement_level,
    max_active_users,
    expires_at,
    created_by
  ) values (
    p_clinic_id,
    left(coalesce(nullif(btrim(p_label), ''), normalized_type || ' 授權'), 120),
    aura_private.hash_access_code(raw_code),
    right(raw_code, 4),
    normalized_type,
    case when normalized_type = 'VIP' then 'VIP' else 'FULL' end,
    p_max_active_users,
    p_expires_at,
    auth.uid()
  )
  returning * into inserted_code;

  return query select
    raw_code,
    inserted_code.id,
    inserted_code.expires_at,
    inserted_code.max_active_users;
end;
$$;

create or replace function public.revoke_access_redemption(p_redemption_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  selected_redemption public.access_code_redemptions%rowtype;
begin
  select * into selected_redemption
  from public.access_code_redemptions
  where id = p_redemption_id
  for update;

  if not found then
    return false;
  end if;

  if not public.can_manage_clinic(selected_redemption.clinic_id) then
    raise exception '沒有撤銷此授權的權限';
  end if;

  update public.access_code_redemptions
  set revoked_at = now(), revoked_by = auth.uid()
  where id = p_redemption_id and revoked_at is null;

  update public.patients_mapping
  set revoked_at = now()
  where redemption_id = p_redemption_id;

  return true;
end;
$$;

create or replace function aura_private.bootstrap_platform_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  selected_user uuid;
begin
  select id into selected_user
  from auth.users
  where lower(email) = lower(btrim(p_email));

  if selected_user is null then
    raise exception '找不到此 Email 的 Supabase Auth 使用者';
  end if;

  insert into public.platform_admins (user_id)
  values (selected_user)
  on conflict (user_id) do nothing;

  return selected_user;
end;
$$;

create or replace function aura_private.bootstrap_clinic_admin(
  p_email text,
  p_clinic_id text,
  p_clinic_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  selected_user uuid;
  normalized_clinic_id text := upper(btrim(p_clinic_id));
begin
  if normalized_clinic_id = '' then
    raise exception '診所代碼不可空白';
  end if;

  select id into selected_user
  from auth.users
  where lower(email) = lower(btrim(p_email));

  if selected_user is null then
    raise exception '找不到此 Email 的 Supabase Auth 使用者';
  end if;

  insert into public.clinics (id, name)
  values (
    normalized_clinic_id,
    left(coalesce(nullif(btrim(p_clinic_name), ''), normalized_clinic_id), 120)
  )
  on conflict (id) do update set name = excluded.name;

  insert into public.clinic_members (user_id, clinic_id, role, is_active)
  values (selected_user, normalized_clinic_id, 'ADMIN', true)
  on conflict (user_id, clinic_id) do update set
    role = 'ADMIN',
    is_active = true;

  return selected_user;
end;
$$;

create or replace function aura_private.bootstrap_vip_code(
  p_label text default '重要親友終身授權',
  p_max_active_users integer default 10
)
returns table (
  access_code text,
  code_id uuid,
  max_active_users integer
)
language plpgsql
security definer
set search_path = public, aura_private, pg_catalog
as $$
declare
  raw_code text;
  inserted_code public.access_codes%rowtype;
begin
  if p_max_active_users < 1 or p_max_active_users > 100 then
    raise exception 'VIP 授權人數必須介於 1 到 100';
  end if;

  raw_code := 'AURA-VIP-' || upper(encode(gen_random_bytes(8), 'hex'));

  insert into public.access_codes (
    clinic_id,
    label,
    code_hash,
    code_last4,
    code_type,
    entitlement_level,
    max_active_users,
    expires_at,
    is_enabled
  ) values (
    'AURA-VIP',
    left(coalesce(nullif(btrim(p_label), ''), '重要親友終身授權'), 120),
    aura_private.hash_access_code(raw_code),
    right(raw_code, 4),
    'VIP',
    'VIP',
    p_max_active_users,
    null,
    true
  )
  returning * into inserted_code;

  return query select raw_code, inserted_code.id, inserted_code.max_active_users;
end;
$$;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'activation_codes',
        'patients_mapping',
        'training_logs',
        'clinics',
        'clinic_members',
        'platform_admins',
        'access_codes',
        'access_code_redemptions'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$$;

alter table public.activation_codes enable row level security;
alter table public.patients_mapping enable row level security;
alter table public.training_logs enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.access_codes enable row level security;
alter table public.access_code_redemptions enable row level security;

create policy activation_codes_platform_admin_select
on public.activation_codes for select to authenticated
using (public.is_platform_admin());

create policy patients_mapping_staff_select
on public.patients_mapping for select to authenticated
using (public.can_access_clinic(clinic_id));

create policy training_logs_staff_select
on public.training_logs for select to authenticated
using (public.can_access_clinic(clinic_id));

create policy clinics_staff_select
on public.clinics for select to authenticated
using (public.can_access_clinic(id));

create policy clinic_members_self_select
on public.clinic_members for select to authenticated
using (user_id = auth.uid() or public.is_platform_admin());

create policy platform_admins_self_select
on public.platform_admins for select to authenticated
using (user_id = auth.uid());

create policy access_codes_manager_select
on public.access_codes for select to authenticated
using (public.can_manage_clinic(clinic_id));

create policy access_code_redemptions_manager_select
on public.access_code_redemptions for select to authenticated
using (public.can_manage_clinic(clinic_id));

create or replace view public.clinic_training_logs
with (security_invoker = true)
as
select
  logs.*,
  public.training_log_integrity(logs.id) as integrity_status
from public.training_logs logs;

revoke all on table public.activation_codes from anon, authenticated;
revoke all on table public.patients_mapping from anon, authenticated;
revoke all on table public.training_logs from anon, authenticated;
revoke all on table public.clinics from anon, authenticated;
revoke all on table public.clinic_members from anon, authenticated;
revoke all on table public.platform_admins from anon, authenticated;
revoke all on table public.access_codes from anon, authenticated;
revoke all on table public.access_code_redemptions from anon, authenticated;

grant select on table public.activation_codes to authenticated;
grant select on table public.patients_mapping to authenticated;
grant select on table public.training_logs to authenticated;
grant select on table public.clinics to authenticated;
grant select on table public.clinic_members to authenticated;
grant select on table public.platform_admins to authenticated;
grant select on table public.access_codes to authenticated;
grant select on table public.access_code_redemptions to authenticated;
grant select on table public.clinic_training_logs to authenticated;

revoke all on function public.redeem_access_code(text, text, text) from public;
revoke all on function public.get_active_entitlement(text) from public;
revoke all on function public.append_training_log(text, jsonb) from public;
revoke all on function public.issue_access_code(text, text, text, integer, timestamptz) from public;
revoke all on function public.revoke_access_redemption(uuid) from public;
revoke all on function public.training_log_integrity(uuid) from public;
revoke all on function aura_private.bootstrap_platform_admin(text) from public;
revoke all on function aura_private.bootstrap_clinic_admin(text, text, text) from public;
revoke all on function aura_private.bootstrap_vip_code(text, integer) from public;
revoke all on all tables in schema aura_private from public, anon, authenticated;
revoke all on all functions in schema aura_private from public, anon, authenticated;

grant execute on function public.redeem_access_code(text, text, text) to service_role;
grant execute on function public.get_active_entitlement(text) to service_role;
grant execute on function public.append_training_log(text, jsonb) to service_role;
grant execute on function public.issue_access_code(text, text, text, integer, timestamptz) to authenticated;
grant execute on function public.revoke_access_redemption(uuid) to authenticated;
grant execute on function public.training_log_integrity(uuid) to authenticated;

commit;
