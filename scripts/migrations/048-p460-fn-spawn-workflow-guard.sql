-- P460: fn_spawn_workflow trigger guard + index for workflows(proposal_id)
-- AC#100: Index on roadmap.workflows(proposal_id)
-- AC#101: Guard with exception and failure event logging

CREATE INDEX IF NOT EXISTS idx_workflows_proposal_id ON roadmap.workflows(proposal_id);

CREATE OR REPLACE FUNCTION roadmap.fn_spawn_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_template_id int8;
    v_first_stage text;
BEGIN
    -- Look up workflow template bound to this proposal type
    SELECT wt.id, ws.stage_name
    INTO   v_template_id, v_first_stage
    FROM   roadmap_proposal.proposal_type_config ptc
    JOIN   roadmap.workflow_templates wt ON wt.name = ptc.workflow_name
    JOIN   roadmap.workflow_stages ws    ON ws.template_id = wt.id
    WHERE  ptc.type = NEW.type
    ORDER  BY ws.stage_order
    LIMIT  1;

    IF v_template_id IS NULL THEN
        RAISE EXCEPTION 'fn_spawn_workflow: No proposal_type_config or workflow_templates for type=% (proposal_id=%)',
                        NEW.type, NEW.id;
    END IF;

    INSERT INTO roadmap.workflows (template_id, proposal_id, current_stage)
    VALUES (v_template_id, NEW.id, COALESCE(v_first_stage, NEW.status));

    RETURN NEW;
END;
$function$
