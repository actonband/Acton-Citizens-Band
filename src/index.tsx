import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/public/PublicApp";

const rootElement = document.getElementById("root");

if (rootElement != null) {
  const root = createRoot(rootElement!);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
