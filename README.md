# CrashDetector — Reconstructor forense de accidentes de tránsito

Proyecto de simulación de FUN-18 Física I (Universidad CENFOTEC, III cuatrimestre 2026).
Autores: Kai Leiva Chavarria, Josué Morales Quirós, Paz Naranjo Bonilla.

CrashDetector estima la rapidez de dos vehículos que chocan en una intersección perpendicular a partir de
la evidencia física: masas, marcas de frenado previas al impacto, distancias de deslizamiento posteriores,
ángulos de salida, intervalo del coeficiente de fricción y límites legales. Trabaja hacia atrás
(reposo final → rapidez post-impacto → conservación del momento → rapidez en el impacto → rapidez al inicio
del frenado), propaga la incertidumbre de μ y anima el escenario resultante con gráficas en tiempo real.

> Es una **estimación educativa** basada en las entradas y en las hipótesis del modelo. No es un dictamen
> pericial ni sustituye el criterio de un profesional.

## Tecnologías

- JavaScript (módulos ES) para la lógica física, sin dependencias.
- HTML, CSS y JavaScript para la interfaz; Canvas 2D para la animación.
- Chart.js 4.4.1 (desde CDN jsDelivr) para las gráficas.
- Node.js ≥ 18 para pruebas (`node:test`) y el script headless. No hay dependencias npm.
- Git/GitHub para versiones y Netlify para el despliegue (`netlify.toml`).

## Estructura

```
src/physics/crash.js   Librería física (sin DOM, determinista, unidades SI)
tests/physics.test.js  Pruebas automatizadas (node:test)
scripts/headless.js    Escenario fijo sin interfaz → output/simulacion.csv
scripts/serve.js       Servidor estático mínimo para desarrollo local
index.html, ui/        Interfaz (formulario, Canvas, Chart.js)
netlify.toml           Configuración de despliegue
```

## Modelo físico

**Ejes** (Avance 1): origen en el punto de impacto; antes del choque A circula en +X y B en +Y. Los ángulos
de salida θ se miden en grados desde +X, en sentido antihorario.

1. **Deslizamiento post-impacto** (trabajo-energía, fricción cinética constante):
   `u = sqrt(2·μ·g·d_post)`.
2. **Conservación del momento** durante el choque, por componentes:
   - X: `mA·vA = mA·uA·cos θA + mB·uB·cos θB`
   - Y: `mB·vB = mA·uA·sin θA + mB·uB·sin θB`

   **Identificabilidad:** como las direcciones previas son conocidas (A sólo tiene componente X y B sólo
   componente Y), hay 2 ecuaciones lineales independientes y 2 incógnitas (vA, vB): la solución es única.
   Si el resultado da una rapidez negativa, los datos contradicen las direcciones supuestas y la aplicación
   lo informa como error en lugar de inventar un valor. Si ambas `d_post` son 0, no hay momento posterior y
   se informa "datos insuficientes".
3. **Frenado previo**: la velocidad inferida del deslizamiento posterior **no** es la previa al choque. La
   rapidez al inicio de las marcas es `v0 = sqrt(v_impacto² + 2·μ·g·d_pre)`.
4. **Energía**: `Ek = ½·m·v²`. Se distinguen: energía cinética justo antes y justo después del choque
   (la diferencia es la energía disipada **en el choque**, y su porcentaje no depende de μ), y el trabajo de
   la fricción `μ·m·g·d` en el frenado previo y en el deslizamiento posterior.
5. **Incertidumbre**: con las demás entradas fijas, todas las rapideces son proporcionales a `sqrt(μ)`, así
   que el intervalo se obtiene exactamente evaluando `μmin` y `μmax`.
6. **Comparación con el límite**: se usa la rapidez al inicio de las marcas. "Excede" sólo si todo el
   intervalo supera el límite; "indeterminado" si el límite cae dentro del intervalo.

**Hipótesis y limitaciones:** superficie horizontal; μ constante e igual para ambos vehículos y todos los
tramos; bloqueo total de ruedas durante las marcas (sin ABS); impulso externo despreciable durante el choque;
vehículos como partículas (sin rotación); trayectorias post-impacto rectas; direcciones previas exactamente
perpendiculares. No se propaga incertidumbre de masas, distancias ni ángulos.

**Simulación hacia adelante:** con μ nominal = (μmin+μmax)/2 se integra con paso fijo `dt` (actualización
cinemática exacta para aceleración constante, deteniéndose en v = 0). Ambos vehículos llegan al origen en el
mismo instante; antes del frenado avanzan 0,5 s a rapidez constante. Sirve para animar y comprobar la
consistencia (`verificarReconstruccion`), **no** es una validación independiente porque usa las mismas
ecuaciones y datos.

## API pública (`src/physics/crash.js`)

| Función | Entradas (unidades) | Salida |
|---|---|---|
| `calcularVelocidadPorFrenado(distancia, mu, g=9.81)` | m, adim., m/s² | rapidez m/s |
| `calcularVelocidadAntesDeFrenar(vFinal, distancia, mu, g)` | m/s, m, adim., m/s² | rapidez m/s |
| `calcularMomento2D(masa, velocidad, angulo)` | kg, m/s, ° | `{px, py}` kg·m/s |
| `calcularEnergiaCinetica(masa, velocidad)` | kg, m/s | J |
| `reconstruirVelocidadesPreImpacto({mA,mB,uA,uB,thetaA,thetaB})` | kg, m/s, ° | `{vA, vB}` m/s en el impacto |
| `calcularEnergiaDisipada(energiaAntes, energiaDespues)` | J, J | `{disipada (J), porcentaje (%)}` |
| `reconstruirConMu(escenario, mu)` | escenario, adim. | uA, uB, vA, vB, v0A, v0B (m/s); energías (J); clasificación |
| `propagarIncertidumbre(escenario)` | escenario | `{min, nominal, max}` (reconstrucciones en μmin, μ medio, μmax) |
| `simularHaciaAdelante(escenario, reconstruccion, dt=0.01)` | —, —, s | `{tImpacto, muestras[]}` con t, x, y, v, px, py, Ek por vehículo |
| `verificarReconstruccion(escenario, simulacion, tol=1e-6)` | —, —, m | `{ok, errorFinalA, errorFinalB}` (m) |
| `validarEscenario(escenario)` | escenario | lanza `Error` con mensaje legible si es inválido |
| `compararConLimite(vMinKmh, vMaxKmh, limiteKmh)` | km/h | `'excede' \| 'no excede' \| 'indeterminado'` |

Cambios respecto al diseño preliminar: `reconstruirVelocidadesPreImpacto` recibe rapideces post-impacto y
ángulos (no vectores) y devuelve la rapidez **en el impacto**; la rapidez antes del frenado se calcula aparte.
`calcularEnergiaDisipada` devuelve julios y porcentaje. `verificarReconstruccion` compara las posiciones
finales simuladas con `d_post`.

**Escenario** (objeto): `mA, mB` kg [800, 3500]; `dPreA, dPreB, dPostA, dPostB` m [0, 50];
`thetaA, thetaB` ° [0, 360]; `muMin ≤ muMax` [0,40, 0,90]; `vLimA, vLimB` km/h [30, 120].

## Instalación y comandos

Requisito: Node.js 18 o superior. No hay dependencias que instalar (`npm install` no es necesario).

```bash
npm test
```

Ejecuta 11 pruebas: d = 0, frenado con valores analíticos, momento en 0°/90°/180°/270°, energía cinética,
reconstrucción de escenarios sintéticos con estado previo conocido, propagación de incertidumbre, simulación
(impacto en el origen, reposo en `d_post`, determinismo), comparación con el límite, entradas inválidas y
límites de rango. Tolerancia relativa 1e-9 (los resultados son analíticos; sólo hay redondeo de punto flotante).

```bash
npm run simulate
```

Ejecuta sin interfaz el escenario de ejemplo y escribe **`output/simulacion.csv`** (se puede pasar otra ruta:
`node scripts/headless.js otra/ruta.csv`). Devuelve código de salida 1 si algo falla. Es determinista: dos
ejecuciones producen el mismo archivo.

Escenario de ejemplo: mA = 1500 kg, mB = 1200 kg, d_preA = 12 m, d_preB = 6 m, d_postA = 14 m,
d_postB = 10 m, θA = 30°, θB = 60°, μ ∈ [0,65, 0,80], límites 50 km/h; simulado con μ = 0,725 y dt = 0,01 s.

**Formato del CSV** (coma como separador, punto decimal, una fila por paso):

| Columna | Unidad | Columna | Unidad |
|---|---|---|---|
| `t_s` | s | | |
| `xA_m`, `yA_m` | m | `xB_m`, `yB_m` | m |
| `vA_m_s` | m/s (rapidez) | `vB_m_s` | m/s |
| `pxA_kg_m_s`, `pyA_kg_m_s` | kg·m/s | `pxB_kg_m_s`, `pyB_kg_m_s` | kg·m/s |
| `EkA_J` | J | `EkB_J` | J |

```bash
npm start
```

Inicia un servidor local en <http://localhost:8080> (los módulos ES no cargan desde `file://`).

## Repositorio y despliegue

Todavía **no** existe repositorio remoto ni despliegue verificado. Pasos:

1. Crear un repositorio público vacío en GitHub (por ejemplo `crashdetector`).
2. En esta carpeta: `git remote add origin https://github.com/<usuario>/crashdetector.git` y `git push -u origin main`.
3. En Netlify: *Add new site → Import an existing project → GitHub*, elegir el repositorio. `netlify.toml`
   ya define publicar la raíz sin comando de compilación.
4. Abrir la URL pública, comprobar que la animación y las gráficas arrancan y anotar aquí las URL.

- Repositorio: _pendiente_
- Despliegue: _pendiente_

## Estado

**Implementado (Avance 2):** librería física separada y documentada; 11 pruebas automáticas; script headless
con CSV; interfaz con todos los parámetros del Avance 1, validación y estados (válido / datos insuficientes /
error); animación Canvas de la intersección; gráficas en tiempo real de rapidez y energía cinética vs tiempo;
intervalo de incertidumbre; comparación con límite; clasificación de la colisión.

**Pendiente para la entrega final:** informe de peritaje con explicación paso a paso y dictamen en texto;
gráficas de momento antes/después, banda de incertidumbre vs μ, trayectoria 2D estática y comparación gráfica
con el límite; propagación de incertidumbre de masas, distancias y ángulos; exportar CSV desde la interfaz;
publicar el repositorio y el despliegue en Netlify.
