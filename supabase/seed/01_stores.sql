-- 01_stores.sql: two fictional demo stores and their owner logins.
-- Replace :SHAHI_PASSWORD and :NEST_PASSWORD before running (real values live
-- only in .env.local, which is not committed). Emails use the reserved example.com
-- domain. (The live project was seeded with scripts/create-demo-owners.mjs.)

with new_users as (
  insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
     confirmation_token, email_change, email_change_token_new, recovery_token)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
         v.email, extensions.crypt(v.password, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
  from (values
    ('owner.shahi@example.com', ':SHAHI_PASSWORD'),
    ('owner.nest@example.com',  ':NEST_PASSWORD')
  ) as v(email, password)
  returning id, email
), ident as (
  insert into auth.identities
    (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', now(), now(), now()
  from new_users u
)
insert into public.stores (owner_id, slug, name, city, brand_color)
select u.id,
       case when u.email like '%shahi%' then 'shahi' else 'nest' end,
       case when u.email like '%shahi%' then 'Shahi Furniture' else 'Nest Living' end,
       case when u.email like '%shahi%' then 'lahore' else 'karachi' end,
       case when u.email like '%shahi%' then '#5b2a1e' else '#1f2b29' end
from new_users u;
