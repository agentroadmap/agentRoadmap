-- P796: Provider health tracking append log.

BEGIN;

CREATE TABLE IF NOT EXISTS roadmap.provider_health_log (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    route_provider text NOT NULL,
    model_name     text,
    checked_at     timestamptz NOT NULL DEFAULT now(),
    latency_ms     integer,
    status         text NOT NULL CHECK (status IN ('ok', 'timeout', 'error')),
    http_status    smallint,
    error_detail   text
);

CREATE INDEX IF NOT EXISTS idx_provider_health_log_provider_checked
    ON roadmap.provider_health_log (route_provider, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_health_log_provider_model_checked
    ON roadmap.provider_health_log (route_provider, model_name, checked_at DESC);

COMMIT;
