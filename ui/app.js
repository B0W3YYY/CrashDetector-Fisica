// Interfaz: lee el formulario, llama a la librería física, anima y grafica.
// No contiene fórmulas físicas; solo conversión de unidades y renderizado.
import {
  ESCENARIO_EJEMPLO, validarEscenario, propagarIncertidumbre, simularHaciaAdelante,
  verificarReconstruccion, compararConLimite,
} from '../src/physics/crash.js';

const DT = 0.01; // s, paso de la simulación
const CAMPOS = Object.keys(ESCENARIO_EJEMPLO);
const COLOR_A = '#f76707';
const COLOR_B = '#1c5bd9';
const LARGO_CARRO = 4.4; // m, solo para el dibujo
const kmhAMs = (v) => v / 3.6;
const msAKmh = (v) => v * 3.6;

// Imágenes vistas desde arriba con el frente hacia arriba.
const IMAGENES = { A: new Image(), B: new Image() };
IMAGENES.A.src = 'ui/img/carro-a.png';
IMAGENES.B.src = 'ui/img/carro-b.png';

const form = document.getElementById('form');
const estado = document.getElementById('estado');
const lienzo = document.getElementById('escena');
const ctx = lienzo.getContext('2d');
const etiquetaTiempo = document.getElementById('tiempo');

let animacion = null;

// Dibuja una línea vertical punteada en t = tImpacto (si la gráfica la tiene definida).
const lineaImpacto = {
  id: 'lineaImpacto',
  afterDatasetsDraw(chart) {
    const t = chart.options.tImpacto;
    if (t == null || !chart.data.datasets[0].data.length) return;
    const { ctx: c, chartArea: area, scales: { x } } = chart;
    const xp = x.getPixelForValue(t);
    if (xp < area.left || xp > area.right) return;
    c.save();
    c.strokeStyle = '#ffb000'; c.lineWidth = 1.5; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(xp, area.top); c.lineTo(xp, area.bottom); c.stroke();
    c.fillStyle = '#8e8e93'; c.font = '11px system-ui'; c.textAlign = 'left';
    c.fillText('impacto', xp + 4, area.top + 12);
    c.restore();
  },
};

function crearGrafica(id, ejeY, series, { yMin = 0 } = {}) {
  return new Chart(document.getElementById(id), {
    type: 'line',
    data: { datasets: series.map(([label, color, dash]) => ({ label, data: [], borderColor: color, backgroundColor: dash ? 'transparent' : color, pointRadius: 0, borderWidth: 2, borderDash: dash ?? [] })) },
    options: {
      animation: false, maintainAspectRatio: false, parsing: false, tImpacto: null,
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Tiempo t (s)' }, min: 0 },
        y: { title: { display: true, text: ejeY }, min: yMin },
      },
      plugins: { legend: { position: 'bottom' } },
    },
    plugins: [lineaImpacto],
  });
}

Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
Chart.defaults.color = '#8e8e93';

const graficaRapidez = crearGrafica('graficaRapidez', 'Rapidez (km/h)', [['Vehículo A', COLOR_A], ['Vehículo B', COLOR_B]]);
const graficaEnergia = crearGrafica('graficaEnergia', 'Energía cinética (kJ)', [['Vehículo A', COLOR_A], ['Vehículo B', COLOR_B], ['Sistema', '#495057']]);
const graficaMomento = crearGrafica('graficaMomento', 'Σp (10³ kg·m/s)',
  [['Σpₓ del sistema', '#2f9e44'], ['Σpᵧ del sistema', '#ae3ec9'], ['|Σp| del sistema', '#495057', [6, 4]]], { yMin: undefined });
const GRAFICAS_TIEMPO = [graficaRapidez, graficaEnergia, graficaMomento];

// Banda de incertidumbre: barras flotantes [mínimo, máximo] por vehículo y etapa, en km/h.
const graficaIncertidumbre = new Chart(document.getElementById('graficaIncertidumbre'), {
  type: 'bar',
  data: {
    labels: [['A', 'inicio frenado'], ['A', 'impacto'], ['B', 'inicio frenado'], ['B', 'impacto']],
    datasets: [
      { type: 'bar', label: 'Intervalo μmin – μmax', data: [], backgroundColor: [COLOR_A + 'aa', COLOR_A + '66', COLOR_B + 'aa', COLOR_B + '66'],
        borderColor: [COLOR_A, COLOR_A, COLOR_B, COLOR_B], borderWidth: 1.5, borderSkipped: false, barPercentage: 0.55 },
      { type: 'line', label: 'μ nominal', data: [], showLine: false, pointRadius: 5, pointBackgroundColor: '#212529', borderColor: '#212529' },
      { type: 'line', label: 'Límite legal', data: [], showLine: false, pointStyle: 'line', pointRadius: 26, pointBorderWidth: 3, borderColor: '#ff3b30', backgroundColor: '#ff3b30' },
    ],
  },
  options: {
    animation: false, maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: 'Vehículo y etapa' }, ticks: { maxRotation: 0, autoSkip: false, font: { size: 11 } } },
      y: { title: { display: true, text: 'Rapidez (km/h)' }, min: 0 },
    },
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: (c) => Array.isArray(c.raw) ? `${c.dataset.label}: ${num(c.raw[0])} – ${num(c.raw[1])} km/h` : `${c.dataset.label}: ${num(c.raw)} km/h` } },
    },
  },
});

function actualizarIncertidumbre(e, inc) {
  const claves = ['v0A', 'vA', 'v0B', 'vB'];
  const [ds, nom, lim] = graficaIncertidumbre.data.datasets;
  ds.data = claves.map((k) => [msAKmh(inc.min[k]), msAKmh(inc.max[k])]);
  nom.data = claves.map((k) => msAKmh(inc.nominal[k]));
  lim.data = [e.vLimA, e.vLimA, e.vLimB, e.vLimB].map(msAKmh);
  graficaIncertidumbre.update('none');
}

function cargarEjemplo() {
  for (const k of CAMPOS) {
    const valor = ESCENARIO_EJEMPLO[k];
    form.elements[k].value = k.startsWith('theta') ? Number(((valor * 180) / Math.PI).toFixed(6))
      : k.startsWith('vLim') ? msAKmh(valor)
        : valor;
  }
}

function leerFormulario() {
  const e = {};
  for (const k of CAMPOS) {
    const input = form.elements[k];
    input.removeAttribute('aria-invalid');
    const valor = input.value.trim() === '' ? NaN : Number(input.value);
    e[k] = k.startsWith('theta') ? (valor * Math.PI) / 180
      : k.startsWith('vLim') ? kmhAMs(valor)
        : valor;
  }
  return e;
}

function marcarCampo(mensaje) {
  const campo = CAMPOS.find((k) => mensaje.startsWith(k + ' '));
  if (campo) form.elements[campo].setAttribute('aria-invalid', 'true');
}

function mostrarEstado(tipo, texto) {
  estado.className = tipo;
  estado.textContent = texto;
}

const num = (x, d = 1) => x.toFixed(d).replace('.', ',');
const kmh = (v) => num(msAKmh(v));
const kJ = (j) => num(j / 1000);
const conUnidad = (valor, unidad) => `<span class="cantidad"><span class="valor">${valor}</span> <span class="unidad">${unidad}</span></span>`;
const intervalo = (inc, k) => conUnidad(`${kmh(inc.min[k])} – ${kmh(inc.max[k])}`, 'km/h');
const magnitud = (nombre, simbolo) => `${nombre}<span class="simbolo">${simbolo}</span>`;

function mostrarResultados(e, inc) {
  const filas = [
    [magnitud('Rapidez al inicio de las marcas de frenado', 'v₀'), intervalo(inc, 'v0A'), intervalo(inc, 'v0B')],
    [magnitud('Rapidez en el instante del impacto', 'v'), intervalo(inc, 'vA'), intervalo(inc, 'vB')],
    [magnitud('Rapidez inmediatamente después del impacto', 'u'), intervalo(inc, 'uA'), intervalo(inc, 'uB')],
    [magnitud('Límite legal', 'v<sub>lim</sub>'), conUnidad(msAKmh(e.vLimA), 'km/h'), conUnidad(msAKmh(e.vLimB), 'km/h')],
  ];
  const veredicto = (k, lim) => {
    const r = compararConLimite(inc.min[k], inc.max[k], lim);
    const detalle = r === 'indeterminado' ? '<span class="detalle">el intervalo contiene el límite</span>' : '';
    return `<span class="${r.replace(' ', '-')}">${r}</span>${detalle}`;
  };
  const n = inc.nominal;
  document.getElementById('tablaResultados').innerHTML =
    filas.map((f) => `<tr><th scope="row">${f[0]}</th><td>${f[1]}</td><td>${f[2]}</td></tr>`).join('') +
    `<tr class="comparacion"><th scope="row">${magnitud('Comparación con el límite', 'rapidez máxima reconstruida')}</th><td>${veredicto('v0A', e.vLimA)}</td><td>${veredicto('v0B', e.vLimB)}</td></tr>`;

  const datos = [
    ['Energía cinética en el choque', `
      <div class="fila"><span>Justo antes</span>${conUnidad(`${kJ(inc.min.ekImpactoAntes)} – ${kJ(inc.max.ekImpactoAntes)}`, 'kJ')}</div>
      <div class="fila"><span>Justo después</span>${conUnidad(`${kJ(inc.min.ekImpactoDespues)} – ${kJ(inc.max.ekImpactoDespues)}`, 'kJ')}</div>`],
    ['Energía disipada en el choque', `
      <div class="grande">${conUnidad(num(n.porcentajeDisipadoChoque), '%')}</div>
      <p class="nota">de la energía de impacto (el porcentaje no depende de μ).</p>`],
    [`Trabajo de la fricción (μ nominal = ${num(n.mu, 3)})`, `
      <div class="fila"><span>Frenado previo</span>${conUnidad(kJ(n.energiaFriccionPre), 'kJ')}</div>
      <div class="fila"><span>Deslizamiento posterior</span>${conUnidad(kJ(n.energiaFriccionPost), 'kJ')}</div>`],
    ['Clasificación de la colisión', `<div class="grande">${n.clasificacion}</div>`],
  ];
  document.getElementById('resumen').innerHTML =
    datos.map(([titulo, cuerpo]) => `<div class="dato"><h3>${titulo}</h3>${cuerpo}</div>`).join('');
  document.getElementById('resultados').hidden = false;
}

// --- Canvas ---
function dibujarCalles(esc) {
  const W = lienzo.width, H = lienzo.height;
  ctx.fillStyle = '#3b4250'; ctx.fillRect(0, 0, W, H);
  const carril = 7 * esc;
  ctx.fillStyle = '#5c6370';
  ctx.fillRect(0, H / 2 - carril / 2, W, carril);
  ctx.fillRect(W / 2 - carril / 2, 0, carril, H);
  ctx.strokeStyle = '#f1f3f5'; ctx.setLineDash([10, 10]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#f1f3f5'; ctx.font = '12px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('+X', W - 26, H / 2 - 8); ctx.fillText('+Y', W / 2 + 8, 14);
}

// Dibuja el instante i. Con trayectoriaCompleta, también la trayectoria prevista (punteada).
function dibujarEscena(sim, i, trayectoriaCompleta = false) {
  const W = lienzo.width, H = lienzo.height;
  const m = sim.muestras;
  // Escala que abarca todas las posiciones de la simulación.
  let alcance = 10;
  for (const s of [m[0], m[m.length - 1]]) alcance = Math.max(alcance, Math.abs(s.xA), Math.abs(s.yA), Math.abs(s.xB), Math.abs(s.yB));
  const esc = (W / 2 - 30) / (alcance * 1.1);
  const px = (x) => W / 2 + x * esc;
  const py = (y) => H / 2 - y * esc; // +Y hacia arriba

  dibujarCalles(esc);

  // Trayectorias y vehículos.
  for (const [id, color] of [['A', COLOR_A], ['B', COLOR_B]]) {
    if (trayectoriaCompleta) {
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath();
      for (let k = 0; k < m.length; k += 2) ctx.lineTo(px(m[k][`x${id}`]), py(m[k][`y${id}`]));
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
    for (let k = 0; k <= i; k += 2) ctx.lineTo(px(m[k][`x${id}`]), py(m[k][`y${id}`]));
    ctx.stroke();
    const s = m[i];
    const dx = m[Math.min(i + 1, m.length - 1)][`x${id}`] - m[Math.max(i - 1, 0)][`x${id}`];
    const dy = m[Math.min(i + 1, m.length - 1)][`y${id}`] - m[Math.max(i - 1, 0)][`y${id}`];
    const rumbo = Math.hypot(dx, dy) > 1e-9 ? Math.atan2(dy, dx) : (id === 'A' ? 0 : Math.PI / 2);
    ctx.save();
    ctx.translate(px(s[`x${id}`]), py(s[`y${id}`]));
    ctx.rotate(-rumbo);
    const img = IMAGENES[id];
    const largo = LARGO_CARRO * esc;
    if (img.complete && img.naturalWidth) {
      ctx.rotate(Math.PI / 2); // el frente de la imagen (arriba) apunta al rumbo
      const ancho = largo * (img.naturalWidth / img.naturalHeight);
      ctx.drawImage(img, -ancho / 2, -largo / 2, ancho, largo);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(-largo / 2, -0.9 * esc, largo, 1.8 * esc);
    }
    ctx.restore();
  }
  // Punto de impacto (origen).
  ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px(0), py(0), 6, 0, 2 * Math.PI); ctx.stroke();
  ctx.fillStyle = '#f1f3f5'; ctx.font = '12px system-ui'; ctx.textAlign = 'left';
  ctx.fillText(`Escala: ${(100 / esc).toFixed(1)} m = 100 px`, 8, H - 10);
}

// --- Animación en tiempo real ---
function iniciar(e, inc) {
  if (animacion) cancelAnimationFrame(animacion);
  const sim = simularHaciaAdelante(e, inc.nominal, DT);
  const verif = verificarReconstruccion(e, sim);
  if (!verif.ok) throw new Error('La simulación no reproduce las posiciones finales.');

  const tMax = sim.muestras[sim.muestras.length - 1].t;
  for (const g of GRAFICAS_TIEMPO) {
    g.data.datasets.forEach((d) => { d.data = []; });
    g.options.scales.x.max = tMax;
    g.options.tImpacto = sim.tImpacto;
  }
  let i = 0;
  const inicio = performance.now();
  const paso = (ahora) => {
    const objetivo = Math.min(sim.muestras.length - 1, Math.floor((ahora - inicio) / 1000 / DT));
    for (; i <= objetivo; i++) {
      const s = sim.muestras[i];
      graficaRapidez.data.datasets[0].data.push({ x: s.t, y: msAKmh(s.vA) });
      graficaRapidez.data.datasets[1].data.push({ x: s.t, y: msAKmh(s.vB) });
      graficaEnergia.data.datasets[0].data.push({ x: s.t, y: s.ekA / 1000 });
      graficaEnergia.data.datasets[1].data.push({ x: s.t, y: s.ekB / 1000 });
      graficaEnergia.data.datasets[2].data.push({ x: s.t, y: (s.ekA + s.ekB) / 1000 });
      const px = (s.pxA + s.pxB) / 1000, py = (s.pyA + s.pyB) / 1000;
      graficaMomento.data.datasets[0].data.push({ x: s.t, y: px });
      graficaMomento.data.datasets[1].data.push({ x: s.t, y: py });
      graficaMomento.data.datasets[2].data.push({ x: s.t, y: Math.hypot(px, py) });
    }
    const actual = Math.max(0, i - 1);
    dibujarEscena(sim, actual);
    etiquetaTiempo.textContent = sim.muestras[actual].t.toFixed(2).replace('.', ',');
    for (const g of GRAFICAS_TIEMPO) g.update('none');
    if (i < sim.muestras.length) animacion = requestAnimationFrame(paso);
  };
  animacion = requestAnimationFrame(paso);
}

// Vista previa: posición inicial y trayectoria prevista con los datos actuales del formulario.
function vistaPrevia() {
  if (animacion) { cancelAnimationFrame(animacion); animacion = null; }
  etiquetaTiempo.textContent = '0,00';
  for (const g of GRAFICAS_TIEMPO) {
    g.data.datasets.forEach((d) => { d.data = []; });
    g.options.tImpacto = null;
    g.update('none');
  }
  try {
    const e = leerFormulario();
    validarEscenario(e);
    const inc = propagarIncertidumbre(e);
    const sim = simularHaciaAdelante(e, inc.nominal, DT);
    dibujarEscena(sim, 0, true);
    actualizarIncertidumbre(e, inc);
  } catch (err) {
    dibujarCalles(lienzo.width / 2 / 35);
    ctx.fillStyle = '#f1f3f5'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Vista previa no disponible: revise los datos', lienzo.width / 2, lienzo.height - 20);
  }
}

// Si se escribe un valor mayor que el máximo del campo, se reemplaza por el máximo.
// El mínimo no se fuerza al escribir (p. ej. "8" es un paso intermedio hacia "800");
// lo valida la librería al iniciar la simulación.
form.addEventListener('input', (ev) => {
  const input = ev.target;
  if (input.type !== 'number' || input.max === '' || input.value === '') return;
  if (Number(input.value) > Number(input.max)) input.value = input.max;
});
form.addEventListener('input', vistaPrevia);

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const e = leerFormulario();
  try {
    if (e.dPostA === 0 && e.dPostB === 0) {
      mostrarEstado('insuficiente', 'Datos insuficientes: con ambas distancias post-impacto en 0 no hay momento posterior; no es posible reconstruir las velocidades.');
      document.getElementById('resultados').hidden = true;
      return;
    }
    validarEscenario(e);
    const inc = propagarIncertidumbre(e);
    mostrarResultados(e, inc);
    actualizarIncertidumbre(e, inc);
    iniciar(e, inc);
    document.getElementById('iniciar').textContent = 'Reiniciar simulación';
    mostrarEstado('valido', 'Resultado válido: reconstrucción calculada con el intervalo de μ indicado.');
  } catch (err) {
    marcarCampo(err.message);
    mostrarEstado('error', `Error: ${err.message}`);
    document.getElementById('resultados').hidden = true;
  }
});


cargarEjemplo();
vistaPrevia();
for (const img of Object.values(IMAGENES)) img.addEventListener('load', () => { if (!animacion) vistaPrevia(); });
