import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { publicLoyaltyStatus } from "@/lib/fidelidade.functions";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * Cartão de fidelidade do cliente na loja pública.
 * Mostra saldo, extrato, progresso de nível, recompensas e as regras do
 * programa de forma transparente. Só consulta quando há telefone válido.
 */
export function LoyaltyCard({ storeSlug, phone }: { storeSlug: string; phone: string }) {
  const fetchStatus = useServerFn(publicLoyaltyStatus);
  const digits = phone.replace(/\D/g, "");

  const { data, isLoading } = useQuery({
    queryKey: ["loyalty-status", storeSlug, digits],
    enabled: digits.length >= 10,
    queryFn: () => fetchStatus({ data: { storeSlug, phone: digits } }),
  });

  if (digits.length < 10) return null;
  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!data?.enabled) return null;

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Seu programa de fidelidade</CardTitle>
          {data.tier ? (
            <Badge style={{ backgroundColor: data.tier.color, color: "#111" }}>
              {data.tier.name}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          {data.points} ponto(s) · equivalem a {formatCurrency(data.pointsValue)}
          {data.cashback > 0 ? ` · cashback de ${formatCurrency(data.cashback)}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.nextTier ? (
          <div>
            <p className="text-sm text-muted-foreground">
              Faltam {data.nextTier.missing} pontos para o nível {data.nextTier.name}.
            </p>
            <Progress className="mt-2" value={data.progress} />
          </div>
        ) : null}

        {data.tier?.benefits ? (
          <p className="text-sm text-muted-foreground">{data.tier.benefits}</p>
        ) : null}

        {data.missions.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium">Missões</h3>
            <ul className="mt-2 space-y-2">
              {data.missions.map((mission) => (
                <li key={mission.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{mission.title}</span>
                    <span className="text-muted-foreground">+{mission.reward} pts</span>
                  </div>
                  <Progress className="mt-1" value={mission.percent} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.rewards.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium">Recompensas</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {data.rewards.map((reward) => (
                <li key={reward.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{reward.name}</span>
                  <span className={reward.available ? "text-emerald-600" : "text-muted-foreground"}>
                    {reward.cost} pts · {reward.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.redemptions.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium">Seus resgates</h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {data.redemptions.map((item) => (
                <li key={item.code}>
                  {item.reward} · código {item.code}
                  {item.expiresAt ? ` · válido até ${formatDate(item.expiresAt)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data.statement.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium">Ver extrato</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {data.statement.map((row, index) => (
                <li
                  key={`${row.date}-${index}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-muted-foreground">
                    {formatDate(row.date)} · {row.label}
                  </span>
                  <span className={row.points >= 0 ? "text-emerald-600" : "text-destructive"}>
                    {row.points > 0 ? "+" : ""}
                    {row.points} pts
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {data.terms ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium">Regras do programa</summary>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{data.terms}</p>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
