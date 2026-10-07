# Sutuy

**Encuentra, reduce y reproduce errores causados por los límites de los fragmentos de un stream.**

Un fragmento puede terminar en medio de `🌊`, de un registro JSON o del delimitador
de un evento SSE. Sutuy prueba tu consumidor con distintas divisiones de los mismos
bytes y reduce las divisiones necesarias para reproducir un error. El resultado se
puede guardar como JSON y usar en una prueba de regresión.

Estado: versión 0.1.0 en desarrollo, todavía sin publicar. Repositorio:
[keynertyc/sutuy](https://github.com/keynertyc/sutuy). La disponibilidad del nombre
en npm se confirmará antes de la publicación.

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

Sin dependencias en tiempo de ejecución. Node 22.12 o posterior. TypeScript estricto.
En este proyecto: `pnpm install`, `pnpm check` y `pnpm demo`.

Consulta el [README principal](./README.md), la [API](./docs/api.md), las
[garantías y límites](./docs/semantics.md) y los [ejemplos](./examples/README.md).
