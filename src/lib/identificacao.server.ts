/**
 * Auxiliares de servidor da identificação por telefone no checkout.
 *
 * Fica separado das server functions para que nada disso vaze para o bundle
 * do navegador (o arquivo `.server.ts` é bloqueado no cliente).
 */

import type { CustomerAddressOption } from "@/lib/identificacao.functions";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Mostra apenas as pontas do e-mail: "vi***r@gmail.com". */
export function maskEmail(email: string | null | undefined): string | null {
  const value = (email ?? "").trim();
  if (!value.includes("@")) return null;
  const [user, domain] = value.split("@");
  const safeUser = (user ?? "").length <= 2 ? `${(user ?? "").slice(0, 1)}*` : `${user!.slice(0, 2)}***${user!.slice(-1)}`;
  return `${safeUser}@${domain}`;
}

/** Endereços salvos do cliente, com o principal primeiro. */
export async function loadCustomerAddresses(
  admin: Admin,
  storeId: string,
  customerId: string,
): Promise<CustomerAddressOption[]> {
  const { data } = await admin
    .from("customer_addresses")
    .select("id, label, street, number, complement, reference, district, city, state, zip_code, is_default")
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(6);

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    street: row.street,
    number: row.number,
    complement: row.complement,
    reference: row.reference,
    district: row.district,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    isDefault: row.is_default,
  }));
}
