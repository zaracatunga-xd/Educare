const crear = ({ maximo, ventanaMs, bloqueoMs }) => {
    const registros = new Map();

    const limpiar = () => {
        const ahora = Date.now();
        for (const [clave, r] of registros) {
            if (r.bloqueadoHasta < ahora && r.inicio + ventanaMs < ahora) registros.delete(clave);
        }
    };
    setInterval(limpiar, 10 * 60 * 1000).unref();

    return {
        bloqueado(clave) {
            const r = registros.get(clave);
            if (!r || r.bloqueadoHasta <= Date.now()) return 0;
            return Math.ceil((r.bloqueadoHasta - Date.now()) / 60000);
        },
        fallo(clave) {
            const ahora = Date.now();
            let r = registros.get(clave);
            if (!r || r.inicio + ventanaMs < ahora) r = { inicio: ahora, intentos: 0, bloqueadoHasta: 0 };
            r.intentos += 1;
            if (r.intentos >= maximo) r.bloqueadoHasta = ahora + bloqueoMs;
            registros.set(clave, r);
        },
        exito(clave) {
            registros.delete(clave);
        }
    };
};

module.exports = { crear };
