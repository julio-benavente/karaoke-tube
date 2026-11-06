import { useEffect, useState } from "react";

/** True once `on` has been true for `ms` without a break; false again as soon as it stops. */
export function useAfter(on: boolean, ms: number): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!on) {
      setV(false);
      return;
    }
    const id = setTimeout(() => setV(true), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return v;
}
