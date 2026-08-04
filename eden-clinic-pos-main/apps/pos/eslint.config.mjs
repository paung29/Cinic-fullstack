import { defineConfig, globalIgnores } from 'eslint/config';
import nextTypeScript from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';

const moduleNames = ['auth', 'sale', 'calendar', 'patients', 'inventory', 'analytics', 'hub', 'setup'];
const browserGlobals = ['window', 'document', 'indexedDB', 'localStorage', 'sessionStorage'];

const moduleBoundaryConfig = moduleNames.map((moduleName) => {
  const group = moduleNames
    .filter((otherModule) => otherModule !== moduleName)
    .flatMap((otherModule) => [
      `@/modules/${otherModule}`,
      `@/modules/${otherModule}/**`,
      `../${otherModule}`,
      `../${otherModule}/**`,
      `../../modules/${otherModule}`,
      `../../modules/${otherModule}/**`,
    ]);
  // no-restricted-imports schema: each pattern object takes group as an ARRAY of gitignore-style strings.
  const patterns = [
    { group, message: 'Feature modules may communicate only through the data layer.' },
  ];

  return {
    files: [`src/modules/${moduleName}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', { patterns }],
    },
  };
});

const lawSixSelectors = browserGlobals.flatMap((name) => [
  {
    selector: `Program > VariableDeclaration Identifier[name="${name}"]`,
    message: `LAW-6: ${name} cannot be read at module scope. Use an effect, handler, or data function.`,
  },
  {
    selector: `Program > ExportNamedDeclaration > VariableDeclaration Identifier[name="${name}"]`,
    message: `LAW-6: ${name} cannot be read at module scope. Use an effect, handler, or data function.`,
  },
  {
    selector: `Program > ExpressionStatement Identifier[name="${name}"]`,
    message: `LAW-6: ${name} cannot be read at module scope. Use an effect, handler, or data function.`,
  },
]);

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores(['.next/**', 'node_modules/**', 'out/**', 'playwright-report/**', 'test-results/**']),
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...lawSixSelectors],
    },
  },
  ...moduleBoundaryConfig,
]);
