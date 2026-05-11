import { redirect } from "next/navigation";

/** @deprecated Use `/charon` — kept for bookmarks and external links. */
export default function JanitorRedirectPage() {
  redirect("/charon");
}
