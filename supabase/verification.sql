-- Run after 202610070001_security_multitenancy_vip.sql.
-- This report contains counts and security metadata only; it does not expose patient rows.

with protected_tables (schema_name, table_name) as (
  values
    ('public', 'activation_codes'),
    ('public', 'patients_mapping'),
    ('public', 'training_logs'),
    ('public', 'clinics'),
    ('public', 'clinic_members'),
    ('public', 'platform_admins'),
    ('public', 'access_codes'),
    ('public', 'access_code_redemptions'),
    ('aura_private', 'app_secrets')
),
rls_checks as (
  select
    'RLS'::text as category,
    protected.schema_name || '.' || protected.table_name as item,
    coalesce(class.relrowsecurity, false)::text as value,
    case
      when class.oid is not null and class.relrowsecurity then 'PASS'
      else 'FAIL'
    end as status
  from protected_tables protected
  left join pg_namespace namespace
    on namespace.nspname = protected.schema_name
  left join pg_class class
    on class.relnamespace = namespace.oid
   and class.relname = protected.table_name
),
extension_check as (
  select
    'EXTENSION'::text as category,
    'pgcrypto schema'::text as item,
    coalesce((
      select namespace.nspname
      from pg_extension extension
      join pg_namespace namespace
        on namespace.oid = extension.extnamespace
      where extension.extname = 'pgcrypto'
    ), 'MISSING') as value,
    case
      when (
        select namespace.nspname
        from pg_extension extension
        join pg_namespace namespace
          on namespace.oid = extension.extnamespace
        where extension.extname = 'pgcrypto'
      ) = 'extensions' then 'PASS'
      else 'FAIL'
    end as status
),
anonymous_grant_check as (
  select
    'SECURITY'::text as category,
    'anon grants on protected tables'::text as item,
    count(*)::text as value,
    case when count(*) = 0 then 'PASS' else 'FAIL' end as status
  from information_schema.role_table_grants grants
  join protected_tables protected
    on protected.schema_name = grants.table_schema
   and protected.table_name = grants.table_name
  where grants.grantee = 'anon'
),
data_counts as (
  select 'DATA'::text as category, 'activation_codes_legacy'::text as item,
    count(*)::text as value, 'INFO'::text as status
  from public.activation_codes
  union all
  select 'DATA', 'access_codes', count(*)::text, 'INFO'
  from public.access_codes
  union all
  select 'DATA', 'active_redemptions', count(*)::text, 'INFO'
  from public.access_code_redemptions
  where revoked_at is null
  union all
  select 'DATA', 'patients_mapping', count(*)::text, 'INFO'
  from public.patients_mapping
  union all
  select 'DATA', 'training_logs', count(*)::text, 'INFO'
  from public.training_logs
),
signature_counts as (
  select
    'SIGNATURE'::text as category,
    'training_logs / ' || signature_version as item,
    count(*)::text as value,
    case
      when signature_version in ('legacy-client-v1', 'server-v2') then 'INFO'
      else 'REVIEW'
    end as status
  from public.training_logs
  group by signature_version
)
select category, item, value, status from rls_checks
union all
select category, item, value, status from extension_check
union all
select category, item, value, status from anonymous_grant_check
union all
select category, item, value, status from data_counts
union all
select category, item, value, status from signature_counts
order by category, item;
