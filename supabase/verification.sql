-- Run after 202610070001_security_multitenancy_vip.sql.
-- This report contains counts and security metadata only; it does not expose patient rows.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'activation_codes',
    'patients_mapping',
    'training_logs',
    'clinics',
    'clinic_members',
    'platform_admins',
    'access_codes',
    'access_code_redemptions'
  )
order by c.relname;

select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'activation_codes',
    'patients_mapping',
    'training_logs',
    'access_codes',
    'access_code_redemptions'
  )
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

select 'activation_codes_legacy' as item, count(*)::bigint as count
from public.activation_codes
union all
select 'access_codes', count(*) from public.access_codes
union all
select 'active_redemptions', count(*)
from public.access_code_redemptions where revoked_at is null
union all
select 'patients_mapping', count(*) from public.patients_mapping
union all
select 'training_logs', count(*) from public.training_logs;

select
  signature_version,
  count(*)
from public.training_logs
group by signature_version
order by signature_version;
