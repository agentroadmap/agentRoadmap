-- Task #24: realign all IDENTITY sequences in the roadmap schema
--
-- Incident: workflows_id_seq drifted to last_value=46 while max(id)=198,
-- causing 8 proposal-create failures before being patched with setval.
-- No migration in scripts/migrations/* resets the sequence, so the cause
-- was an ad-hoc operation (likely ALTER SEQUENCE ... RESTART during a
-- manual cleanup or a DROP/ADD IDENTITY cycle). Even if we cannot pin
-- the exact trigger, the fleet has ~35 other IDENTITY sequences in the
-- roadmap schema that are just as exposed. This migration:
--
--   1) Realigns every IDENTITY sequence under `roadmap` to max(id)+1 so
--      no other table is silently waiting to collide.
--   2) Installs `roadmap.fn_realign_identity_sequences(p_schema)` so any
--      future restore / recovery runbook can call it instead of hand-
--      crafting setval statements per table.
--
-- Idempotent: setval to max(id) is safe to re-run. When a table is empty,
-- we skip it (setval to 1 with is_called=false would reset a live seq).

BEGIN;

CREATE OR REPLACE FUNCTION roadmap.fn_realign_identity_sequences(p_schema text DEFAULT 'roadmap')
RETURNS TABLE(table_name text, column_name text, sequence_name text, old_last_value bigint, new_last_value bigint)
LANGUAGE plpgsql
AS $$
DECLARE
    r            record;
    v_max        bigint;
    v_old_last   bigint;
    v_seq        text;
BEGIN
    FOR r IN
        SELECT c.relname AS tbl,
               a.attname AS col,
               pg_get_serial_sequence(n.nspname||'.'||c.relname, a.attname) AS seq_qual
        FROM   pg_class     c
        JOIN   pg_namespace n ON n.oid = c.relnamespace
        JOIN   pg_attribute a ON a.attrelid = c.oid
        WHERE  n.nspname = p_schema
          AND  a.attidentity IN ('a','d')
          AND  c.relkind = 'r'
          AND  NOT a.attisdropped
    LOOP
        CONTINUE WHEN r.seq_qual IS NULL;

        EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I', r.col, p_schema, r.tbl)
           INTO v_max;

        -- Snapshot the current sequence value for reporting.
        EXECUTE format('SELECT last_value FROM %s', r.seq_qual) INTO v_old_last;

        IF v_max > 0 AND v_max > v_old_last THEN
            PERFORM setval(r.seq_qual, v_max, true);
            table_name      := r.tbl;
            column_name     := r.col;
            sequence_name   := r.seq_qual;
            old_last_value  := v_old_last;
            new_last_value  := v_max;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION roadmap.fn_realign_identity_sequences(text) IS
    'Task #24: realign IDENTITY sequences in the given schema to max(col)+1. '
    'Returns one row per sequence actually moved. Safe/idempotent; run after '
    'any restore or ad-hoc data reshuffle in the roadmap schema.';

-- Run it once now to catch any other sequences sitting in the same
-- state as workflows_id_seq did.
SELECT * FROM roadmap.fn_realign_identity_sequences('roadmap');

COMMIT;
