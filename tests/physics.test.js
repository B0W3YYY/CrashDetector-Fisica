import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  G, calcularVelocidadPorFrenado, calcularVelocidadAntesDeFrenar, calcularMomento2D,
  calcularEnergiaCinetica, reconstruirVelocidadesPreImpacto, calcularEnergiaDisipada,
  reconstruirConMu, propagarIncertidumbre, simularHaciaAdelante, verificarReconstruccion,
  validarEscenario, compararConLimite, ESCENARIO_EJEMPLO,
} from '../src/physics/crash.js';

// Tolerancia: los resultados analíticos son exactos salvo redondeo de punto
// flotante (~1e-15 relativo); 1e-9 deja margen amplio sin ocultar errores reales.
const TOL = 1e-9;
const cerca = (a, b, tol = TOL) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);

test('d = 0 ⇒ rapidez por frenado nula', () => {
  assert.equal(calcularVelocidadPorFrenado(0, 0.7), 0);
});

test('frenado con datos conocidos: mu=0.5, g=9.81, d=10 ⇒ v = sqrt(98.1)', () => {
  cerca(calcularVelocidadPorFrenado(10, 0.5, 9.81), Math.sqrt(98.1));
  // Caso con resultado redondo: mu=0.8, g=10, d=40 ⇒ v = sqrt(640) = 25.298...
  cerca(calcularVelocidadPorFrenado(40, 0.8, 10), Math.sqrt(640));
  // v0 tras frenar desde 20 m/s: 20² - 0² = 2·0.5·10·d ⇒ d=40 → v0(0, 40) = 20
  cerca(calcularVelocidadAntesDeFrenar(0, 40, 0.5, 10), 20);
  cerca(calcularVelocidadAntesDeFrenar(15, 0, 0.5, 10), 15);
});

test('momento 2D en 0°, 90°, 180°, 270°', () => {
  const casos = [[0, 1000, 0], [90, 0, 1000], [180, -1000, 0], [270, 0, -1000]];
  for (const [ang, px, py] of casos) {
    const p = calcularMomento2D(100, 10, (ang * Math.PI) / 180);
    cerca(p.px, px, 1e-12); cerca(p.py, py, 1e-12);
  }
  const p45 = calcularMomento2D(2, 3, Math.PI / 4);
  cerca(p45.px, 6 / Math.SQRT2); cerca(p45.py, 6 / Math.SQRT2);
});

test('energía cinética = ½ m v²', () => {
  assert.equal(calcularEnergiaCinetica(1000, 20), 200000);
  assert.equal(calcularEnergiaCinetica(1500, 0), 0);
  assert.throws(() => calcularEnergiaCinetica(1000, -1), /velocidad/);
});

test('reconstrucción de escenario sintético perfectamente inelástico', () => {
  // A: 1000 kg a 20 m/s (+X); B: 1000 kg a 20 m/s (+Y). Salen juntos a (10,10) m/s.
  const u = Math.hypot(10, 10);
  const r = reconstruirVelocidadesPreImpacto({ mA: 1000, mB: 1000, uA: u, uB: u, thetaA: Math.PI / 4, thetaB: Math.PI / 4 });
  cerca(r.vA, 20); cerca(r.vB, 20);
  // Energía: antes 400 kJ, después 200 kJ ⇒ 50 % disipado.
  const e = calcularEnergiaDisipada(400000, calcularEnergiaCinetica(2000, u));
  cerca(e.disipada, 200000); cerca(e.porcentaje, 50);
});

test('reconstrucción completa: evidencia generada desde un estado conocido', () => {
  // Estado verdadero elegido: vA=15, vB=14 en el impacto; salida uA a 30°, uB a 60°.
  const mu = 0.7, mA = 1500, mB = 1200;
  const thetaA = Math.PI / 6, thetaB = Math.PI / 3;
  const c = Math.cos, s = Math.sin;
  // Resolver uA, uB del sistema lineal 2x2 de momento.
  const det = mA * c(thetaA) * mB * s(thetaB) - mB * c(thetaB) * mA * s(thetaA);
  const uA = (mA * 15 * mB * s(thetaB) - mB * c(thetaB) * mB * 14) / det;
  const uB = (mA * c(thetaA) * mB * 14 - mA * s(thetaA) * mA * 15) / det;
  const dPost = (u) => (u * u) / (2 * mu * G);
  const v0A = 20, v0B = 16; // rapidez al empezar a frenar
  const dPre = (v0, v) => (v0 * v0 - v * v) / (2 * mu * G);
  const esc = { mA, mB, thetaA, thetaB, dPostA: dPost(uA), dPostB: dPost(uB),
    dPreA: dPre(v0A, 15), dPreB: dPre(v0B, 14), muMin: mu, muMax: mu, vLimA: 50 / 3.6, vLimB: 50 / 3.6 };
  validarEscenario(esc);
  const r = reconstruirConMu(esc, mu);
  cerca(r.vA, 15); cerca(r.vB, 14); cerca(r.v0A, 20); cerca(r.v0B, 16);
});

test('incertidumbre: intervalo ordenado, extremos en muMin y muMax, escala con sqrt(mu)', () => {
  const inc = propagarIncertidumbre(ESCENARIO_EJEMPLO);
  for (const k of ['vA', 'vB', 'v0A', 'v0B']) {
    assert.ok(inc.min[k] <= inc.nominal[k] && inc.nominal[k] <= inc.max[k]);
    cerca(inc.max[k] / inc.min[k], Math.sqrt(ESCENARIO_EJEMPLO.muMax / ESCENARIO_EJEMPLO.muMin));
  }
  const igual = propagarIncertidumbre({ ...ESCENARIO_EJEMPLO, muMin: 0.7, muMax: 0.7 });
  cerca(igual.min.vA, igual.max.vA);
});

test('simulación hacia adelante: impacto en el origen y reposo a d_post', () => {
  const r = reconstruirConMu(ESCENARIO_EJEMPLO, 0.7);
  const sim = simularHaciaAdelante(ESCENARIO_EJEMPLO, r, 0.01);
  assert.ok(verificarReconstruccion(ESCENARIO_EJEMPLO, sim).ok);
  const i = Math.round(sim.tImpacto / 0.01);
  const antes = sim.muestras[i - 1];
  // Justo antes del impacto, A está a menos de vA·dt del origen sobre el eje X.
  assert.ok(Math.abs(antes.xA) <= r.v0A * 0.01 + 1e-9 && antes.yA === 0);
  // Determinismo: misma entrada y mismo dt ⇒ misma salida.
  assert.deepEqual(simularHaciaAdelante(ESCENARIO_EJEMPLO, r, 0.01), sim);
  // La energía nunca aumenta durante el frenado/deslizamiento de un vehículo.
  const tras = sim.muestras.slice(i);
  for (let k = 1; k < tras.length; k++) assert.ok(tras[k].ekA <= tras[k - 1].ekA + 1e-9);
});

test('validación analítica: distancia de parada coincide con v²/(2μg)', () => {
  const mu = 0.7, v = 18, g = 9.81;
  const distanciaExacta = (v * v) / (2 * mu * g);
  const escenario = {
    ...ESCENARIO_EJEMPLO,
    dPreA: 0, dPreB: 0,
    dPostA: distanciaExacta, dPostB: 0,
    thetaA: 0, thetaB: Math.PI / 2,
    muMin: mu, muMax: mu,
  };
  const reconstruccion = reconstruirConMu(escenario, mu, g);
  const simulacion = simularHaciaAdelante(escenario, reconstruccion, 0.01, g);
  assert.ok(verificarReconstruccion(escenario, simulacion).ok);
  cerca(Math.hypot(
    simulacion.muestras.at(-1).xA,
    simulacion.muestras.at(-1).yA,
  ), (reconstruccion.uA ** 2) / (2 * mu * g));
});

test('comparación con límite legal', () => {
  assert.equal(compararConLimite(60 / 3.6, 70 / 3.6, 50 / 3.6), 'excede');
  assert.equal(compararConLimite(30 / 3.6, 50 / 3.6, 50 / 3.6), 'no excede');
  assert.equal(compararConLimite(45 / 3.6, 55 / 3.6, 50 / 3.6), 'indeterminado');
  assert.throws(() => compararConLimite(10, 5, 7), /vMin/);
});

test('entradas inválidas generan errores', () => {
  assert.throws(() => calcularVelocidadPorFrenado(-1, 0.7), /distancia/);
  assert.throws(() => calcularVelocidadPorFrenado(10, 0), /mu/);
  assert.throws(() => calcularVelocidadPorFrenado(NaN, 0.7), /finito/);
  assert.throws(() => calcularMomento2D(0, 10, 0), /masa/);
  assert.throws(() => calcularEnergiaDisipada(0, 0), /energiaAntes/);
  assert.throws(() => validarEscenario({ ...ESCENARIO_EJEMPLO, muMin: 0.8, muMax: 0.6 }), /muMin/);
  assert.throws(() => validarEscenario({ ...ESCENARIO_EJEMPLO, mA: 500 }), /mA/);
  assert.throws(() => validarEscenario({ ...ESCENARIO_EJEMPLO, thetaA: 400 }), /thetaA/);
  assert.throws(() => validarEscenario({ ...ESCENARIO_EJEMPLO, dPostA: 0, dPostB: 0 }), /post-impacto/);
  assert.throws(() => validarEscenario({ ...ESCENARIO_EJEMPLO, vLimA: Infinity }), /vLimA/);
  // Ambos salen hacia -X: implicaría que A venía en -X ⇒ incompatible.
  assert.throws(() => reconstruirConMu({ ...ESCENARIO_EJEMPLO, thetaA: Math.PI, thetaB: Math.PI }, 0.7), /incompatibles/);
});

test('límites del rango aceptados', () => {
  validarEscenario({ ...ESCENARIO_EJEMPLO, mA: 800, mB: 3500, dPreA: 0, dPreB: 50, thetaA: 0, thetaB: Math.PI / 2, muMin: 0.4, muMax: 0.9 });
  const r = reconstruirConMu({ ...ESCENARIO_EJEMPLO, dPostB: 0, thetaA: 0 }, 0.7);
  cerca(r.vB, 0); // solo A en +X sin componente Y ⇒ B en reposo
});
