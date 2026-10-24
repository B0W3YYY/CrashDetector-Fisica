// CrashDetector — librería física (sin dependencias del navegador).
// Unidades SI en todas las funciones: kg, m, s, m/s, rad, J y kg·m/s.
// Convención de ejes (Avance 1): origen en el punto de impacto; A circula en +X
// antes del choque y B en +Y. Los ángulos de salida se miden desde +X en radianes,
// en sentido antihorario.

export const G = 9.81; // m/s²

/** Lanza un error si `valor` no es un número finito dentro de [min, max]. */
export function validarNumero(nombre, valor, min = -Infinity, max = Infinity) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new Error(`${nombre} debe ser un número finito.`);
  }
  if (valor < min || valor > max) {
    throw new Error(`${nombre} debe estar entre ${min} y ${max} (recibido ${valor}).`);
  }
  return valor;
}

/**
 * Rapidez inicial de un vehículo que se detiene por fricción cinética constante
 * en superficie horizontal: v = sqrt(2·mu·g·d).
 * @param {number} distancia m (>= 0)
 * @param {number} mu adimensional (> 0)
 * @param {number} [g=9.81] m/s²
 * @returns {number} rapidez en m/s
 */
export function calcularVelocidadPorFrenado(distancia, mu, g = G) {
  validarNumero('distancia', distancia, 0);
  validarNumero('mu', mu, Number.MIN_VALUE);
  validarNumero('g', g, Number.MIN_VALUE);
  return Math.sqrt(2 * mu * g * distancia);
}

/**
 * Rapidez al inicio de una frenada de longitud d que termina con rapidez vFinal:
 * v0 = sqrt(vFinal² + 2·mu·g·d).
 * @returns {number} m/s
 */
export function calcularVelocidadAntesDeFrenar(vFinal, distancia, mu, g = G) {
  validarNumero('vFinal', vFinal, 0);
  const vFrenado = calcularVelocidadPorFrenado(distancia, mu, g);
  return Math.sqrt(vFinal * vFinal + vFrenado * vFrenado);
}

/**
 * Componentes del momento lineal: px = m·v·cos(θ), py = m·v·sin(θ).
 * @param {number} masa kg (> 0)
 * @param {number} velocidad rapidez en m/s (>= 0)
 * @param {number} angulo radianes desde +X
 * @returns {{px:number, py:number}} kg·m/s
 */
export function calcularMomento2D(masa, velocidad, angulo) {
  validarNumero('masa', masa, Number.MIN_VALUE);
  validarNumero('velocidad', velocidad, 0);
  validarNumero('angulo', angulo);
  return { px: masa * velocidad * Math.cos(angulo), py: masa * velocidad * Math.sin(angulo) };
}

/**
 * Energía cinética Ek = ½·m·v².
 * @param {number} masa kg (>= 0)
 * @param {number} velocidad m/s
 * @returns {number} J
 */
export function calcularEnergiaCinetica(masa, velocidad) {
  validarNumero('masa', masa, 0);
  validarNumero('velocidad', velocidad, 0);
  return 0.5 * masa * velocidad * velocidad;
}

/**
 * Valida el escenario completo del Avance 1. Lanza Error con mensaje legible.
 * Parámetros: mA, mB (kg, 800–3500); dPreA, dPreB, dPostA, dPostB (m, 0–50);
 * thetaA, thetaB (rad, 0–2π); muMin <= muMax (0.40–0.90);
 * vLimA, vLimB (m/s, 8.333333333333334–33.333333333333336).
 */
export function validarEscenario(e) {
  if (!e || typeof e !== 'object') throw new Error('El escenario debe ser un objeto.');
  validarNumero('mA', e.mA, 800, 3500);
  validarNumero('mB', e.mB, 800, 3500);
  for (const k of ['dPreA', 'dPreB', 'dPostA', 'dPostB']) validarNumero(k, e[k], 0, 50);
  validarNumero('thetaA', e.thetaA, 0, 2 * Math.PI);
  validarNumero('thetaB', e.thetaB, 0, 2 * Math.PI);
  validarNumero('muMin', e.muMin, 0.4, 0.9);
  validarNumero('muMax', e.muMax, 0.4, 0.9);
  if (e.muMin > e.muMax) throw new Error('muMin debe ser menor o igual que muMax.');
  validarNumero('vLimA', e.vLimA, 8.333333333333334, 33.333333333333336);
  validarNumero('vLimB', e.vLimB, 8.333333333333334, 33.333333333333336);
  if (e.dPostA === 0 && e.dPostB === 0) {
    throw new Error('Ambas distancias post-impacto son 0: no hay momento posterior para reconstruir.');
  }
  return e;
}

/**
 * Resuelve la conservación del momento por componentes con las direcciones
 * pre-impacto conocidas (A en +X, B en +Y):
 *   X: mA·vA = mA·uA·cos θA + mB·uB·cos θB
 *   Y: mB·vB = mA·uA·sin θA + mB·uB·sin θB
 * Dos ecuaciones lineales, dos incógnitas (vA, vB) ⇒ solución única.
 * @param {{mA,mB,uA,uB,thetaA,thetaB}} p masas en kg, rapideces post-impacto en m/s, ángulos en rad
 * @returns {{vA:number, vB:number}} rapideces en el instante del impacto, m/s
 * @throws si alguna rapidez resulta negativa (datos incompatibles con las direcciones supuestas)
 */
export function reconstruirVelocidadesPreImpacto({ mA, mB, uA, uB, thetaA, thetaB }) {
  const a = calcularMomento2D(mA, uA, thetaA);
  const b = calcularMomento2D(mB, uB, thetaB);
  const vA = (a.px + b.px) / mA;
  const vB = (a.py + b.py) / mB;
  const tol = 1e-9;
  if (vA < -tol || vB < -tol) {
    throw new Error(
      'Datos incompatibles: el momento posterior implica que un vehículo se movía en sentido ' +
        'contrario al supuesto (A hacia +X, B hacia +Y). Revise los ángulos de salida.'
    );
  }
  return { vA: Math.max(vA, 0), vB: Math.max(vB, 0) };
}

/**
 * Energía disipada entre dos estados.
 * @param {number} energiaAntes J (> 0)
 * @param {number} energiaDespues J (>= 0)
 * @returns {{disipada:number, porcentaje:number}} J y % de energiaAntes
 */
export function calcularEnergiaDisipada(energiaAntes, energiaDespues) {
  validarNumero('energiaAntes', energiaAntes, Number.MIN_VALUE);
  validarNumero('energiaDespues', energiaDespues, 0);
  const disipada = energiaAntes - energiaDespues;
  return { disipada, porcentaje: (100 * disipada) / energiaAntes };
}

/**
 * Clasifica la colisión según la fracción de energía cinética perdida en el choque.
 * @returns {string}
 */
export function clasificarColision(porcentajePerdido, mismoMovimientoFinal) {
  if (porcentajePerdido < -1e-6) return 'Inconsistente (gana energía: revise los datos)';
  if (mismoMovimientoFinal) return 'Perfectamente inelástica (salen juntos)';
  if (porcentajePerdido < 1) return 'Aproximadamente elástica';
  return 'Inelástica';
}

/**
 * Reconstrucción completa para un único valor de mu.
 * Hacia atrás: reposo final → rapidez post-impacto (d_post) → momento → rapidez
 * en el impacto → rapidez al inicio de las marcas de frenado (d_pre).
 * @returns objeto con rapideces (m/s), energías (J) y clasificación
 */
export function reconstruirConMu(e, mu, g = G) {
  validarEscenario(e);
  validarNumero('mu', mu, 0.4, 0.9);
  validarNumero('g', g, Number.MIN_VALUE);
  const uA = calcularVelocidadPorFrenado(e.dPostA, mu, g);
  const uB = calcularVelocidadPorFrenado(e.dPostB, mu, g);
  const { vA, vB } = reconstruirVelocidadesPreImpacto({
    mA: e.mA, mB: e.mB, uA, uB, thetaA: e.thetaA, thetaB: e.thetaB,
  });
  const v0A = calcularVelocidadAntesDeFrenar(vA, e.dPreA, mu, g);
  const v0B = calcularVelocidadAntesDeFrenar(vB, e.dPreB, mu, g);
  const ekImpactoAntes = calcularEnergiaCinetica(e.mA, vA) + calcularEnergiaCinetica(e.mB, vB);
  const ekImpactoDespues = calcularEnergiaCinetica(e.mA, uA) + calcularEnergiaCinetica(e.mB, uB);
  const choque = calcularEnergiaDisipada(ekImpactoAntes, ekImpactoDespues);
  const diferenciaAngular = Math.atan2(Math.sin(e.thetaA - e.thetaB), Math.cos(e.thetaA - e.thetaB));
  const mismoFinal = Math.abs(uA - uB) < 1e-9 && Math.abs(diferenciaAngular) < 1e-9;
  return {
    mu, uA, uB, vA, vB, v0A, v0B,
    ekInicial: calcularEnergiaCinetica(e.mA, v0A) + calcularEnergiaCinetica(e.mB, v0B),
    ekImpactoAntes,
    ekImpactoDespues,
    energiaDisipadaChoque: choque.disipada,
    porcentajeDisipadoChoque: choque.porcentaje,
    // Trabajo de la fricción: W = mu·m·g·d en cada tramo.
    energiaFriccionPre: mu * g * (e.mA * e.dPreA + e.mB * e.dPreB),
    energiaFriccionPost: mu * g * (e.mA * e.dPostA + e.mB * e.dPostB),
    clasificacion: clasificarColision(choque.porcentaje, mismoFinal),
  };
}

/**
 * Propaga el intervalo [muMin, muMax]. Todas las rapideces reconstruidas son
 * proporcionales a sqrt(mu) (las demás entradas fijas), por lo que los extremos
 * del intervalo se obtienen exactamente en muMin y muMax.
 * @returns {{min, nominal, max}} reconstrucciones con mu = muMin, (muMin+muMax)/2, muMax
 */
export function propagarIncertidumbre(e, g = G) {
  validarEscenario(e);
  validarNumero('g', g, Number.MIN_VALUE);
  return {
    min: reconstruirConMu(e, e.muMin, g),
    nominal: reconstruirConMu(e, (e.muMin + e.muMax) / 2, g),
    max: reconstruirConMu(e, e.muMax, g),
  };
}

/**
 * Compara rapideces y límite legal en m/s.
 * @returns {'excede'|'no excede'|'indeterminado'} según si todo el intervalo supera o no el límite
 */
export function compararConLimite(vMin, vMax, limite) {
  validarNumero('vMin', vMin, 0);
  validarNumero('vMax', vMax, 0);
  validarNumero('limite', limite, 0);
  if (vMin > vMax) throw new Error('vMin debe ser menor o igual que vMax.');
  if (vMin > limite) return 'excede';
  if (vMax <= limite) return 'no excede';
  return 'indeterminado';
}

/** Actualización cinemática exacta para aceleración constante -mu·g que se detiene en v=0. */
function avanzarFrenado(s, v, desac, dt) {
  if (v <= 0) return { s, v: 0 };
  const tParada = v / desac;
  if (dt >= tParada) return { s: s + (v * v) / (2 * desac), v: 0 };
  return { s: s + v * dt - 0.5 * desac * dt * dt, v: v - desac * dt };
}

/**
 * Simulación hacia adelante con paso fijo dt a partir de la reconstrucción con un mu dado.
 * Fases por vehículo: velocidad constante → frenado de d_pre → impacto en el origen
 * (ambos en el mismo instante tImpacto) → deslizamiento a lo largo de θ hasta el reposo.
 * Usa las mismas ecuaciones del modelo; sirve como comprobación de consistencia,
 * no como validación independiente.
 * @param {object} e escenario validado
 * @param {object} r resultado de reconstruirConMu
 * @param {number} [dt=0.01] s
 * @returns {{tImpacto:number, muestras:Array<object>}} muestras con t (s), x,y (m), v (m/s), px,py (kg·m/s), ek (J)
 */
export function simularHaciaAdelante(e, r, dt = 0.01, g = G) {
  validarEscenario(e);
  validarNumero('mu', r.mu, 0.4, 0.9);
  for (const k of ['uA', 'uB', 'vA', 'vB', 'v0A', 'v0B']) validarNumero(k, r[k], 0);
  validarNumero('dt', dt, 1e-4, 1);
  validarNumero('g', g, Number.MIN_VALUE);
  const desac = r.mu * g;
  const tFrenA = (r.v0A - r.vA) / desac;
  const tFrenB = (r.v0B - r.vB) / desac;
  const tImpacto = Math.max(tFrenA, tFrenB) + 0.5; // 0,5 s de marcha previa visible
  const tFinA = r.uA / desac;
  const tFinB = r.uB / desac;
  const tTotal = tImpacto + Math.max(tFinA, tFinB) + 0.5;
  const pasos = Math.ceil(tTotal / dt);

  // Estado escalar a lo largo de cada eje de movimiento: s = distancia recorrida en la fase.
  const vehiculos = [
    { m: e.mA, v0: r.v0A, dPre: e.dPreA, u: r.uA, theta: e.thetaA, dir: [1, 0], tFren: tFrenA },
    { m: e.mB, v0: r.v0B, dPre: e.dPreB, u: r.uB, theta: e.thetaB, dir: [0, 1], tFren: tFrenB },
  ].map((veh) => ({ ...veh, fase: 'pre', s: 0, v: veh.v0 }));

  // Posición inicial: retroceder d_pre + tramo a velocidad constante.
  for (const veh of vehiculos) {
    veh.inicio = -(veh.dPre + veh.v0 * (tImpacto - veh.tFren));
  }

  const muestras = [];
  for (let i = 0; i <= pasos; i++) {
    const t = i * dt;
    const fila = { t };
    vehiculos.forEach((veh, k) => {
      const tLocal = t - (tImpacto - veh.tFren); // tiempo desde inicio del frenado
      let x, y, vx, vy;
      if (t < tImpacto) {
        let s, v;
        if (tLocal < 0) { s = veh.inicio + veh.v0 * t; v = veh.v0; }
        else {
          const f = avanzarFrenado(0, veh.v0, desac, tLocal);
          s = -veh.dPre + f.s; v = f.v;
        }
        x = veh.dir[0] * s; y = veh.dir[1] * s;
        vx = veh.dir[0] * v; vy = veh.dir[1] * v;
      } else {
        const f = avanzarFrenado(0, veh.u, desac, t - tImpacto);
        x = f.s * Math.cos(veh.theta); y = f.s * Math.sin(veh.theta);
        vx = f.v * Math.cos(veh.theta); vy = f.v * Math.sin(veh.theta);
      }
      const v = Math.hypot(vx, vy);
      const id = k === 0 ? 'A' : 'B';
      Object.assign(fila, {
        [`x${id}`]: x, [`y${id}`]: y, [`v${id}`]: v,
        [`px${id}`]: veh.m * vx, [`py${id}`]: veh.m * vy,
        [`ek${id}`]: calcularEnergiaCinetica(veh.m, v),
      });
    });
    muestras.push(fila);
  }
  return { tImpacto, muestras };
}

/**
 * Comprueba que la simulación reproduce la evidencia: llegada al origen en el impacto
 * y distancias post-impacto iguales a d_post (posiciones finales).
 * @returns {{ok:boolean, errorFinalA:number, errorFinalB:number}} errores en m
 */
export function verificarReconstruccion(e, simulacion, tolerancia = 1e-6) {
  const ultima = simulacion.muestras[simulacion.muestras.length - 1];
  const errorFinalA = Math.abs(Math.hypot(ultima.xA, ultima.yA) - e.dPostA);
  const errorFinalB = Math.abs(Math.hypot(ultima.xB, ultima.yB) - e.dPostB);
  return { ok: errorFinalA <= tolerancia && errorFinalB <= tolerancia, errorFinalA, errorFinalB };
}

/** Escenario de ejemplo documentado en el README (usado por el script headless y la UI). */
export const ESCENARIO_EJEMPLO = Object.freeze({
  mA: 1500, mB: 1200,
  dPreA: 12, dPreB: 6,
  dPostA: 14, dPostB: 10,
  thetaA: Math.PI / 6, thetaB: Math.PI / 3,
  muMin: 0.65, muMax: 0.8,
  vLimA: 13.88888888888889, vLimB: 13.88888888888889,
});
