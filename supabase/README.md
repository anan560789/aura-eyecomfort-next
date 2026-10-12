# Aura EyeGym Supabase deployment

Apply database changes before deploying the matching frontend branch.

1. Back up the Supabase project.
2. Run `migrations/202610070001_security_multitenancy_vip.sql` in the Supabase SQL Editor.
3. Set the Edge Function secrets. `LINE_CHANNEL_ID` is the numeric LINE Login
   Channel ID (the part before the hyphen in the LIFF ID). Do not use the LIFF ID
   itself.

   ```bash
   npx supabase secrets set \
     LINE_CHANNEL_ID=your-line-channel-id \
     AURA_ALLOWED_ORIGINS=https://aura-eyecomfort-next.pages.dev \
     --project-ref your-project-ref
   ```

4. Deploy the LINE identity gateway:

   ```bash
   npx supabase functions deploy line-gateway \
     --project-ref your-project-ref \
     --no-verify-jwt
   ```

   Supabase automatically supplies `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` to the deployed function. Never put the service
   role key in Cloudflare or browser code.

5. Create the platform owner's email/password user in **Authentication → Users**.
6. In the SQL Editor, replace the email and run:

   ```sql
   select aura_private.bootstrap_platform_admin('owner@example.com');
   ```

7. Generate the one-time VIP code for ten active users:

   ```sql
   select * from aura_private.bootstrap_vip_code(
     '重要親友終身授權',
     10
   );
   ```

   Save the returned `access_code` securely. The database stores only its SHA-256
   digest and the last four characters, so the full value cannot be displayed again.

The VIP code has no expiry. Revoking a redemption frees one of its ten active seats.
Do not commit the returned code, a user password, or a Supabase service-role key.

For each clinic, first create its user in **Authentication → Users**, then assign
the clinic without creating another dashboard deployment:

```sql
select aura_private.bootstrap_clinic_admin(
  'clinic-admin@example.com',
  'CLINIC-001',
  '範例眼科診所'
);
```

Every clinic signs in at the same `/clinic` URL. Row-level security limits each
account to its own clinic, while the platform owner can see every clinic.

The public app never sends a client-provided LINE UID directly to a database RPC.
It sends the current LIFF access token to `line-gateway`; the function verifies
the token and Channel ID with LINE, fetches the verified profile, then calls the
restricted database RPC with the server-side service role.
