import { renderToString } from "react-dom/server";
import App from "../src/App";

export { bandStructuredData, site } from "../src/utils/site";

// Effects do not run during rendering. Events are fetched only by the browser.
export function render() {
  return renderToString(<App />);
}
