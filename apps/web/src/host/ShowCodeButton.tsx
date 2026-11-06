import { EyeOff, QrCode } from "lucide-react";
import { Button, useRoom, useT, useToast } from "@karaoke-tube/ui";
import { useJoinShown } from "../useJoinShown";

/**
 * "Show code on TV" for a while; while that is on, the same button says "Hide code" and ends it. Hiding only ends this
 * temporary showing: the "Join info" setting keeps doing what it does (with "Always" the code stays on the TV).
 */
export function ShowCodeButton({ label, toastOnShow = true, disabled, title }: { label: string; toastOnShow?: boolean; disabled?: boolean; title?: string }) {
  const { state, send } = useRoom();
  const t = useT();
  const toast = useToast();
  const shown = useJoinShown(state?.joinShownUntil);
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={shown ? <EyeOff size={16} /> : <QrCode size={16} />}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (shown) return send({ type: "hide_join" });
        send({ type: "show_join" });
        if (toastOnShow) toast.show(t("host.showCodeToast"));
      }}
    >
      {shown ? t("host.hideCode") : label}
    </Button>
  );
}
