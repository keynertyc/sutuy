# Sutuy

**Encuentra, reduce y reproduce errores causados por los límites de los fragmentos de un stream.**

[![Versión npm](https://img.shields.io/npm/v/sutuy)](https://www.npmjs.com/package/sutuy)
[![CI](https://github.com/keynertyc/sutuy/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/keynertyc/sutuy/actions/workflows/ci.yml)
[![Descargas npm](https://img.shields.io/npm/dm/sutuy)](https://www.npmjs.com/package/sutuy)
[![Versión de Node.js](https://img.shields.io/node/v/sutuy)](#compatibilidad-y-verificación)
[![Tipos TypeScript](https://img.shields.io/npm/types/sutuy)](./docs/api.md)
[![Licencia](https://img.shields.io/npm/l/sutuy)](./LICENSE)

Un fragmento puede terminar en medio de `🌊`, de un registro JSON o del delimitador
de un evento SSE. Sutuy prueba tu consumidor con distintas divisiones de los mismos
bytes y reduce las divisiones necesarias para reproducir un error. El resultado se
puede guardar como JSON y usar en una prueba de regresión.

[English](./README.md) · [API](./docs/api.md) · [Garantías y límites](./docs/semantics.md)
· [Integraciones](./docs/integrations.md) · [Ejemplos](./examples/README.md)

## Instalación

```sh
npm install -D sutuy
```

Requiere Node.js **22.12+**. Incluye los tipos de TypeScript y no tiene dependencias
en tiempo de ejecución. Funciona con tus aserciones y tu framework de pruebas.

## Cuándo usarlo

| Consumidor | Divisiones que conviene probar |
| --- | --- |
| Decodificador incremental de texto | Dentro de caracteres UTF-8 de varios bytes. |
| Parser de NDJSON | Dentro de un registro JSON y alrededor de los saltos de línea. |
| Parser de SSE o respuestas de un LLM | Dentro de campos, datos y delimitadores de eventos. |
| SDK basado en Fetch | Entre lecturas de un `Response.body` inyectado. |

## Uso básico

<!-- sutuy:run -->
```js
import assert from 'node:assert/strict';
import { assertStream, ndjson } from 'sutuy';

const registros = [{ mensaje: 'Hola 🌊' }];
await assertStream({
  input: ndjson(registros),
  test: async (stream) => {
    // Aquí puedes llamar a tu propio consumidor de streams.
    const texto = await new Response(stream).text();
    const resultado = texto.trim().split('\n').map(JSON.parse);
    assert.deepEqual(resultado, registros);
  },
});
```

Si la función lanza un error, Sutuy verifica que se pueda reproducir y trata de
eliminar límites innecesarios entre fragmentos. `StreamCheckError.fixture` contiene
el caso reducido. `checkStream` devuelve el resultado sin lanzar ese error de
aserción. `serializeFixture`, `parseFixture` y `replay` permiten conservar el caso.

Los valores predeterminados son hasta 100 casos, 200 intentos de reducción y
2 segundos por ejecución del consumidor. La reducción conserva todos los bytes.
Un resultado satisfactorio cubre los casos probados; no garantiza que se hayan
explorado todas las divisiones posibles. Los timeouts, las cancelaciones y los
resultados inconsistentes se reportan por separado.

## API estable

Sutuy **1.x** sigue [Semantic Versioning](https://semver.org/lang/es/): los cambios
incompatibles en la API pública documentada requieren una nueva versión mayor.
Los fixtures de versión 1 seguirán siendo legibles y reproducibles durante 1.x.

Las estrategias de generación pueden evolucionar entre versiones. Guarda el
fixture JSON para reproducir un caso a largo plazo; una semilla depende de la
versión del generador. Consulta el
[contrato de compatibilidad](./docs/semantics.md#versioning-and-compatibility).

## Compatibilidad y verificación

El [CI](https://github.com/keynertyc/sutuy/actions/workflows/ci.yml) comprueba
Node **22, 24 y 26**: pruebas con umbrales de cobertura, tipos, paquete, documentación
ejecutable y ejemplos. También instala el tarball en un consumidor aislado y verifica
ESM, `require(esm)` y las declaraciones de TypeScript.

El núcleo usa APIs web y no importa módulos de Node. Los navegadores no forman parte
de la matriz automatizada. Para desarrollar el paquete, usa Node 24 y pnpm 12.9.1:
`pnpm install --frozen-lockfile`, `pnpm check` y `pnpm demo`.

Consulta la [guía para contribuir](./CONTRIBUTING.md) y el
[proceso de publicación](./docs/releasing.md). Puedes reportar errores reproducibles
en [GitHub](https://github.com/keynertyc/sutuy/issues), indicando la versión de Sutuy
y un fixture sintético que reproduzca el problema.

MIT © Keyner
