import { Spinner } from "@karaoke-tube/ui";
import css from "./PageLoading.module.css";

/** Loading screen for a complete page (a route still downloading): a spinner centered on the screen. */
export function PageLoading() {
  return (
    <div className={css.page}>
      <Spinner />
    </div>
  );
}
