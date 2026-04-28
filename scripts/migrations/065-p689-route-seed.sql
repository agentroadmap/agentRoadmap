-- P689: seed notification_route for dispatch_loop_detected.
--
-- postWorkOffer already inserts into notification_queue with
-- kind='dispatch_loop_detected' (post-work-offer.ts:184), but migration 062
-- did not seed a matching route — alerts silently fell to no transport.

BEGIN;

INSERT INTO roadmap.notification_route (kind, severity_min, transport, target, notes)
VALUES
	('dispatch_loop_detected', 'ALERT',    'discord_webhook', NULL, 'P689: circuit breaker loop — P687 burned 60 runs in 2h15m'),
	('dispatch_loop_detected', 'CRITICAL', 'log_only',        NULL, 'P689: backstop — never lose a CRITICAL loop alert')
ON CONFLICT DO NOTHING;

COMMIT;
