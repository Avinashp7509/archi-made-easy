create table shipments (
  id bigserial primary key,
  shop_id bigint not null,
  tracking_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  recipient text not null,
  address jsonb not null,
  status text not null,
  carrier_ref text,
  created_at timestamptz not null default now()
);

create table tracking_events (
  id bigserial primary key,
  shipment_id bigint not null references shipments(id),
  description text not null,
  occurred_at timestamptz not null,
  unique (shipment_id, occurred_at, description)
);
