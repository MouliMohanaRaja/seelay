-- Expand items.state to expose backend resolution progress instead of
-- letting the UI guess it from elapsed time. New states: 'resolving' (the
-- pipeline is actively running) and 'retrying' (a transient upstream
-- failure, e.g. TMDB, is being retried). A run that exhausts its retries
-- now lands explicitly in 'needs_hint' (metadata.resolution_failed = true)
-- instead of leaving the item stuck.

alter table items drop constraint if exists items_state_check;
alter table items add constraint items_state_check
  check (state in (
    'raw', 'resolving', 'retrying', 'resolved', 'needs_confirm',
    'needs_hint', 'confirmed'
  ));
