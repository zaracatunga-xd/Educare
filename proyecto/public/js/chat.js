(function () {
    const INTERVALO_MS = 4000;

    const formatoHora = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    const etiquetaDia = (iso) => {
        const fecha = new Date(iso);
        const hoy = new Date();
        const ayer = new Date();
        ayer.setDate(hoy.getDate() - 1);
        const mismo = (a, b) => a.toDateString() === b.toDateString();
        if (mismo(fecha, hoy)) return 'Hoy';
        if (mismo(fecha, ayer)) return 'Ayer';
        return fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    const vistaResumen = (iso) => {
        if (!iso) return '';
        const fecha = new Date(iso);
        return fecha.toDateString() === new Date().toDateString()
            ? formatoHora(iso)
            : fecha.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
    };

    function crear(etiqueta, clases, contenido) {
        const el = document.createElement(etiqueta);
        if (clases) el.className = clases;
        if (contenido !== undefined) el.textContent = contenido;
        return el;
    }

    async function pedir(url, opciones) {
        const respuesta = await fetch(url, Object.assign({ credentials: 'same-origin' }, opciones));
        let datos = {};
        try { datos = await respuesta.json(); } catch (e) { datos = {}; }
        if (!respuesta.ok) throw new Error(datos.error || 'No se pudo completar la operación.');
        return datos;
    }

    function iniciar(cfg) {
        const contenedor = document.getElementById(cfg.contenedorId);
        const form = document.getElementById(cfg.formId);
        const input = document.getElementById(cfg.inputId);
        const items = Array.from(document.querySelectorAll(cfg.itemSelector));
        if (!contenedor || !form || !input || items.length === 0) return;

        let activo = null;
        let ultimoId = 0;
        let ultimoDia = '';
        let enCurso = false;
        const ticks = new Map();

        const bajar = () => { contenedor.scrollTop = contenedor.scrollHeight; };

        function agregarDia(iso) {
            const dia = new Date(iso).toDateString();
            if (dia === ultimoDia) return;
            ultimoDia = dia;
            const fila = crear('div', 'text-center my-2');
            fila.appendChild(crear('span', 'px-3 py-1 rounded-full bg-slate-900 text-slate-400 text-[10px] font-semibold border border-slate-800', etiquetaDia(iso)));
            contenedor.appendChild(fila);
        }

        function dibujar(m) {
            if (contenedor.querySelector('[data-mensaje-id="' + m.id + '"]')) return;
            const vacio = contenedor.querySelector('[data-vacio]');
            if (vacio) vacio.remove();

            agregarDia(m.fecha);
            const fila = crear('div', m.mio ? 'flex justify-end' : 'flex justify-start');
            fila.setAttribute('data-mensaje-id', m.id);
            const burbuja = crear('div', m.mio
                ? 'dark-island max-w-[75%] bg-teal-700 border border-teal-600 text-white text-xs p-3 rounded-2xl rounded-tr-none shadow-md space-y-1'
                : 'max-w-[75%] bg-slate-800 border border-slate-700 text-slate-200 text-xs p-3 rounded-2xl rounded-tl-none shadow-md space-y-1');
            const texto = crear('p', 'leading-relaxed whitespace-pre-wrap break-words', m.contenido);
            const pie = crear('div', 'flex items-center justify-end gap-1 pt-0.5 text-[9px] ' + (m.mio ? 'text-teal-200' : 'text-slate-400'));
            pie.appendChild(crear('span', '', formatoHora(m.fecha)));
            if (m.mio) {
                const marca = crear('i', 'fa-solid fa-check text-[10px]');
                ticks.set(m.id, marca);
                pie.appendChild(marca);
            }
            burbuja.appendChild(texto);
            burbuja.appendChild(pie);
            fila.appendChild(burbuja);
            contenedor.appendChild(fila);
            ultimoId = Math.max(ultimoId, m.id);
        }

        function marcarLeidos(hasta) {
            ticks.forEach((marca, id) => {
                if (id <= hasta) marca.className = 'fa-solid fa-check-double text-sky-300 text-[10px]';
            });
        }

        function estadoVacio() {
            if (contenedor.querySelector('[data-mensaje-id]')) return;
            const aviso = crear('div', 'flex justify-center');
            aviso.setAttribute('data-vacio', '1');
            aviso.appendChild(crear('span', 'bg-slate-800/80 text-slate-400 text-[10px] px-3 py-1 rounded-full border border-slate-700/50', 'Aún no hay mensajes. Escribe el primero.'));
            contenedor.appendChild(aviso);
        }

        async function cargar(inicial) {
            if (!activo || enCurso) return;
            enCurso = true;
            const objetivo = activo;
            try {
                const cerca = contenedor.scrollHeight - contenedor.scrollTop - contenedor.clientHeight < 80;
                const datos = await pedir('/chat/api/mensajes/' + objetivo + '?desde=' + ultimoId);
                if (objetivo !== activo) return;
                datos.mensajes.forEach(dibujar);
                marcarLeidos(datos.leidos_hasta);
                if (inicial) estadoVacio();
                if (inicial || (cerca && datos.mensajes.length > 0)) bajar();
                if (datos.mensajes.length > 0) limpiarInsignia(objetivo);
            } catch (error) {
                if (inicial) {
                    const aviso = crear('div', 'flex justify-center');
                    aviso.appendChild(crear('span', 'bg-rose-500/10 text-rose-300 text-[10px] px-3 py-1 rounded-full border border-rose-500/30', error.message));
                    contenedor.appendChild(aviso);
                }
            } finally {
                enCurso = false;
            }
        }

        function itemDe(idUsuario) {
            return items.find((i) => i.getAttribute('data-id-usuario') === String(idUsuario));
        }

        function limpiarInsignia(idUsuario) {
            const item = itemDe(idUsuario);
            const insignia = item && item.querySelector('[data-insignia]');
            if (insignia) insignia.classList.add('hidden');
        }

        function seleccionar(item) {
            items.forEach((el) => el.classList.remove(...cfg.claseActiva));
            item.classList.add(...cfg.claseActiva);
            activo = item.getAttribute('data-id-usuario');
            ultimoId = 0;
            ultimoDia = '';
            ticks.clear();
            contenedor.innerHTML = '';
            if (cfg.alSeleccionar) cfg.alSeleccionar(item);
            input.disabled = false;
            cargar(true);
        }

        async function actualizarResumen() {
            try {
                const datos = await pedir('/chat/api/resumen');
                items.forEach((item) => {
                    const id = item.getAttribute('data-id-usuario');
                    const r = datos.resumen[id];
                    const ultimo = item.querySelector('[data-ultimo]');
                    const hora = item.querySelector('[data-hora]');
                    const insignia = item.querySelector('[data-insignia]');
                    if (r && ultimo) ultimo.textContent = (r.mio ? 'Tú: ' : '') + r.ultimo;
                    if (r && hora) hora.textContent = vistaResumen(r.fecha);
                    if (insignia) {
                        const total = r && id !== activo ? r.no_leidos : 0;
                        insignia.textContent = total > 9 ? '9+' : String(total);
                        insignia.classList.toggle('hidden', total === 0);
                    }
                });
            } catch (error) {
                return;
            }
        }

        items.forEach((item) => item.addEventListener('click', () => seleccionar(item)));

        form.addEventListener('submit', async (evento) => {
            evento.preventDefault();
            const contenido = input.value.trim();
            if (!contenido || !activo) return;
            const boton = form.querySelector('button[type="submit"]');
            if (boton) boton.disabled = true;
            try {
                const datos = await pedir('/chat/api/enviar/' + activo, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contenido: contenido })
                });
                input.value = '';
                dibujar(datos.mensaje);
                bajar();
                actualizarResumen();
            } catch (error) {
                if (window.Educare) window.Educare.notificar('error', 'No se pudo enviar', error.message);
            } finally {
                if (boton) boton.disabled = false;
                input.focus();
            }
        });

        setInterval(() => {
            if (document.hidden) return;
            cargar(false);
            actualizarResumen();
        }, INTERVALO_MS);

        actualizarResumen();
        const inicial = items[cfg.indiceInicial || 0] || items[0];
        seleccionar(inicial);
    }

    window.ChatCliente = { iniciar: iniciar };
})();
