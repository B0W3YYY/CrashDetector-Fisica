// Pruebas de validación analítica: escenarios cuya solución exacta se conoce de antemano.
// El resultado del motor se compara contra la fórmula cerrada dentro de una tolerancia declarada.
//
// Tolerancias usadas (justificación):
//   TOL_EXACTA = 1e-9 (relativa): la fórmula y el motor hacen las mismas operaciones en otro orden;
//                el error de redondeo en doble precisión es ~1e-15, así que 1e-9 deja margen sin
//                ocultar errores de modelo (que serían de 1e-2 o más).
//   TOL_PASO   = dt: la simulación se muestrea cada dt; un evento (detención, impacto) solo puede
//                ubicarse con una resolución de un paso.
//   TOL_IMPULSO = (mA + mB)·μ·g·dt: entre la última muestra antes del impacto y la primera después,
//                la fricción puede quitar como máximo el impulso de un paso a cada vehículo.
//   TOL_1PCT   = 1 %: criterio de la consigna para la conservación de la energía sin disipación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  G, ESCENARIO_EJEMPLO, calcularVelocidadPorFrenado,
  reconstruirConMu, simularHaciaAdelante, verificarReconstruccion,
} from '../src/physics/crash.js';

const TOL_EXACTA = 1e-9;
const DT = 0.01; // s
const cerca = (obtenido, esperado, tol = TOL_EXACTA, msg = '') =>
  assert.ok(
    Math.abs(obtenido - esperado) <= tol * Math.max(1, Math.abs(esperado)),
    `${msg} obtenido ${obtenido}, esperado ${esperado} (tol ${tol})`,
  );
const cercaAbs = (obtenido, esperado, tol, msg = '') =>
  assert.ok(Math.abs(obtenido - esperado) <= tol, `${msg} obtenido ${obtenido}, esperado ${esperado} (tol ${tol})`);

/** Escenario base válido con una sola variable cambiada. */
const escenario = (cambios) => ({ ...ESCENARIO_EJEMPLO, ...cambios });

/** Índice de la primera muestra con t >= tImpacto. */
const indiceImpacto = (sim) => sim.muestras.findIndex((m) => m.t >= sim.tImpacto);

test('Analítica 1 — distancia de frenado: d = v² / (2·μ·g)', () => {
  // Un vehículo a 72 km/h (20 m/s) con μ = 0,70 debe necesitar 20² / (2·0,7·9,81) = 29,12 m.
  const mu = 0.7, v = 20;
  const dExacta = (v * v) / (2 * mu * G);
  cerca(calcularVelocidadPorFrenado(dExacta, mu), v, TOL_EXACTA, 'v recuperada:');

  // Y la simulación hacia adelante debe recorrer exactamente esa distancia antes de detenerse.
  const e = escenario({ dPreA: 0, dPreB: 0, dPostA: dExacta, dPostB: 0, thetaA: 0, thetaB: Math.PI / 2, muMin: mu, muMax: mu });
  const r = reconstruirConMu(e, mu);
  const sim = simularHaciaAdelante(e, r, DT);
  const ultima = sim.muestras.at(-1);
  cerca(Math.hypot(ultima.xA, ultima.yA), dExacta, TOL_EXACTA, 'distancia simulada:');
  assert.ok(verificarReconstruccion(e, sim).ok);
});

test('Analítica 2 — tiempo de frenado: t = v / (μ·g)', () => {
  // Tras el impacto A desliza con u = sqrt(2μg·d). Debe detenerse en t = u/(μg) exactos.
  const mu = 0.725;
  const e = escenario({ muMin: mu, muMax: mu });
  const r = reconstruirConMu(e, mu);
  const sim = simularHaciaAdelante(e, r, DT);
  const i0 = indiceImpacto(sim);
  const iParada = sim.muestras.findIndex((m, k) => k >= i0 && m.vA === 0);
  assert.ok(iParada > i0, 'A debe detenerse después del impacto');
  const tParadaSimulada = sim.muestras[iParada].t - sim.tImpacto;
  const tParadaExacta = r.uA / (mu * G);
  // Resolución de muestreo: la primera muestra en reposo cae dentro de un paso del instante exacto.
  assert.ok(tParadaSimulada >= tParadaExacta - 1e-12 && tParadaSimulada <= tParadaExacta + DT,
    `t simulado ${tParadaSimulada} s vs exacto ${tParadaExacta} s (tol ${DT} s)`);
});

test('Analítica 3 — choque perfectamente inelástico perpendicular (solución cerrada)', () => {
  // A (1500 kg, 15 m/s, +X) y B (1200 kg, 12 m/s, +Y) quedan unidos. Solución exacta:
  //   u = sqrt((mA·vA)² + (mB·vB)²) / (mA + mB),   θ = atan2(mB·vB, mA·vA)
  //   ΔEk/Ek = 1 − (mA+mB)·u² / (mA·vA² + mB·vB²)
  const mA = 1500, mB = 1200, vA = 15, vB = 12, mu = 0.7;
  const u = Math.hypot(mA * vA, mB * vB) / (mA + mB);
  const theta = Math.atan2(mB * vB, mA * vA);
  const dPost = (u * u) / (2 * mu * G);
  const e = escenario({ mA, mB, dPreA: 0, dPreB: 0, dPostA: dPost, dPostB: dPost, thetaA: theta, thetaB: theta, muMin: mu, muMax: mu });
  const r = reconstruirConMu(e, mu);
  cerca(r.vA, vA, TOL_EXACTA, 'vA:');
  cerca(r.vB, vB, TOL_EXACTA, 'vB:');
  const perdidaExacta = 100 * (1 - ((mA + mB) * u * u) / (mA * vA * vA + mB * vB * vB));
  cerca(r.porcentajeDisipadoChoque, perdidaExacta, TOL_EXACTA, '% disipado:');
  assert.match(r.clasificacion, /Perfectamente inelástica/);
});

test('Analítica 4 — conservación del momento lineal en el impacto (por componentes)', () => {
  const r = reconstruirConMu(ESCENARIO_EJEMPLO, 0.725);
  const { mA, mB, thetaA, thetaB } = ESCENARIO_EJEMPLO;
  // Exacta: el motor debe cumplir Σp antes = Σp después en X y en Y.
  const pxAntes = mA * r.vA, pyAntes = mB * r.vB;
  const pxDespues = mA * r.uA * Math.cos(thetaA) + mB * r.uB * Math.cos(thetaB);
  const pyDespues = mA * r.uA * Math.sin(thetaA) + mB * r.uB * Math.sin(thetaB);
  cerca(pxDespues, pxAntes, TOL_EXACTA, 'px:');
  cerca(pyDespues, pyAntes, TOL_EXACTA, 'py:');

  // En la simulación muestreada: el salto de Σp entre la muestra previa y la siguiente al
  // impacto está acotado por el impulso de fricción de un paso, (mA+mB)·μ·g·dt.
  const sim = simularHaciaAdelante(ESCENARIO_EJEMPLO, r, DT);
  const i = indiceImpacto(sim);
  const [a, b] = [sim.muestras[i - 1], sim.muestras[i]];
  const tolImpulso = (mA + mB) * r.mu * G * DT;
  cercaAbs(b.pxA + b.pxB, a.pxA + a.pxB, tolImpulso, 'Σpx simulación:');
  cercaAbs(b.pyA + b.pyB, a.pyA + a.pyB, tolImpulso, 'Σpy simulación:');
});

test('Analítica 5 — balance de energía: Ek perdida = trabajo de la fricción (teorema trabajo–energía)', () => {
  const mu = 0.65;
  const r = reconstruirConMu(ESCENARIO_EJEMPLO, mu);
  // Antes del choque: Ek(inicio de marcas) − μg·(mA·dPreA + mB·dPreB) = Ek(justo antes del impacto)
  cerca(r.ekInicial - r.energiaFriccionPre, r.ekImpactoAntes, TOL_EXACTA, 'tramo previo:');
  // Después del choque: toda la Ek de salida se disipa por fricción hasta el reposo.
  cerca(r.ekImpactoDespues, r.energiaFriccionPost, TOL_EXACTA, 'tramo posterior:');
  // Balance global: Ek inicial = fricción previa + pérdida en el choque + fricción posterior.
  cerca(r.ekInicial, r.energiaFriccionPre + r.energiaDisipadaChoque + r.energiaFriccionPost, TOL_EXACTA, 'global:');
});

test('Analítica 6 — sin disipación la energía mecánica se conserva (< 1 % tras 10 s simulados)', () => {
  // Con dPre = 0 no hay frenado previo: ambos vehículos avanzan sin fricción hasta el impacto.
  // Se simulan 10 s de ese tramo (tPrevio = 10 s) y se exige |Ek(t) − Ek(0)| / Ek(0) < 1 %.
  const mu = 0.7;
  const e = escenario({ dPreA: 0, dPreB: 0, muMin: mu, muMax: mu });
  const r = reconstruirConMu(e, mu);
  const sim = simularHaciaAdelante(e, r, DT, G, 10);
  const libres = sim.muestras.filter((m) => m.t < sim.tImpacto);
  assert.ok(libres.at(-1).t >= 10 - DT - 1e-9, 'debe haber 10 s simulados sin disipación');
  const ek0 = libres[0].ekA + libres[0].ekB;
  for (const m of libres) cerca(m.ekA + m.ekB, ek0, 0.01, `Ek en t=${m.t.toFixed(2)} s:`);
  // Y el sistema recorre exactamente v·t: llega al origen en t = 10 s.
  cerca(libres[0].xA + r.v0A * 10, 0, 1e-9, 'posición de A:');
});

test('Analítica 7 — escalamiento: todas las rapideces reconstruidas ∝ √μ', () => {
  const r1 = reconstruirConMu(ESCENARIO_EJEMPLO, 0.45);
  const r2 = reconstruirConMu(ESCENARIO_EJEMPLO, 0.8);
  const razon = Math.sqrt(0.8 / 0.45);
  for (const k of ['uA', 'uB', 'vA', 'vB', 'v0A', 'v0B']) cerca(r2[k] / r1[k], razon, TOL_EXACTA, `${k}:`);
});

test('Casos límite — dPre = 0, un vehículo detenido tras el choque, μ en los extremos', () => {
  // Sin marcas previas la rapidez al iniciar el frenado es la de impacto.
  const sinMarcas = reconstruirConMu(escenario({ dPreA: 0, dPreB: 0 }), 0.7);
  cerca(sinMarcas.v0A, sinMarcas.vA); cerca(sinMarcas.v0B, sinMarcas.vB);

  // B queda donde chocó (dPostB = 0) y A sale por +X: B no aportaba momento en Y ⇒ vB = 0.
  const bQuieto = reconstruirConMu(escenario({ dPostB: 0, thetaA: 0 }), 0.7);
  cerca(bQuieto.vB, 0);
  cerca(bQuieto.vA, calcularVelocidadPorFrenado(ESCENARIO_EJEMPLO.dPostA, 0.7));

  // Extremos del rango declarado de μ (0,40 y 0,90) se aceptan y respetan d = v²/(2μg).
  for (const mu of [0.4, 0.9]) {
    const r = reconstruirConMu(escenario({ muMin: 0.4, muMax: 0.9 }), mu);
    cerca((r.uA * r.uA) / (2 * mu * G), ESCENARIO_EJEMPLO.dPostA);
  }
});
