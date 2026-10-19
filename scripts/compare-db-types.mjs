// Compares two generated Supabase type files structurally (not as text): the
// local generator (`supabase gen types --local`, CI) and the hosted one
// (MCP / `db:types:linked`) format the same schema differently.
//
//   node scripts/compare-db-types.mjs <committed.ts> <generated.ts>
//
// Walks Database["public"] (Tables, Views, Functions, Enums, CompositeTypes)
// with the TypeScript compiler and prints only what differs, entry by entry,
// so a mismatch says exactly which table or function to look at. Exit code 1
// on any difference. `__InternalSupabase` (API version metadata) is ignored.
import ts from "typescript";

const [committedPath, generatedPath] = process.argv.slice(2);
if (!committedPath || !generatedPath) {
  console.error("usage: node scripts/compare-db-types.mjs <committed.ts> <generated.ts>");
  process.exit(2);
}

const program = ts.createProgram([committedPath, generatedPath], {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
});
const checker = program.getTypeChecker();
const flags = ts.TypeFormatFlags.NoTruncation;

function databaseOf(path) {
  const file = program.getSourceFile(path);
  if (!file) throw new Error(`cannot read ${path}`);
  const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(file));
  const symbol = exports.find((s) => s.name === "Database");
  if (!symbol) throw new Error(`${path} exports no Database type`);
  return checker.getDeclaredTypeOfSymbol(symbol);
}

const prop = (type, name) => {
  const symbol = type.getProperty(name);
  return symbol ? { type: checker.getTypeOfSymbol(symbol), optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0 } : null;
};
const isPlainObject = (type) =>
  (type.flags & ts.TypeFlags.Object) !== 0 && !checker.isArrayType(type) && !checker.isTupleType(type) &&
  type.getCallSignatures().length === 0;
// The two files each declare their own `Json`: drop the file part of names.
const text = (type) => checker.typeToString(type, undefined, flags).replace(/import\("[^"]*"\)\./g, "");
// Unions print in a stable but arbitrary order: compare their members as a set.
const normalized = (type) =>
  type.isUnion() ? type.types.map(normalized).sort().join(" | ") : text(type);

const differences = [];

function compare(a, b, path) {
  if (isPlainObject(a) && isPlainObject(b)) {
    const names = new Set([...a.getProperties(), ...b.getProperties()].map((p) => p.name));
    for (const name of [...names].sort()) {
      const left = prop(a, name);
      const right = prop(b, name);
      if (!left || !right) {
        differences.push(`${path}.${name}: only in ${left ? "the committed file" : "the generated file"}`);
        continue;
      }
      if (left.optional !== right.optional) {
        differences.push(`${path}.${name}: ${left.optional ? "optional" : "required"} in the committed file, ` +
          `${right.optional ? "optional" : "required"} in the generated one`);
      }
      compare(left.type, right.type, `${path}.${name}`);
    }
    return;
  }
  const left = normalized(a);
  const right = normalized(b);
  if (left !== right) differences.push(`${path}:\n    committed: ${left}\n    generated: ${right}`);
}

const committed = prop(databaseOf(committedPath), "public");
const generated = prop(databaseOf(generatedPath), "public");
if (!committed || !generated) {
  console.error("One of the files has no public schema.");
  process.exit(1);
}
compare(committed.type, generated.type, "public");

if (differences.length) {
  console.log(`${differences.length} difference(s) between ${committedPath} and ${generatedPath}:`);
  for (const d of differences) console.log(`  - ${d}`);
  process.exitCode = 1;
} else {
  console.log("The Database types match.");
}
