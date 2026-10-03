import { error } from "@sveltejs/kit";

/** The workbench is a development tool: a production build answers 404. */
export const load = () => {
  if (!import.meta.env.DEV) error(404, "not found");
};
