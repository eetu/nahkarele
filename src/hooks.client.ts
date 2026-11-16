import type { ClientInit } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import { cookieStart } from "$lib/office/keep";

/** A visitor arriving at the front page with friday in its cookie goes straight to friday. The
 *  address is changed before the router reads it, so it is only on arriving: EXIT's link to the
 *  front page is not sent back while the cookie it forgets is still on its way out. */
export const init: ClientInit = () => {
  if (location.pathname === resolve("/") && cookieStart(document.cookie) !== null) {
    history.replaceState(history.state, "", resolve("/specialist"));
  }
};
