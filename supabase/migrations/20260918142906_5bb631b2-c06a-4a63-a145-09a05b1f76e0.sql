-- Tabelas internas: políticas explícitas apenas para o serviço da plataforma.
DO $block$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'channel_credentials','channel_webhook_events','cron_tokens',
    'evolution_global_settings','integration_credentials','login_attempts',
    'member_sessions','payment_webhook_events','rate_limits',
    'verification_codes','whatsapp_instance_credentials'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_only', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_only', table_name);
  END LOOP;
END
$block$;

-- Rotinas invocadas somente por gatilhos internos.
REVOKE EXECUTE ON FUNCTION public.apply_stock_for_order_item() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_store_owner_membership() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_store_slug_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_store_subscription() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_checklist_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_attachment_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_item_customization() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_product_availability_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_quote_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_stock_on_cancel() FROM PUBLIC, anon, authenticated;

-- Rotinas exclusivas dos processos protegidos do servidor.
REVOKE EXECUTE ON FUNCTION public.claim_cron_run(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cron_run(text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.enqueue_appointment_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminders() TO service_role;
REVOKE EXECUTE ON FUNCTION public.is_customer_blocked(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_customer_blocked(uuid, text) TO service_role;

-- Rotinas autenticadas, todas com validações internas de loja/conta.
REVOKE EXECUTE ON FUNCTION public.apply_stock_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_stock_entry(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.cash_session_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_session_summary(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.has_store_permission(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_store_permission(uuid, uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.has_store_role(uuid, uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_store_role(uuid, uuid, public.app_role[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_store_staff(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_staff(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.low_stock_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.low_stock_alerts(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.my_account_kinds() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_account_kinds() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.store_plan_limits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_plan_limits(uuid) TO authenticated, service_role;

-- Disponíveis publicamente apenas onde a vitrine precisa consultar dados seguros.
REVOKE EXECUTE ON FUNCTION public.is_slug_available(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_slug_available(text, uuid) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.store_rating_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_rating_summary(uuid) TO anon, authenticated, service_role;