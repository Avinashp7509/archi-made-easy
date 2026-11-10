# parcelpoint

Parcel tracking for small online shops. Shops create shipments through the API, the worker books them with a carrier and polls for tracking events, and customers follow their parcel on a public tracking page.

## Run locally

```sh
docker compose up
```

- API: http://localhost:8080
- Tracking page: http://localhost:8080/track/<code>

## Layout

- `services/api`: HTTP API and the public tracking page (Node, Express).
- `services/worker`: books shipments with the carrier and polls tracking (Node).
- `services/notifier`: sends e-mail when a parcel moves (Node).
- `db/migrations`: PostgreSQL schema.
- `docker-compose.yml`: the services, PostgreSQL, Redis and RabbitMQ.
- `deploy/`: production settings (Kubernetes).
