import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = resolve(root, "src");
const outDir = resolve(root, "dist");

const opentui = import.meta.resolve("@opentui/solid");
const { transformSolidSource } = await import(
  new URL("./scripts/solid-transform.js", opentui)
);

const isJsxFile = (file) =>
  [".jsx", ".tsx"].includes(extname(file)) &&
  !file.endsWith(".d.tsx") &&
  !/\.(test|spec)\.[jt]sx$/.test(file);

const fileExists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

// Write only when the content differs, so unchanged files keep their mtime
// and do not retrigger the TypeScript watcher.
const writeIfChanged = async (path, content) => {
  const previous = await readFile(path, "utf8").catch(() => null);
  if (previous === content) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return true;
};

// Rewrite relative imports like "./foo.tsx" / "./foo.jsx" to "./foo.js"
const rewriteSpecifiers = (code) =>
  code.replace(
    /(from\s+|import\s*\(\s*|import\s+)(["'])(\.{1,2}\/[^"']+?)\.[jt]sx\2/g,
    "$1$2$3.js$2",
  );

const entries = await readdir(srcDir, { recursive: true });
const files = entries.filter(isJsxFile).sort();

if (files.length === 0) {
  console.warn(`No .jsx/.tsx files found in ${relative(root, srcDir)}`);
}

let changedCount = 0;

await Promise.all(
  files.map(async (file) => {
    const source = join(srcDir, file);
    const output = join(outDir, file.replace(/\.[jt]sx$/, ".js"));

    const code = await readFile(source, "utf8");
    const transformed = await transformSolidSource(code, { filename: source });

    const changed = await writeIfChanged(
      output,
      rewriteSpecifiers(transformed),
    );

    // await rm(output.replace(/\.js$/, ".jsx"), { force: true });
    await rm(`${output}.map`, { force: true });

    if (changed) {
      changedCount++;
      console.log(`✓ ${relative(root, source)} → ${relative(root, output)}`);
    }
  }),
);

// Root entry files that re-export the default export from dist/
for (const name of ["index", "tui"]) {
  const built = join(outDir, `${name}.js`);
  if (!(await fileExists(built))) continue;

  const wrapper = join(root, `${name}.js`);
  const changed = await writeIfChanged(
    wrapper,
    `export { default } from "./dist/${name}";`,
  );

  if (changed) {
    changedCount++;
    console.log(`✓ ${name}.js → ./dist/${name}`);
  }
}

console.log(
  changedCount > 0
    ? `Done: ${changedCount} file(s) written.`
    : "Done: no changes.",
);
