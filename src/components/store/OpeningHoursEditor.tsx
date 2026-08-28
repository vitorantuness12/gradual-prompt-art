import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WEEK_DAYS, type DayHours, type Holiday } from "@/lib/store-config";

export interface OpeningHoursEditorProps {
  hours: DayHours[];
  onChange: (hours: DayHours[]) => void;
  holidays: Holiday[];
  onHolidaysChange: (holidays: Holiday[]) => void;
}

/** Editor de dias, horários, pausas e feriados de funcionamento. */
export function OpeningHoursEditor({ hours, onChange, holidays, onHolidaysChange }: OpeningHoursEditorProps) {
  function update(day: number, patch: Partial<DayHours>) {
    onChange(hours.map((item) => (item.day === day ? { ...item, ...patch } : item)));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {hours.map((item) => (
          <div
            key={item.day}
            className="grid gap-3 rounded-xl border border-border/70 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="flex items-center gap-3">
              <Switch
                id={`dia-${item.day}`}
                checked={item.enabled}
                onCheckedChange={(checked) => update(item.day, { enabled: checked })}
                aria-label={`Atender ${WEEK_DAYS[item.day]}`}
              />
              <Label htmlFor={`dia-${item.day}`} className="cursor-pointer text-sm font-medium">
                {WEEK_DAYS[item.day]}
              </Label>
            </div>

            {item.enabled ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="time"
                  value={item.open}
                  onChange={(event) => update(item.day, { open: event.target.value })}
                  className="w-[7.5rem]"
                  aria-label={`Abertura ${WEEK_DAYS[item.day]}`}
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="time"
                  value={item.close}
                  onChange={(event) => update(item.day, { close: event.target.value })}
                  className="w-[7.5rem]"
                  aria-label={`Fechamento ${WEEK_DAYS[item.day]}`}
                />
                {item.breakStart !== null ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">pausa</span>
                    <Input
                      type="time"
                      value={item.breakStart}
                      onChange={(event) => update(item.day, { breakStart: event.target.value })}
                      className="w-[7.5rem]"
                      aria-label={`Início da pausa ${WEEK_DAYS[item.day]}`}
                    />
                    <Input
                      type="time"
                      value={item.breakEnd ?? ""}
                      onChange={(event) => update(item.day, { breakEnd: event.target.value })}
                      className="w-[7.5rem]"
                      aria-label={`Fim da pausa ${WEEK_DAYS[item.day]}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => update(item.day, { breakStart: null, breakEnd: null })}
                      aria-label={`Remover pausa de ${WEEK_DAYS[item.day]}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => update(item.day, { breakStart: "12:00", breakEnd: "13:00" })}
                  >
                    <Plus className="mr-1 size-4" aria-hidden="true" />
                    Pausa
                  </Button>
                )}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Fechado</span>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Feriados e datas fechadas</h4>
            <p className="text-xs text-muted-foreground">Nessas datas a loja não recebe pedidos.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onHolidaysChange([
                ...holidays,
                { date: new Date().toISOString().slice(0, 10), label: "Feriado", closed: true },
              ])
            }
          >
            <Plus className="mr-1 size-4" aria-hidden="true" />
            Adicionar
          </Button>
        </div>

        {holidays.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma data cadastrada.</p>
        ) : (
          <ul className="space-y-2">
            {holidays.map((holiday, index) => (
              <li key={`${holiday.date}-${index}`} className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={holiday.date}
                  onChange={(event) =>
                    onHolidaysChange(
                      holidays.map((item, i) => (i === index ? { ...item, date: event.target.value } : item)),
                    )
                  }
                  className="w-[10rem]"
                  aria-label="Data do feriado"
                />
                <Input
                  value={holiday.label}
                  onChange={(event) =>
                    onHolidaysChange(
                      holidays.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)),
                    )
                  }
                  className="min-w-[10rem] flex-1"
                  aria-label="Nome do feriado"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onHolidaysChange(holidays.filter((_, i) => i !== index))}
                  aria-label="Remover feriado"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
