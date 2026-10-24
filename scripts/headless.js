// Ejecuta el escenario de ejemplo sin interfaz y escribe output/simulacion.csv.
// Uso: npm run simulate   (opcional: node scripts/headless.js ruta.csv)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  ESCENARIO_EJEMPLO, propagarIncertidumbre, simularHaciaAdelante, verificarReconstruccion, msAKmh,
} from '../src/physics/crash.js';

const DT = 0.01; // s
const salida = resolve(process.argv[2] ?? 'output/simulacion.csv');

const COLUMNAS = [
  ['t_s', 't'],
  ['xA_m', 'xA'], ['yA_m', 'yA'], ['vA_m_s', 'vA'], ['pxA_kg_m_s', 'pxA'], ['pyA_kg_m_s', 'pyA'], ['EkA_J', 'ekA'],
  ['xB_m', 'xB'], ['yB_m', 'yB'], ['vB_m_s', 'vB'], ['pxB_kg_m_s', 'pxB'], ['pyB_kg_m_s', 'pyB'], ['EkB_J', 'ekB'],
];

try {
  const inc = propagarIncertidumbre(ESCENARIO_EJEMPLO);
  const sim = simularHaciaAdelante(ESCENARIO_EJEMPLO, inc.nominal, DT);
  const verif = verificarReconstruccion(ESCENARIO_EJEMPLO, sim);
  if (!verif.ok) throw new Error(`La simulación no reproduce las distancias post-impacto: ${JSON.stringify(verif)}`);

  const lineas = [COLUMNAS.map(([h]) => h).join(',')];
  for (const m of sim.muestras) lineas.push(COLUMNAS.map(([, k]) => m[k].toFixed(6)).join(','));
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, lineas.join('\n') + '\n');

  const f = (v) => msAKmh(v).toFixed(1);
  console.log('Escenario:', JSON.stringify(ESCENARIO_EJEMPLO));
  console.log(`mu nominal = ${inc.nominal.mu.toFixed(3)}, dt = ${DT} s, impacto en t = ${sim.tImpacto.toFixed(3)} s`);
  console.log(`A: impacto ${f(inc.min.vA)}–${f(inc.max.vA)} km/h; inicio de frenado ${f(inc.min.v0A)}–${f(inc.max.v0A)} km/h`);
  console.log(`B: impacto ${f(inc.min.vB)}–${f(inc.max.vB)} km/h; inicio de frenado ${f(inc.min.v0B)}–${f(inc.max.v0B)} km/h`);
  console.log(`Energía disipada en el choque (mu nominal): ${inc.nominal.porcentajeDisipadoChoque.toFixed(1)} %`);
  console.log(`CSV: ${salida} (${sim.muestras.length} filas)`);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
