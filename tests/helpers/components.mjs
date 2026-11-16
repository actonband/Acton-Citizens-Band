import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

// Node can execute the pure .ts tests, but React components need JSX compilation.
// Keep component loading in one place; each test supplies its own behavior fixtures.
export function loadComponent(name, dependencies = {}, globals = {}) {
  const url = new URL(`../../src/components/${name}.tsx`, import.meta.url);
  return loadSource(url, dependencies, globals);
}

export function loadSource(url, dependencies = {}, globals = {}) {
  const require = createRequire(url);
  const code = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), code)(
    (specifier) =>
      (typeof dependencies === "function" ? dependencies(specifier) : dependencies[specifier]) ??
      require(specifier),
    module,
    module.exports,
    ...Object.values(globals),
  );
  return module.exports;
}
