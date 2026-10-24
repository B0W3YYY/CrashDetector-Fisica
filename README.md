# CrashDetector

**Reconstructor forense de accidentes de tránsito** — Proyecto de simulación, FUN-18 Física I, Universidad CENFOTEC (III C 2026).

Grupo B: Kai Leiva Chavarría, Josué Morales Quirós, Paz Naranjo Bonilla.

Simulación educativa que reconstruye la rapidez de dos vehículos que chocan en una intersección. A partir de las masas,
las marcas de frenado, las distancias de deslizamiento, los ángulos de salida y el coeficiente de fricción, el motor
trabaja hacia atrás (trabajo de la fricción + conservación del momento lineal en 2D) para estimar la rapidez antes del
impacto, y luego simula hacia adelante para verificar que se reproduce la evidencia.

> Los resultados son estimaciones basadas en el modelo y no constituyen un dictamen pericial.

- **Aplicación desplegada:** https://crashdetector-fisica.netlify.app  <!-- actualizar si Netlify asigna otro nombre -->
- **Repositorio:** https://github.com/B0W3YYY/CrashDetector-Fisica

## Requisitos

- Node.js 18 o superior.
- Sin dependencias de npm: las pruebas y la simulación headless usan solo módulos nativos de Node.
- La interfaz carga Chart.js 4.4.1 desde jsDelivr (librería de graficación, permitida por la consigna).

## Comandos

| Acción | Comando |
|---|---|
| Instalar dependencias | `npm install` (no descarga nada; el proyecto no tiene dependencias) |
| Correr las pruebas | `npm test` |
| Ejecución headless (CSV) | `npm run simulate` → crea `output/simulacion.csv` |
| Headless con otra ruta | `node scripts/headless.js otra-ruta.csv` |
| Abrir la app localmente | `npm start` → <http://localhost:8080> |

### Ejecución headless

`npm run simulate` corre el escenario fijo `ESCENARIO_EJEMPLO` sin interfaz con `dt = 0,01 s` e imprime en consola el
intervalo de rapideces, el balance de energía y el momento total antes y después del impacto. El CSV tiene una fila por
paso de tiempo con estas columnas (todas en SI):

`t_s`, `xA_m`, `yA_m`, `vA_m_s`, `pxA_kg_m_s`, `pyA_kg_m_s`, `EkA_J`, las mismas para B, `px_total_kg_m_s`,
`py_total_kg_m_s`, `Ek_total_J` y `fase` (`pre` / `post` impacto). Con él se puede auditar el modelo sin abrir la
interfaz: el momento total no salta en el cambio de fase y la energía solo disminuye.

## Pruebas

`npm test` ejecuta `node --test`, que corre todos los archivos `tests/*.test.js`:

- `tests/physics.test.js` — pruebas unitarias de cada función, entradas inválidas, rangos y determinismo.
- `tests/validacion-analitica.test.js` — validación contra soluciones exactas conocidas:

| # | Escenario | Fórmula cerrada | Tolerancia |
|---|---|---|---|
| 1 | Distancia de frenado | d = v² / (2μg) | 1e-9 relativa |
| 2 | Tiempo de frenado | t = v / (μg) | un paso dt (resolución de muestreo) |
| 3 | Choque perfectamente inelástico perpendicular | u = √((mA·vA)² + (mB·vB)²) / (mA + mB) | 1e-9 relativa |
| 4 | Conservación del momento en el impacto | Σp antes = Σp después (X y Y) | 1e-9; en la simulación muestreada (mA+mB)·μ·g·dt |
| 5 | Teorema trabajo–energía | Ek inicial = W fricción previa + pérdida en choque + W fricción posterior | 1e-9 relativa |
| 6 | Sistema sin disipación durante 10 s | Ek(t) = Ek(0) | 1 % (criterio de la consigna) |
| 7 | Escalamiento con μ | v ∝ √μ | 1e-9 relativa |
| — | Casos límite | dPre = 0, vehículo detenido tras el choque, μ = 0,40 y 0,90 | 1e-9 relativa |

**Justificación de las tolerancias:** las fórmulas cerradas y el motor hacen las mismas operaciones en distinto
orden, por lo que solo difieren por redondeo de punto flotante (~1e-15); 1e-9 deja margen sin ocultar errores de
modelo, que serían del orden de 1e-2. Los eventos que la simulación solo puede ubicar entre muestras se comparan con
una tolerancia de un paso `dt` o del impulso de fricción de un paso.

## Librería de física

Toda la física vive en `src/physics/crash.js`. No usa `document`, `window`, `canvas` ni `requestAnimationFrame`: si
se borra `ui/`, la librería y sus pruebas siguen funcionando. Las funciones son puras y deterministas (mismo estado y
mismo `dt` ⇒ misma salida; no hay aleatoriedad). Todo está en unidades SI: kg, m, s, m/s, rad, J y kg·m/s. La
interfaz convierte los ángulos de grados a radianes y los límites de km/h a m/s.

**Convención de ejes:** origen en el punto de impacto; A circula en +X y B en +Y antes del choque; los ángulos de
salida se miden desde +X en sentido antihorario.

### API pública

| Función | Recibe | Devuelve |
|---|---|---|
| `G` | — | gravedad estándar, 9,81 m/s² |
| `validarNumero(nombre, valor, min, max)` | valor y límites | el valor, o lanza `Error` si no es finito o está fuera de rango |
| `calcularVelocidadPorFrenado(distancia, mu, g)` | distancia (m), μ (adim.), g (m/s²) | rapidez inicial para detenerse en esa distancia, √(2μgd) (m/s) |
| `calcularVelocidadAntesDeFrenar(vFinal, distancia, mu, g)` | rapidez final (m/s), distancia (m), μ, g (m/s²) | rapidez al inicio de la frenada, √(vf² + 2μgd) (m/s) |
| `calcularMomento2D(masa, velocidad, angulo)` | masa (kg), rapidez (m/s), ángulo (rad) | `{ px, py }` (kg·m/s) |
| `calcularEnergiaCinetica(masa, velocidad)` | masa (kg), rapidez (m/s) | ½mv² (J) |
| `reconstruirVelocidadesPreImpacto({ mA, mB, uA, uB, thetaA, thetaB })` | masas (kg), rapideces post-impacto (m/s), ángulos (rad) | `{ vA, vB }` en el impacto (m/s) |
| `calcularEnergiaDisipada(energiaAntes, energiaDespues)` | energías (J) | `{ disipada (J), porcentaje (%) }` |
| `clasificarColision(porcentajePerdido, mismoMovimientoFinal)` | % perdido, booleano | texto: elástica / inelástica / perfectamente inelástica |
| `validarEscenario(escenario)` | escenario en SI | el escenario, o lanza `Error` con mensaje legible |
| `reconstruirConMu(escenario, mu, g)` | escenario, μ, g (m/s²) | `uA, uB, vA, vB, v0A, v0B` (m/s); `ekInicial, ekImpactoAntes, ekImpactoDespues, energiaDisipadaChoque, energiaFriccionPre, energiaFriccionPost` (J); `porcentajeDisipadoChoque` (%); `clasificacion` |
| `propagarIncertidumbre(escenario, g)` | escenario, g | `{ min, nominal, max }`: reconstrucciones con μmin, (μmin+μmax)/2 y μmax |
| `compararConLimite(vMin, vMax, limite)` | rapideces y límite (m/s) | `'excede'`, `'no excede'` o `'indeterminado'` |
| `simularHaciaAdelante(escenario, reconstruccion, dt, g, tPrevio)` | escenario, resultado de `reconstruirConMu`, dt (s, por defecto 0,01), g, tPrevio (s de marcha libre, por defecto 0,5) | `{ tImpacto (s), muestras }`; cada muestra: `t` (s), `xA, yA, xB, yB` (m), `vA, vB` (m/s), `pxA, pyA, pxB, pyB` (kg·m/s), `ekA, ekB` (J) |
| `verificarReconstruccion(escenario, simulacion, tolerancia)` | escenario, simulación, tolerancia (m) | `{ ok, errorFinalA, errorFinalB }` (m) |
| `ESCENARIO_EJEMPLO` | — | escenario de ejemplo en SI |

**Escenario:** `mA`, `mB` (kg, 800–3500); `dPreA`, `dPreB`, `dPostA`, `dPostB` (m, 0–50); `thetaA`, `thetaB`
(rad, 0–2π); `muMin ≤ muMax` (0,40–0,90); `vLimA`, `vLimB` (m/s, equivalentes a 30–120 km/h).

## Interfaz

- Formulario con los 12 parámetros declarados en el Avance 1 y vista previa de la trayectoria al editar.
- Botón **Iniciar simulación**: animación de la intersección en Canvas (vista superior, a escala).
- Gráficas en tiempo real con ejes y unidades: rapidez vs tiempo, energía cinética vs tiempo y cantidad de
  movimiento del sistema vs tiempo (con la línea del instante de impacto).
- Gráfica de banda de incertidumbre (μmin–μmax) contra el límite legal de cada vía.
- Tabla de resultados con intervalos, comparación con el límite, energía disipada y clasificación de la colisión.

## Archivos

```
src/physics/crash.js              librería de física (sin dependencias del navegador)
tests/physics.test.js             pruebas unitarias
tests/validacion-analitica.test.js  pruebas de validación analítica
scripts/headless.js               ejecución sin interfaz → CSV
scripts/serve.js                  servidor estático local
index.html, ui/                   interfaz, animación y gráficas
netlify.toml                      configuración de despliegue (sitio estático, sin build)
```

## Estado (Avance 2)

**Implementado:** librería de física separada y documentada; 19 pruebas (7 de validación analítica + casos
límite); ejecución headless con CSV auditable; aplicación con parámetros ajustables, animación y 4 gráficas
(3 en tiempo real); propagación de incertidumbre de μ y comparación con el límite legal.

**Pendiente para la Entrega Final:** informe de peritaje (dictamen) exportable a PDF; gráfica de vectores de momento
antes y después del impacto; incertidumbre en masas, distancias y ángulos; mensajes de ayuda en el formulario.
