CrashDetector

Simulación educativa para reconstruir la rapidez de dos vehículos después de una colisión en una intersección.
El programa usa las masas, las distancias de frenado y deslizamiento, los ángulos de salida y el coeficiente de
fricción para estimar las velocidades antes del impacto. También muestra una animación y gráficas de rapidez y
energía.

> Los resultados son estimaciones basadas en el modelo y no constituyen un dictamen pericial.

Requisitos

- Node.js 18 o superior.
- No se necesitan dependencias para ejecutar las pruebas o la simulación headless.
- La interfaz usa Chart.js desde jsDelivr.

Ejecutar

```bash
npm test
```

Ejecuta las pruebas unitarias y analíticas. La tolerancia declarada para comparar resultados es `1e-9`.

```bash
npm run simulate
```

Ejecuta el escenario de ejemplo sin interfaz y crea `output/simulacion.csv`. Para usar otra ruta:

```bash
node scripts/headless.js otra-ruta.csv
```

Para abrir la aplicación localmente:

```bash
npm start
```

Luego visita <http://localhost:8080>.

ibrería física

La física está en `src/physics/crash.js`, separada de la interfaz y sin dependencias del navegador. La librería
usa unidades del Sistema Internacional: kg, m, s, m/s, radianes, J y kg·m/s. La interfaz convierte los ángulos
que se ingresan en grados y los límites de km/h a las unidades que espera el motor.

API

| Función | Recibe | Devuelve |
|---|---|---|
| `G` | — | gravedad estándar (m/s²) |
| `validarNumero(nombre, valor, min, max)` | valor y límites numéricos | valor validado o error |
| `calcularVelocidadPorFrenado(distancia, mu, g)` | distancia (m), fricción (adimensional), gravedad (m/s²) | rapidez (m/s) |
| `calcularVelocidadAntesDeFrenar(vFinal, distancia, mu, g)` | rapidez final (m/s), distancia (m), fricción y gravedad | rapidez inicial (m/s) |
| `calcularMomento2D(masa, velocidad, angulo)` | masa (kg), rapidez (m/s), ángulo (rad) | componentes `px`, `py` (kg·m/s) |
| `calcularEnergiaCinetica(masa, velocidad)` | masa (kg), rapidez (m/s) | energía (J) |
| `reconstruirVelocidadesPreImpacto(datos)` | masas (kg), rapideces post-impacto (m/s), ángulos (rad) | rapideces en el impacto (m/s) |
| `calcularEnergiaDisipada(energiaAntes, energiaDespues)` | energías (J) | energía disipada (J) y porcentaje |
| `clasificarColision(porcentajePerdido, mismoMovimientoFinal)` | porcentaje y condición de movimiento final | clasificación textual |
| `reconstruirConMu(escenario, mu, g)` | escenario, fricción y gravedad | velocidades (m/s), energías (J) y clasificación |
| `propagarIncertidumbre(escenario, g)` | escenario y gravedad | resultados mínimo, nominal y máximo |
| `simularHaciaAdelante(escenario, reconstruccion, dt, g)` | escenario, resultado reconstruido, paso de tiempo (s) y gravedad | muestras de posición (m), velocidad (m/s), momento (kg·m/s) y energía (J) |
| `verificarReconstruccion(escenario, simulacion, tolerancia)` | escenario, simulación y tolerancia (m) | resultado de verificación y errores (m) |
| `validarEscenario(escenario)` | datos del escenario en unidades SI | escenario válido o error |
| `compararConLimite(vMin, vMax, limite)` | rapideces y límite (m/s) | `'excede'`, `'no excede'` o `'indeterminado'` |
| `ESCENARIO_EJEMPLO` | — | escenario de ejemplo con valores en unidades SI |

El escenario recibe masas `mA`, `mB` en kg; distancias `dPreA`, `dPreB`, `dPostA`, `dPostB` en m; ángulos
`thetaA`, `thetaB` en rad; coeficientes `muMin`, `muMax`; y límites `vLimA`, `vLimB` en m/s.

Archivos principales

- `src/physics/crash.js`: librería física.
- `tests/physics.test.js`: pruebas de la librería.
- `scripts/headless.js`: simulación sin interfaz y generación del CSV.
- `ui/` e `index.html`: interfaz, animación y gráficas.

Estado de la entrega

Implementado: librería física, pruebas, simulación headless con CSV, formulario de parámetros, animación,
gráficas en tiempo real y estimación de incertidumbre.

Pendiente: publicar el sitio y el repositorio; agregar el dictamen y las funciones previstas para la entrega final.

- URL del sitio: Netlify
- URL del repositorio público: https://github.com/B0W3YYY/CrashDetector-Fisica
