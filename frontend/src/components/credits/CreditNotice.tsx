import { Link } from "react-router-dom";

import type { CreditBalanceDTO } from "../../api/types";
import { parseApiDate } from "../../lib/studyProgress";

export const FREE_CREDITS = 3;
export const PASS_MONTHLY_CREDITS = 150;
export const PRICING_PATH = "/precios"; // future route: the pricing page does not exist yet

const PRICING_LINK = (
  <Link to={PRICING_PATH} className="font-medium text-action hover:underline">
    Ver precios
  </Link>
);

/** Grey notice shown before spending a credit. Texts fixed by §3.7 of the SaaS plan. */
export function CreditNotice({ balance, id, className = "" }: { balance: CreditBalanceDTO; id?: string; className?: string }) {
  const cls = `text-sm text-text-muted ${className}`.trim();
  if (balance.tier === "pass") {
    const expires = parseApiDate(balance.pass_expires_at)?.toLocaleDateString("es", { day: "numeric", month: "short" });
    return (
      <p id={id} className={cls}>
        Tu pase vence el {expires}. Te quedan <strong className="font-semibold text-text-primary">{balance.pass_credits} de {PASS_MONTHLY_CREDITS}</strong> créditos este mes.
      </p>
    );
  }
  if (balance.tier === "free") {
    return (
      <p id={id} className={cls}>
        Cada plan nuevo o repaso con IA usa 1 crédito. Te quedan{" "}
        <strong className="font-semibold text-text-primary">{balance.total} de {FREE_CREDITS} gratis</strong>. Subir material y crear metas no
        gasta créditos. Si la generación falla, te devolvemos el crédito. · {PRICING_LINK}
      </p>
    );
  }
  return (
    <p id={id} className={cls}>
      Cada plan nuevo o repaso con IA usa 1 crédito. Tienes{" "}
      <strong className="font-semibold text-text-primary">{balance.total} {balance.total === 1 ? "crédito" : "créditos"}</strong>.
    </p>
  );
}

/** Why a paid button is disabled; the button points at it with aria-describedby. */
export function NoCreditsReason({ id }: { id: string }) {
  return (
    <p id={id} className="text-sm text-text-muted">
      Sin créditos. {PRICING_LINK} para recargar.
    </p>
  );
}
