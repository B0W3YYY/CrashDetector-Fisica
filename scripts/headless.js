// Ejecuta el escenario de ejemplo sin interfaz y escribe output/simulacion.csv.
// Uso: npm run simulate   (opcional: node scripts/headless.js ruta.csv)
// Columnas: tiempo, posición, rapidez, momento y energía de cada vehículo, totales del sistema y fase (pre/post impacto).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  ESCENARIO_EJEMPLO, propagarIncertidumbre, simularHaciaAdelante, verificarReconstruccion,
} from '../src/physics/crash.js';

const DT = 0.01; // s
const salida = resolve(process.argv[2] ?? 'output/simulacion.csv');
const msAKmh = (v) => v * 3.6;

const COLUMNAS = [
  ['t_s', 't'],
  ['xA_m', 'xA'], ['yA_m', 'yA'], ['vA_m_s', 'vA'], ['pxA_kg_m_s', 'pxA'], ['pyA_kg_m_s', 'pyA'], ['EkA_J', 'ekA'],
  ['xB_m', 'xB'], ['yB_m', 'yB'], ['vB_m_s', 'vB'], ['pxB_kg_m_s', 'pxB'], ['pyB_kg_m_s', 'pyB'], ['EkB_J', 'ekB'],
  // Totales del sistema: permiten auditar la conservación del momento en el impacto y la energía disipada.
  ['px_total_kg_m_s', (m) => m.pxA + m.pxB], ['py_total_kg_m_s', (m) => m.pyA + m.pyB], ['Ek_total_J', (m) => m.ekA + m.ekB],
];
const valor = (m, k) => (typeof k === 'function' ? k(m) : m[k]);

try {
  const inc = propagarIncertidumbre(ESCENARIO_EJEMPLO);
  const sim = simularHaciaAdelante(ESCENARIO_EJEMPLO, inc.nominal, DT);
  const verif = verificarReconstruccion(ESCENARIO_EJEMPLO, sim);
  if (!verif.ok) throw new Error(`La simulación no reproduce las distancias post-impacto: ${JSON.stringify(verif)}`);

  const lineas = [[...COLUMNAS.map(([h]) => h), 'fase'].join(',')];
  for (const m of sim.muestras) lineas.push([...COLUMNAS.map(([, k]) => valor(m, k).toFixed(6)), m.t < sim.tImpacto ? 'pre' : 'post'].join(','));
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, lineas.join('\n') + '\n');

  const f = (v) => msAKmh(v).toFixed(1);
  console.log('Escenario:', JSON.stringify(ESCENARIO_EJEMPLO));
  console.log(`mu nominal = ${inc.nominal.mu.toFixed(3)}, dt = ${DT} s, impacto en t = ${sim.tImpacto.toFixed(3)} s`);
  console.log(`A: impacto ${f(inc.min.vA)}–${f(inc.max.vA)} km/h; inicio de frenado ${f(inc.min.v0A)}–${f(inc.max.v0A)} km/h`);
  console.log(`B: impacto ${f(inc.min.vB)}–${f(inc.max.vB)} km/h; inicio de frenado ${f(inc.min.v0B)}–${f(inc.max.v0B)} km/h`);
  console.log(`Energía disipada en el choque (mu nominal): ${inc.nominal.porcentajeDisipadoChoque.toFixed(1)} %`);
  const n = inc.nominal, kJ = (j) => (j / 1000).toFixed(1);
  console.log(`Balance de energía (mu nominal): Ek inicial ${kJ(n.ekInicial)} kJ = fricción previa ${kJ(n.energiaFriccionPre)} kJ`
    + ` + choque ${kJ(n.energiaDisipadaChoque)} kJ + fricción posterior ${kJ(n.energiaFriccionPost)} kJ`);
  const E = ESCENARIO_EJEMPLO;
  const pAntes = [E.mA * n.vA, E.mB * n.vB];
  const pDespues = [
    E.mA * n.uA * Math.cos(E.thetaA) + E.mB * n.uB * Math.cos(E.thetaB),
    E.mA * n.uA * Math.sin(E.thetaA) + E.mB * n.uB * Math.sin(E.thetaB),
  ];
  const p = (v) => `(${v[0].toFixed(1)}, ${v[1].toFixed(1)})`;
  console.log(`Momento total en el impacto: antes ${p(pAntes)} kg·m/s, después ${p(pDespues)} kg·m/s`);
  console.log(`Posiciones finales reproducen d_post: error A ${verif.errorFinalA.toExponential(1)} m, B ${verif.errorFinalB.toExponential(1)} m`);
  console.log(`CSV: ${salida} (${sim.muestras.length} filas)`);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
