import { useEffect, useRef } from "react";
import { useRoom, useT, useToast } from "@karaoke-tube/ui";

/** Tells you when your role changes under you: standing in as host while the host is away, and the handover back. */
export function useRoleToast() {
  const { state, me } = useRoom();
  const toast = useToast();
  const t = useT();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const role = me?.role ?? null;
    const before = prev.current;
    prev.current = role;
    if (!role || !before || role === before) return;
    if (role === "host") {
      toast.show(t("role.nowTempHost"), { duration: 8000 });
    } else if (before === "host") {
      toast.show(t("role.hostBack", { name: state?.members.find((m) => m.role === "host")?.nickname ?? "" }), { duration: 7000 });
    } else if (role === "cohost") {
      toast.show(t("role.nowCohost"), { duration: 5000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role]);
}
