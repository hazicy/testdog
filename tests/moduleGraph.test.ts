import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('keeps the production module graph free of runtime import cycles', () => {
  const root = process.cwd();
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const projects = [
    'apps/web',
    'apps/worker',
    'packages/contracts',
    'packages/engine',
    'packages/server',
  ];
  const files = projects
    .flatMap((project) => {
      const directory = resolve(root, project);
      const config = ts.readConfigFile(resolve(directory, 'tsconfig.json'), ts.sys.readFile);

      return ts.parseJsonConfigFileContent(config.config, ts.sys, directory).fileNames;
    })
    .filter(
      (file) =>
        ['apps/', 'packages/'].some((directory) => file.startsWith(`${root}/${directory}`)) &&
        !file.includes('/.next/') &&
        !file.endsWith('.test.ts'),
    );

  expect(files.length).toBeGreaterThan(0);
  const graph = new Map<string, string[]>();
  const cache = ts.createModuleResolutionCache(root, (path) => path, parsed.options);

  for (const file of files) {
    const source = ts.createSourceFile(file, ts.sys.readFile(file)!, ts.ScriptTarget.Latest, true);
    const dependencies: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;

        if (
          clause?.isTypeOnly ||
          (!clause?.name &&
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.length > 0 &&
            bindings.elements.every((binding) => binding.isTypeOnly))
        )
          return;
      }

      const specifier =
        ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && !node.isTypeOnly)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined;

      if (specifier && ts.isStringLiteral(specifier)) {
        const dependency = ts.resolveModuleName(specifier.text, file, parsed.options, ts.sys, cache)
          .resolvedModule?.resolvedFileName;

        if (dependency && files.includes(dependency)) dependencies.push(dependency);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
    graph.set(file, dependencies);
  }

  const visited = new Set<string>();
  const path: string[] = [];
  const cycles: string[] = [];
  const visit = (file: string) => {
    const index = path.indexOf(file);

    if (index !== -1) {
      cycles.push([...path.slice(index), file].map((item) => relative(root, item)).join(' → '));

      return;
    }

    if (visited.has(file)) return;
    path.push(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
    path.pop();
    visited.add(file);
  };

  for (const file of files) visit(file);
  expect(cycles).toEqual([]);
});
