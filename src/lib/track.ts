// How far a visitor got, as named events in the site's Liwan when nginx put its tracker on the
// page (docker/40-liwan-tracker.sh); nothing otherwise. Liwan's bounce rate counts page views
// only, so a whole week played on one page reads as a bounce; these tell the two apart.

export type Tracker = { event: (name: string) => Promise<void> };

/** The tracker on the page, if any: imported from its own URL, so it is the module already
 *  loaded there, set up and at the server's version. */
const onPage = async (): Promise<Tracker | null> => {
  if (typeof document === "undefined") return null;
  const tag = document.querySelector<HTMLScriptElement>("script[src][data-entity]");
  return tag ? ((await import(/* @vite-ignore */ tag.src)) as Tracker) : null;
};

const sent = new Set<string>();

/** Report `name`, once a visit. */
export const track = (name: string, tracker: () => Promise<Tracker | null> = onPage) => {
  if (sent.has(name)) return;
  sent.add(name);
  tracker()
    .then((t) => t?.event(name))
    .catch(() => {});
};
