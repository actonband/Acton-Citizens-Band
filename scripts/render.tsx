import { renderToString } from "react-dom/server";
import PublicApp from "../src/components/public/PublicApp";

export { bandStructuredData, site } from "../src/utils/site";

// Effects do not run during rendering. Events are fetched only by the browser.
export function render() {
  return renderToString(<PublicApp />);
}
