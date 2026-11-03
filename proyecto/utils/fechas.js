const pad = (n) => String(n).padStart(2, '0');

const aIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const hoyIso = () => aIso(new Date());

const desplazarAnios = (anios) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + anios);
    return aIso(d);
};

const esFechaValida = (valor) => {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const [y, m, d] = valor.split('-').map(Number);
    const fecha = new Date(y, m - 1, d);
    return fecha.getFullYear() === y && fecha.getMonth() === m - 1 && fecha.getDate() === d;
};

const vacio = (valor) => valor === undefined || valor === null || String(valor).trim() === '';

const validarNacimiento = (valor, tipo = 'adulto') => {
    if (vacio(valor)) return null;
    if (!esFechaValida(valor)) return 'La fecha de nacimiento no es válida.';
    if (valor > hoyIso()) return 'La fecha de nacimiento no puede ser futura.';
    if (tipo === 'estudiante') {
        if (valor < desplazarAnios(-30)) return 'El estudiante no puede tener más de 30 años.';
        return null;
    }
    if (valor > desplazarAnios(-18)) return 'La persona debe ser mayor de 18 años.';
    if (valor < desplazarAnios(-100)) return 'La fecha de nacimiento no es válida.';
    return null;
};

const validarNoFutura = (valor, etiqueta = 'La fecha') => {
    if (vacio(valor)) return null;
    if (!esFechaValida(valor)) return `${etiqueta} no es válida.`;
    if (valor > hoyIso()) return `${etiqueta} no puede ser futura.`;
    if (valor < '1990-01-01') return `${etiqueta} es demasiado antigua.`;
    return null;
};

const validarNoPasada = (valor, etiqueta = 'La fecha') => {
    if (vacio(valor)) return null;
    if (!esFechaValida(valor)) return `${etiqueta} no es válida.`;
    if (valor < hoyIso()) return `${etiqueta} no puede ser anterior a hoy.`;
    if (valor > desplazarAnios(5)) return `${etiqueta} no puede superar los 5 años desde hoy.`;
    return null;
};

const validarPosterior = (inicio, fin, etiquetaFin = 'La fecha final', etiquetaInicio = 'la fecha inicial') => {
    if (vacio(inicio) || vacio(fin)) return null;
    if (!esFechaValida(fin)) return `${etiquetaFin} no es válida.`;
    if (fin < inicio) return `${etiquetaFin} no puede ser anterior a ${etiquetaInicio}.`;
    if (fin > desplazarAnios(10)) return `${etiquetaFin} es demasiado lejana.`;
    return null;
};

const primerError = (...errores) => errores.find((e) => e) || null;

module.exports = {
    hoyIso,
    esFechaValida,
    validarNacimiento,
    validarNoFutura,
    validarNoPasada,
    validarPosterior,
    primerError
};
