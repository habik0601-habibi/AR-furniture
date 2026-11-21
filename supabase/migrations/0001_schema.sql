-- RoomSense schema
-- Multi-tenant: each furniture store owns its products, delivery rules,
-- analytics events and quote requests. Shoppers are anonymous; they can only
-- read active catalogues and write through rate-limited functions.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- stores
create table public.stores (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete set null,
  slug          text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name          text not null check (length(name) between 2 and 60),
  city          text not null default 'lahore',
  brand_color   text not null default '#1f2937' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  -- per-store overrides of the delivery cost model (see src/engine/deliveryCost.ts)
  delivery_rules jsonb not null default '{}'::jsonb,
  -- sites allowed to embed the widget (empty = any, used for the demo)
  allowed_origins text[] not null default '{}',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- products
-- sizes / finishes / model / hotspots mirror src/data/types.ts and are stored
-- as jsonb, validated by shape checks, because the widget reads them whole.
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  name          text not null check (length(name) between 2 and 80),
  category      text not null check (category in ('sofa','armchair','bed','wardrobe','dining_table',
                  'dining_chair','coffee_table','tv_unit','side_table','bookshelf','desk','dresser')),
  description   text not null default '',
  sizes         jsonb not null check (jsonb_typeof(sizes) = 'array' and jsonb_array_length(sizes) >= 1),
  finishes      jsonb not null default '[]'::jsonb check (jsonb_typeof(finishes) = 'array'),
  model         jsonb not null check (model ? 'glb' and model ? 'native'),
  hotspots      jsonb not null default '[]'::jsonb check (jsonb_typeof(hotspots) = 'array'),
  styles        text[] not null default '{}',
  assembly_required boolean not null default false,
  removable_legs    boolean not null default false,
  lead_days     int not null default 7 check (lead_days between 0 and 120),
  credit        jsonb,
  active        boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (store_id, slug)
);
create index products_store_idx on public.products(store_id, active, sort);

-- ---------------------------------------------------------------- events
-- Funnel analytics: what shoppers do inside the widget.
create table public.events (
  id          bigint generated always as identity primary key,
  store_id    uuid not null references public.stores(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  session_id  text not null check (length(session_id) between 8 and 64),
  name        text not null check (name in ('widget_opened','viewer_loaded','customized','ar_started',
                'room_measured','layout_generated','fit_checked','delivery_quoted','recommendation_clicked',
                'quote_requested')),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index events_store_time_idx on public.events(store_id, created_at desc);
create index events_session_idx on public.events(session_id, created_at desc);
create index events_product_idx on public.events(product_id);

-- ---------------------------------------------------------------- quote requests
-- "Send this configuration to the store": a lead with the full spatial context.
create table public.quote_requests (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  session_id  text not null,
  customer_name  text not null check (length(customer_name) between 2 and 60),
  phone       text not null check (phone ~ '^[0-9+ -]{7,20}$'),
  city        text not null,
  config      jsonb not null,   -- size, finish, price, room, fit report, delivery quote
  status      text not null default 'new' check (status in ('new','contacted','won','lost')),
  created_at  timestamptz not null default now()
);
create index quotes_store_idx on public.quote_requests(store_id, created_at desc);
create index quotes_product_idx on public.quote_requests(product_id);
create index quotes_session_idx on public.quote_requests(session_id, created_at desc);
create index stores_owner_idx on public.stores(owner_id);

-- ---------------------------------------------------------------- helpers
create or replace function public.private_is_owner(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.stores s where s.id = p_store and s.owner_id = (select auth.uid()));
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.events enable row level security;
alter table public.quote_requests enable row level security;

-- Anyone may read active stores and active products (public catalogue).
create policy stores_public_read on public.stores for select
  using (active or owner_id = (select auth.uid()));
create policy stores_owner_update on public.stores for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy products_public_read on public.products for select
  using ((active and exists (select 1 from public.stores s where s.id = store_id and s.active))
         or public.private_is_owner(store_id));
create policy products_owner_insert on public.products for insert to authenticated
  with check (public.private_is_owner(store_id));
create policy products_owner_update on public.products for update to authenticated
  using (public.private_is_owner(store_id)) with check (public.private_is_owner(store_id));
create policy products_owner_delete on public.products for delete to authenticated
  using (public.private_is_owner(store_id));

-- Events and quotes: owners read their own; nobody writes directly
-- (shoppers write through the functions below).
create policy events_owner_read on public.events for select to authenticated
  using (public.private_is_owner(store_id));
create policy quotes_owner_read on public.quote_requests for select to authenticated
  using (public.private_is_owner(store_id));
create policy quotes_owner_update on public.quote_requests for update to authenticated
  using (public.private_is_owner(store_id)) with check (public.private_is_owner(store_id));

revoke insert, update, delete on public.events from anon, authenticated;
revoke insert, delete on public.quote_requests from anon, authenticated;
revoke update on public.quote_requests from anon;
revoke insert, delete on public.stores from anon, authenticated;
revoke update on public.stores from anon;
revoke insert, update, delete on public.products from anon;

-- ---------------------------------------------------------------- shopper functions
-- track_event: validates the store/product pair and rate-limits per session
-- (max 120 events per 10 minutes) so the public key cannot flood analytics.
create or replace function public.track_event(p_store text, p_product text, p_session text,
                                               p_name text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_store uuid; v_product uuid;
begin
  select id into v_store from public.stores where slug = p_store and active;
  if v_store is null then raise exception 'unknown_store' using errcode = 'P0001'; end if;
  if p_product is not null then
    select id into v_product from public.products where store_id = v_store and slug = p_product;
  end if;
  if (select count(*) from public.events
       where session_id = p_session and created_at > now() - interval '10 minutes') >= 120 then
    return; -- silently drop: analytics must never break the shopper's experience
  end if;
  if pg_column_size(p_data) > 4000 then p_data := '{}'::jsonb; end if;
  insert into public.events(store_id, product_id, session_id, name, data)
  values (v_store, v_product, p_session, p_name, coalesce(p_data, '{}'::jsonb));
end $$;

-- request_quote: a shopper sends their configuration (size, finish, room, fit
-- report, delivery quote) to the store. Max 5 per session per day.
create or replace function public.request_quote(p_store text, p_product text, p_session text,
    p_name text, p_phone text, p_city text, p_config jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_store uuid; v_product uuid; v_id uuid;
begin
  select id into v_store from public.stores where slug = p_store and active;
  if v_store is null then raise exception 'unknown_store' using errcode = 'P0001'; end if;
  select id into v_product from public.products where store_id = v_store and slug = p_product and active;
  if v_product is null then raise exception 'unknown_product' using errcode = 'P0001'; end if;
  if (select count(*) from public.quote_requests
       where session_id = p_session and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;
  if pg_column_size(p_config) > 20000 then raise exception 'config_too_large' using errcode = 'P0001'; end if;
  insert into public.quote_requests(store_id, product_id, session_id, customer_name, phone, city, config)
  values (v_store, v_product, p_session, trim(p_name), trim(p_phone), p_city, p_config)
  returning id into v_id;
  perform public.track_event(p_store, p_product, p_session, 'quote_requested', '{}'::jsonb);
  return v_id;
end $$;

-- ---------------------------------------------------------------- owner analytics
-- Funnel per product for the last p_days days.
create or replace function public.store_funnel(p_store uuid, p_days int default 30)
returns table (product_id uuid, product_name text, opened bigint, viewed_3d bigint, customized bigint,
               ar bigint, measured bigint, fit bigint, delivery bigint, quotes bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name,
    count(distinct e.session_id) filter (where e.name = 'widget_opened'),
    count(distinct e.session_id) filter (where e.name = 'viewer_loaded'),
    count(distinct e.session_id) filter (where e.name = 'customized'),
    count(distinct e.session_id) filter (where e.name = 'ar_started'),
    count(distinct e.session_id) filter (where e.name = 'room_measured'),
    count(distinct e.session_id) filter (where e.name = 'fit_checked'),
    count(distinct e.session_id) filter (where e.name = 'delivery_quoted'),
    count(distinct e.session_id) filter (where e.name = 'quote_requested')
  from public.products p
  left join public.events e on e.product_id = p.id and e.created_at > now() - make_interval(days => p_days)
  where p.store_id = p_store and public.private_is_owner(p_store)
  group by p.id, p.name, p.sort
  order by p.sort, p.name;
$$;

-- Fit outcomes: how often shoppers' rooms could not take a product, and why.
create or replace function public.store_fit_outcomes(p_store uuid, p_days int default 30)
returns table (verdict text, n bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(e.data->>'verdict', 'unknown'), count(*)
  from public.events e
  where e.store_id = p_store and e.name = 'fit_checked'
    and e.created_at > now() - make_interval(days => p_days)
    and public.private_is_owner(p_store)
  group by 1 order by 2 desc;
$$;

-- private_is_owner is executable by anon because RLS policies call it; it only ever answers for auth.uid().
revoke execute on all functions in schema public from public, anon;
grant execute on function public.track_event(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.request_quote(text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.store_funnel(uuid, int) to authenticated;
grant execute on function public.store_fit_outcomes(uuid, int) to authenticated;
grant execute on function public.private_is_owner(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- storage
-- Public bucket for 3D models; owners upload into a folder named after their store id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', true, 15728640, array['model/gltf-binary','application/octet-stream','image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

create policy models_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'models' and public.private_is_owner(((storage.foldername(name))[1])::uuid));
create policy models_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'models' and public.private_is_owner(((storage.foldername(name))[1])::uuid));
create policy models_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'models' and public.private_is_owner(((storage.foldername(name))[1])::uuid));
