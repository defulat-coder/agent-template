-- Keep cross-parameter query bounds inside PostgreSQL so every MCP client uses
-- the same executable invariant. Toolbox parameter metadata can bound scalar
-- numbers, but it cannot express from < to or a maximum interval.
CREATE OR REPLACE FUNCTION public.validate_toolbox_time_window(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE(window_from TIMESTAMPTZ, window_to TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
STRICT
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_to <= p_from THEN
    RAISE EXCEPTION 'Toolbox time window must satisfy from < to'
      USING ERRCODE = '22023';
  END IF;

  IF p_to - p_from > INTERVAL '31 days' THEN
    RAISE EXCEPTION 'Toolbox time window must not exceed 31 days'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT p_from, p_to;
END;
$$;
