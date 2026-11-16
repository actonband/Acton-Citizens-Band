import * as React from "react";
import { createRoot } from "react-dom/client";
import PublicApp from "./components/public/PublicApp";

const rootElement = document.getElementById("root");

// Previously issued email links returned to the public account section.
// Let the single current sign-in flow validate and consume those links.
const url = new URL(window.location.href);
if (url.searchParams.get("mode") === "signIn" && url.searchParams.has("oobCode")) {
  url.pathname = "/dashboard/";
  url.hash = "";
  window.location.replace(url.href);
} else if (rootElement != null) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <PublicApp />
    </React.StrictMode>,
  );
}
