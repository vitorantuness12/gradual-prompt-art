-- Aprova todos os entregadores que estão pendentes de aprovação
UPDATE delivery_profiles
SET
  status = 'approved',
  approved_at = now()
WHERE status = 'awaiting_approval';
