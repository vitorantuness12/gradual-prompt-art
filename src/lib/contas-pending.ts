import { supabase } from "@/integrations/supabase/client";

import type { AccountKind } from "./contas";

/**
 * Quando o cadastro exige confirmação de e-mail, guardamos os dados do perfil
 * no navegador e gravamos no banco assim que a sessão existir.
 */

const KEY = "osp:pending-profile";

export interface PendingProfile {
  kind: AccountKind;
  fullName: string;
  email: string;
  phone: string;
  birthDate?: string | null;
  marketingOptIn?: boolean;
  document?: string | null;
  cpf?: string | null;
  city?: string | null;
  region?: string | null;
  vehicleType?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  plate?: string | null;
  cnhNumber?: string | null;
  pixKey?: string | null;
  pixKeyType?: string | null;
}

export function savePendingProfile(profile: PendingProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(profile));
}

export function readPendingProfile(): PendingProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingProfile;
  } catch {
    return null;
  }
}

export function clearPendingProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/** Grava o perfil escolhido para o usuário logado. Idempotente (upsert). */
export async function persistProfile(userId: string, profile: PendingProfile): Promise<void> {
  if (profile.kind === "cliente") {
    await supabase.from("customer_profiles").upsert({
      user_id: userId,
      full_name: profile.fullName,
      email: profile.email || null,
      phone: profile.phone || null,
      birth_date: profile.birthDate || null,
      marketing_opt_in: Boolean(profile.marketingOptIn),
    });
    await supabase.from("consent_records").insert([
      { user_id: userId, kind: "terms", granted: true, source: "cadastro" },
      {
        user_id: userId,
        kind: "marketing",
        granted: Boolean(profile.marketingOptIn),
        source: "cadastro",
      },
    ]);
    return;
  }

  if (profile.kind === "motoboy") {
    await supabase.from("delivery_profiles").upsert({
      user_id: userId,
      full_name: profile.fullName,
      email: profile.email || null,
      phone: profile.phone || null,
      cpf: profile.cpf || null,
      birth_date: profile.birthDate || null,
      city: profile.city || null,
      region: profile.region || null,
      vehicle_type: profile.vehicleType || "moto",
      vehicle_brand: profile.vehicleBrand || null,
      vehicle_model: profile.vehicleModel || null,
      plate: profile.plate || null,
      cnh_number: profile.cnhNumber || null,
      pix_key: profile.pixKey || null,
      pix_key_type: profile.pixKeyType || null,
      status: "awaiting_approval",
      terms_accepted_at: new Date().toISOString(),
    });
    await supabase.from("consent_records").insert({
      user_id: userId,
      kind: "terms_entregador",
      granted: true,
      source: "cadastro",
    });
    return;
  }

  await supabase.from("merchant_profiles").upsert({
    user_id: userId,
    full_name: profile.fullName,
    email: profile.email || null,
    phone: profile.phone || null,
    document: profile.document || null,
  });
  await supabase.from("consent_records").insert({
    user_id: userId,
    kind: "terms",
    granted: true,
    source: "cadastro",
  });
}

/** Aplica o cadastro pendente, se houver, logo após a sessão ser criada. */
export async function applyPendingProfile(userId: string): Promise<PendingProfile | null> {
  const pending = readPendingProfile();
  if (!pending) return null;
  await persistProfile(userId, pending);
  clearPendingProfile();
  return pending;
}
