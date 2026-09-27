-- Run this once in Supabase's SQL editor.

create table if not exists products (
  id bigserial primary key,
  store_product_id text not null,       -- the ID shown in the store's product page URL
  product_name text not null,
  option_label text not null,           -- e.g. "Creator kit" - the option variant being tracked
  product_url text,
  created_at timestamptz not null default now(),
  unique (store_product_id, option_label)
);

-- One row per scrape attempt. This single table doubles as both the price/stock
-- history (successful rows) and the scrape log (every attempt, including failures).
create table if not exists scrape_log (
  id bigserial primary key,
  product_id bigint not null references products(id) on delete cascade,
  scraped_at timestamptz not null default now(),
  price numeric,                        -- null when outcome = 'failed'
  stock text,                           -- null when outcome = 'failed'
  outcome text not null check (outcome in ('success', 'retried', 'failed')),
  error_message text,                   -- populated on 'retried' or 'failed'
  attempts integer not null default 1   -- how many tries it took within this scrape run
);

create index if not exists idx_scrape_log_product_id on scrape_log(product_id);
create index if not exists idx_scrape_log_scraped_at on scrape_log(scraped_at desc);
