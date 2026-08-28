import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Minus } from "lucide-react";

import { PERMISSION_AREAS, ROLE_DEFAULT_PERMISSIONS } from "@/lib/permissions";

/**
 * Matriz de permissões por perfil.
 * Mostra, de forma única e consultável, o que cada papel enxerga no sistema —
 * os mesmos valores usados como padrão ao convidar alguém para a equipe.
 */

const PROFILES = [
  {
    key: "customer",
    label: "Cliente",
    scope: "Loja pública, carrinho, checkout, acompanhamento, fidelidade e suporte.",
  },
  { key: "staff", label: "Funcionário", scope: "PDV, pedidos e os módulos que o lojista liberar." },
  { key: "waiter", label: "Garçom", scope: "Mesas, comandas, chamados e lançamento de itens." },
  {
    key: "kitchen",
    label: "Cozinha / expedição",
    scope: "Monitor de preparo (KDS) e impressão setorizada.",
  },
  {
    key: "delivery_person",
    label: "Entregador",
    scope: "Entregas atribuídas, rota e comprovante.",
  },
  {
    key: "owner",
    label: "Lojista",
    scope: "Operação completa, financeiro, catálogo e relatórios.",
  },
  {
    key: "super_admin",
    label: "Superadmin",
    scope: "Lojas, planos, integrações globais, suporte e auditoria.",
  },
] as const;

/** Perfis operacionais que não são papéis do banco herdam o mapa de staff. */
const PROFILE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  customer: {},
  waiter: { orders: true, pos: true, customers: true },
  kitchen: { orders: true },
  ...ROLE_DEFAULT_PERMISSIONS,
  super_admin: Object.fromEntries(PERMISSION_AREAS.map((area) => [area.key, true])),
};

export function PermissionMatrix() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Matriz de permissões</CardTitle>
          <CardDescription>
            Referência única de quem acessa o quê. Ao convidar alguém, essas marcações viram o
            padrão do papel e podem ser ajustadas área por área.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PROFILES.map((profile) => (
            <div key={profile.key} className="rounded-xl border border-border/70 p-3">
              <p className="font-medium">{profile.label}</p>
              <p className="text-sm text-muted-foreground">{profile.scope}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">Áreas do painel liberadas para cada perfil</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-border/70 p-2 text-left">
                Área
              </th>
              {PROFILES.map((profile) => (
                <th
                  key={profile.key}
                  scope="col"
                  className="border-b border-border/70 p-2 text-center"
                >
                  {profile.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_AREAS.map((area) => (
              <tr key={area.key}>
                <th scope="row" className="border-b border-border/50 p-2 text-left font-normal">
                  <span className="font-medium">{area.label}</span>
                  <span className="block text-xs text-muted-foreground">{area.description}</span>
                </th>
                {PROFILES.map((profile) => {
                  const allowed = PROFILE_PERMISSIONS[profile.key]?.[area.key] === true;
                  return (
                    <td key={profile.key} className="border-b border-border/50 p-2 text-center">
                      {allowed ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="liberado" />
                      ) : (
                        <Minus
                          className="mx-auto h-4 w-4 text-muted-foreground"
                          aria-label="não liberado"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
