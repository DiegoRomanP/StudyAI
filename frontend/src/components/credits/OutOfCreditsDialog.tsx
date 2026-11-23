import { Dialog } from "../Dialog";
import { Button, ButtonLink } from "../ui";
import { PRICING_PATH } from "./CreditNotice";

/** Opened by a 402 INSUFFICIENT_CREDITS. Useful even before the pricing page exists. */
export function OutOfCreditsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Te quedaste sin créditos"
      description="Cada plan nuevo o repaso con IA usa 1 crédito. Tu material y tus metas siguen intactos; puedes seguir estudiando lo que ya tienes."
    >
      <ButtonLink to={PRICING_PATH}>Ver precios y recargar</ButtonLink>
      <Button type="button" variant="ghost" onClick={onClose}>
        Ahora no
      </Button>
    </Dialog>
  );
}
