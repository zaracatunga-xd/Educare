const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 40;

const ANCHOS = {
    normal: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
    negrita: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]
};

const codificar = (texto) => {
    const bytes = [];
    for (const ch of String(texto)) {
        const c = ch.codePointAt(0);
        if (c < 256) bytes.push(c);
        else if (c === 0x2013 || c === 0x2014) bytes.push(0x2d);
        else if (c === 0x2022 || c === 0x00b7) bytes.push(0x95);
        else bytes.push(0x3f);
    }
    return Buffer.from(bytes);
};

const escapar = (buffer) => {
    let salida = '';
    for (const b of buffer) {
        if (b === 0x28 || b === 0x29 || b === 0x5c) salida += '\\' + String.fromCharCode(b);
        else if (b < 32 || b > 126) salida += '\\' + b.toString(8).padStart(3, '0');
        else salida += String.fromCharCode(b);
    }
    return salida;
};

const ancho = (texto, tamano, negrita) => {
    const tabla = negrita ? ANCHOS.negrita : ANCHOS.normal;
    let total = 0;
    for (const b of codificar(texto)) total += b >= 32 && b <= 126 ? tabla[b - 32] : 556;
    return (total * tamano) / 1000;
};

const recortar = (texto, maximo, tamano, negrita) => {
    let t = String(texto);
    if (ancho(t, tamano, negrita) <= maximo) return t;
    while (t.length > 1 && ancho(t + '...', tamano, negrita) > maximo) t = t.slice(0, -1);
    return t + '...';
};

const color = (c) => c.map((v) => (v / 255).toFixed(3)).join(' ');

class Documento {
    constructor(titulo) {
        this.titulo = titulo;
        this.paginas = [];
        this.nuevaPagina();
    }

    nuevaPagina() {
        this.ops = [];
        this.paginas.push(this.ops);
        this.y = A4.alto - MARGEN;
        return this;
    }

    espacio(necesario) {
        if (this.y - necesario < MARGEN + 20) this.nuevaPagina();
    }

    texto(x, y, texto, { tamano = 10, negrita = false, rgb = [30, 41, 59], alinear = 'izq', ancho: caja = 0 } = {}) {
        let px = x;
        const w = ancho(texto, tamano, negrita);
        if (alinear === 'centro') px = x + (caja - w) / 2;
        if (alinear === 'der') px = x + caja - w;
        this.ops.push(`BT /${negrita ? 'F2' : 'F1'} ${tamano} Tf ${color(rgb)} rg ${px.toFixed(2)} ${y.toFixed(2)} Td (${escapar(codificar(texto))}) Tj ET`);
    }

    rect(x, y, w, h, relleno, borde) {
        const partes = [];
        if (relleno) partes.push(`${color(relleno)} rg`);
        if (borde) partes.push(`${color(borde)} RG 0.6 w`);
        partes.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${relleno && borde ? 'B' : relleno ? 'f' : 'S'}`);
        this.ops.push(partes.join(' '));
    }

    linea(x1, y1, x2, y2, rgb = [203, 213, 225]) {
        this.ops.push(`${color(rgb)} RG 0.6 w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    }

    generar() {
        const total = this.paginas.length;
        const objetos = [];
        const agregar = (contenido) => { objetos.push(contenido); return objetos.length; };

        const catalogo = agregar('');
        const arbol = agregar('');
        const f1 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        const f2 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        const info = agregar(`<< /Title (${escapar(codificar(this.titulo))}) /Producer (Educare) >>`);

        const idsPagina = [];
        this.paginas.forEach((ops, i) => {
            const pie = `BT /F1 8 Tf ${color([100, 116, 139])} rg ${MARGEN} 24 Td (${escapar(codificar(`Educare - ${this.titulo}`))}) Tj ET `
                + `BT /F1 8 Tf ${color([100, 116, 139])} rg ${(A4.ancho - MARGEN - 60).toFixed(2)} 24 Td (${escapar(codificar(`Pagina ${i + 1} de ${total}`))}) Tj ET`;
            const flujo = Buffer.from(ops.join('\n') + '\n' + pie, 'latin1');
            const idContenido = agregar({ flujo });
            const idPagina = agregar(`<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 ${A4.ancho} ${A4.alto}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${idContenido} 0 R >>`);
            idsPagina.push(idPagina);
        });

        objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R >>`;
        objetos[arbol - 1] = `<< /Type /Pages /Kids [${idsPagina.map((id) => `${id} 0 R`).join(' ')}] /Count ${idsPagina.length} >>`;

        const trozos = [Buffer.from('%PDF-1.4\n')];
        const posiciones = [];
        let largo = trozos[0].length;
        objetos.forEach((obj, i) => {
            posiciones.push(largo);
            let cuerpo;
            if (typeof obj === 'string') {
                cuerpo = Buffer.from(`${i + 1} 0 obj\n${obj}\nendobj\n`, 'latin1');
            } else {
                cuerpo = Buffer.concat([
                    Buffer.from(`${i + 1} 0 obj\n<< /Length ${obj.flujo.length} >>\nstream\n`),
                    obj.flujo,
                    Buffer.from('\nendstream\nendobj\n')
                ]);
            }
            trozos.push(cuerpo);
            largo += cuerpo.length;
        });

        let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
        posiciones.forEach((p) => { xref += `${String(p).padStart(10, '0')} 00000 n \n`; });
        xref += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${largo}\n%%EOF`;
        trozos.push(Buffer.from(xref));
        return Buffer.concat(trozos);
    }
}

const COLOR = {
    tinta: [30, 41, 59],
    suave: [100, 116, 139],
    acento: [13, 148, 136],
    cabecera: [15, 118, 110],
    fondo: [241, 245, 249],
    aprobado: [4, 120, 87],
    reprobado: [190, 18, 60],
    pendiente: [100, 116, 139]
};

const colorEstado = (estado) => (estado === 'APROBADO' ? COLOR.aprobado : estado === 'REPROBADO' ? COLOR.reprobado : COLOR.pendiente);

const generarInformeNotas = ({ estudiante, periodo, boletin, emitidoPor, fechaEmision, formatoNota, formatoFecha }) => {
    const doc = new Documento(`Informe de notas - ${estudiante.nombre} ${estudiante.apellido}`);
    const ancho_util = A4.ancho - MARGEN * 2;
    const x0 = MARGEN;

    doc.rect(0, A4.alto - 90, A4.ancho, 90, COLOR.cabecera);
    doc.texto(x0, A4.alto - 45, 'Informe de Notas', { tamano: 22, negrita: true, rgb: [255, 255, 255] });
    doc.texto(x0, A4.alto - 66, 'Educare - Establecimiento de educacion especial', { tamano: 10, rgb: [204, 251, 241] });
    doc.texto(x0, A4.alto - 66, `Emitido: ${fechaEmision}`, { tamano: 9, rgb: [204, 251, 241], alinear: 'der', ancho: ancho_util });
    doc.y = A4.alto - 115;

    const ficha = [
        ['Estudiante', `${estudiante.nombre} ${estudiante.apellido}`],
        ['RUT', estudiante.rut || '-'],
        ['Curso', periodo.nombre_curso || '-'],
        ['Periodo', `${periodo.anio} - Semestre ${periodo.semestre}`]
    ];
    doc.rect(x0, doc.y - 58, ancho_util, 64, COLOR.fondo);
    ficha.forEach(([etiqueta, valor], i) => {
        const columna = i % 2;
        const fila = Math.floor(i / 2);
        const px = x0 + 14 + columna * (ancho_util / 2);
        const py = doc.y - 14 - fila * 29;
        doc.texto(px, py, etiqueta.toUpperCase(), { tamano: 7, negrita: true, rgb: COLOR.suave });
        doc.texto(px, py - 11, recortar(valor, ancho_util / 2 - 24, 10, true), { tamano: 10, negrita: true });
    });
    doc.y -= 80;

    const r = boletin.resumen;
    const tarjetas = [
        ['PROMEDIO GENERAL', formatoNota(boletin.promedioGeneral), colorEstado(boletin.estadoGeneral)],
        ['APROBADAS', String(r.aprobadas), COLOR.aprobado],
        ['REPROBADAS', String(r.reprobadas), COLOR.reprobado],
        ['SIN NOTAS', String(r.pendientes), COLOR.pendiente]
    ];
    const anchoTarjeta = (ancho_util - 30) / 4;
    tarjetas.forEach(([etiqueta, valor, rgb], i) => {
        const px = x0 + i * (anchoTarjeta + 10);
        doc.rect(px, doc.y - 46, anchoTarjeta, 46, [255, 255, 255], [203, 213, 225]);
        doc.texto(px, doc.y - 15, etiqueta, { tamano: 7, negrita: true, rgb: COLOR.suave, alinear: 'centro', ancho: anchoTarjeta });
        doc.texto(px, doc.y - 37, valor, { tamano: 18, negrita: true, rgb, alinear: 'centro', ancho: anchoTarjeta });
    });
    doc.y -= 66;

    if (boletin.asignaturas.length === 0) {
        doc.texto(x0, doc.y, 'No hay asignaturas registradas para este periodo.', { tamano: 10, rgb: COLOR.suave });
    }

    const columnas = [
        { titulo: 'Evaluacion', ancho: 0.34, alinear: 'izq' },
        { titulo: 'Tipo', ancho: 0.14, alinear: 'izq' },
        { titulo: 'Fecha', ancho: 0.14, alinear: 'izq' },
        { titulo: 'Pond.', ancho: 0.1, alinear: 'centro' },
        { titulo: 'Puntaje', ancho: 0.14, alinear: 'centro' },
        { titulo: 'Nota', ancho: 0.14, alinear: 'centro' }
    ];
    const posiciones = [];
    let acumulado = 0;
    columnas.forEach((c) => { posiciones.push(x0 + acumulado); acumulado += c.ancho * ancho_util; });

    boletin.asignaturas.forEach((asig) => {
        doc.espacio(80);
        doc.rect(x0, doc.y - 22, ancho_util, 22, COLOR.cabecera);
        doc.texto(x0 + 8, doc.y - 15, recortar(asig.nombre, ancho_util * 0.6, 11, true), { tamano: 11, negrita: true, rgb: [255, 255, 255] });
        const etiquetaProm = asig.promedio === null ? 'Sin promedio' : `Promedio ${formatoNota(asig.promedio)} - ${asig.estado}`;
        doc.texto(x0, doc.y - 15, etiquetaProm, { tamano: 9, negrita: true, rgb: [255, 255, 255], alinear: 'der', ancho: ancho_util - 8 });
        doc.y -= 22;
        doc.texto(x0 + 2, doc.y - 12, `Profesor/a: ${asig.profesor}`, { tamano: 8, rgb: COLOR.suave });
        doc.y -= 18;

        if (asig.evaluaciones.length === 0) {
            doc.texto(x0 + 8, doc.y - 8, 'Sin evaluaciones registradas.', { tamano: 9, rgb: COLOR.suave });
            doc.y -= 24;
            return;
        }

        const encabezado = () => {
            doc.rect(x0, doc.y - 15, ancho_util, 15, COLOR.fondo);
            columnas.forEach((c, i) => {
                doc.texto(posiciones[i] + 6, doc.y - 11, c.titulo.toUpperCase(), { tamano: 7, negrita: true, rgb: COLOR.suave, alinear: c.alinear, ancho: c.ancho * ancho_util - 12 });
            });
            doc.y -= 15;
        };
        encabezado();

        asig.evaluaciones.forEach((ev) => {
            if (doc.y - 18 < MARGEN + 30) { doc.nuevaPagina(); encabezado(); }
            const puntaje = ev.puntaje === null ? '-' : `${ev.puntaje}/${ev.puntajeMaximo}`;
            const celdas = [
                recortar(ev.nombre, columnas[0].ancho * ancho_util - 12, 9, false),
                ev.tipo || '-',
                formatoFecha(ev.fecha),
                `${ev.porcentaje}%`,
                puntaje,
                formatoNota(ev.nota)
            ];
            celdas.forEach((valor, i) => {
                const esNota = i === 5;
                const rgb = esNota ? (ev.nota === null ? COLOR.pendiente : ev.nota >= 4 ? COLOR.aprobado : COLOR.reprobado) : COLOR.tinta;
                doc.texto(posiciones[i] + 6, doc.y - 12, valor, { tamano: 9, negrita: esNota, rgb, alinear: columnas[i].alinear, ancho: columnas[i].ancho * ancho_util - 12 });
            });
            doc.linea(x0, doc.y - 17, x0 + ancho_util, doc.y - 17);
            doc.y -= 18;
        });

        if (asig.observacion) {
            doc.espacio(26);
            doc.texto(x0 + 6, doc.y - 12, recortar(`Observacion: ${asig.observacion}`, ancho_util - 12, 8, false), { tamano: 8, rgb: COLOR.suave });
            doc.y -= 18;
        }
        doc.y -= 12;
    });

    doc.espacio(40);
    doc.texto(x0, doc.y - 10, `Nota minima de aprobacion: 4,0. Escala de 1,0 a 7,0. Documento generado por ${emitidoPor}.`, { tamano: 8, rgb: COLOR.suave });

    return doc.generar();
};

const abreviar = (nombres) => {
    const usadas = new Set();
    return nombres.map((n) => {
        const base = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').slice(0, 4);
        let sigla = base;
        let i = 5;
        while (usadas.has(sigla)) { sigla = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').slice(0, i); i += 1; }
        usadas.add(sigla);
        return sigla;
    });
};

const generarInformeCurso = ({ curso, notas, asistencia, emitidoPor, fechaEmision, formatoNota }) => {
    const doc = new Documento(`Informe de curso - ${curso.nombre_curso}`);
    const ancho_util = A4.ancho - MARGEN * 2;
    const x0 = MARGEN;

    doc.rect(0, A4.alto - 90, A4.ancho, 90, COLOR.cabecera);
    doc.texto(x0, A4.alto - 45, 'Informe de Curso', { tamano: 22, negrita: true, rgb: [255, 255, 255] });
    doc.texto(x0, A4.alto - 66, `${curso.nombre_curso} - Periodo ${curso.anio}-${curso.semestre}`, { tamano: 10, rgb: [204, 251, 241] });
    doc.texto(x0, A4.alto - 66, `Emitido: ${fechaEmision}`, { tamano: 9, rgb: [204, 251, 241], alinear: 'der', ancho: ancho_util });
    doc.y = A4.alto - 115;

    const riesgo = notas.filas.filter((f) => f.general !== null && f.general < 4).length;
    const tarjetas = [
        ['ESTUDIANTES', String(notas.filas.length), COLOR.tinta],
        ['PROMEDIO CURSO', formatoNota(notas.promedioCurso), notas.promedioCurso !== null && notas.promedioCurso < 4 ? COLOR.reprobado : COLOR.aprobado],
        ['ASISTENCIA', asistencia.porcentajeCurso === null ? '-' : `${asistencia.porcentajeCurso}%`, COLOR.acento],
        ['EN RIESGO', String(riesgo), riesgo > 0 ? COLOR.reprobado : COLOR.pendiente]
    ];
    const anchoTarjeta = (ancho_util - 30) / 4;
    tarjetas.forEach(([etiqueta, valor, rgb], i) => {
        const px = x0 + i * (anchoTarjeta + 10);
        doc.rect(px, doc.y - 46, anchoTarjeta, 46, [255, 255, 255], [203, 213, 225]);
        doc.texto(px, doc.y - 15, etiqueta, { tamano: 7, negrita: true, rgb: COLOR.suave, alinear: 'centro', ancho: anchoTarjeta });
        doc.texto(px, doc.y - 37, valor, { tamano: 18, negrita: true, rgb, alinear: 'centro', ancho: anchoTarjeta });
    });
    doc.y -= 70;

    const siglas = abreviar(notas.columnas.map((c) => c.nombre));
    const anchoNombre = 150;
    const anchoNum = 22;
    const anchoFinal = 40;
    const anchoAsig = (ancho_util - anchoNombre - anchoNum - anchoFinal * 2) / Math.max(1, notas.columnas.length);

    const encabezado = () => {
        doc.rect(x0, doc.y - 18, ancho_util, 18, COLOR.cabecera);
        doc.texto(x0 + 4, doc.y - 12, 'N', { tamano: 8, negrita: true, rgb: [255, 255, 255] });
        doc.texto(x0 + anchoNum + 4, doc.y - 12, 'ESTUDIANTE', { tamano: 8, negrita: true, rgb: [255, 255, 255] });
        notas.columnas.forEach((c, i) => {
            doc.texto(x0 + anchoNum + anchoNombre + i * anchoAsig, doc.y - 12, siglas[i].toUpperCase(), { tamano: 7, negrita: true, rgb: [255, 255, 255], alinear: 'centro', ancho: anchoAsig });
        });
        const xf = x0 + anchoNum + anchoNombre + notas.columnas.length * anchoAsig;
        doc.texto(xf, doc.y - 12, 'PROM.', { tamano: 7, negrita: true, rgb: [255, 255, 255], alinear: 'centro', ancho: anchoFinal });
        doc.texto(xf + anchoFinal, doc.y - 12, 'ASIST.', { tamano: 7, negrita: true, rgb: [255, 255, 255], alinear: 'centro', ancho: anchoFinal });
        doc.y -= 18;
    };
    encabezado();

    const colorNota = (n) => (n === null ? COLOR.pendiente : n >= 4 ? COLOR.tinta : COLOR.reprobado);
    notas.filas.forEach((f, idx) => {
        if (doc.y - 18 < MARGEN + 40) { doc.nuevaPagina(); encabezado(); }
        if (idx % 2 === 1) doc.rect(x0, doc.y - 17, ancho_util, 17, COLOR.fondo);
        doc.texto(x0 + 4, doc.y - 12, String(idx + 1), { tamano: 8, rgb: COLOR.suave });
        doc.texto(x0 + anchoNum + 4, doc.y - 12, recortar(`${f.apellido}, ${f.nombre}`, anchoNombre - 8, 8.5, false), { tamano: 8.5 });
        f.promedios.forEach((p, i) => {
            doc.texto(x0 + anchoNum + anchoNombre + i * anchoAsig, doc.y - 12, formatoNota(p), { tamano: 8.5, rgb: colorNota(p), negrita: p !== null && p < 4, alinear: 'centro', ancho: anchoAsig });
        });
        const xf = x0 + anchoNum + anchoNombre + notas.columnas.length * anchoAsig;
        doc.texto(xf, doc.y - 12, formatoNota(f.general), { tamano: 9, negrita: true, rgb: colorNota(f.general), alinear: 'centro', ancho: anchoFinal });
        const asis = asistencia.filas.find((a) => a.id_estudiante === f.id_estudiante);
        const pct = asis && asis.porcentaje !== null ? `${asis.porcentaje}%` : '-';
        doc.texto(xf + anchoFinal, doc.y - 12, pct, { tamano: 8.5, rgb: asis && asis.alerta ? COLOR.reprobado : COLOR.tinta, negrita: !!(asis && asis.alerta), alinear: 'centro', ancho: anchoFinal });
        doc.y -= 17;
    });

    doc.espacio(40);
    doc.linea(x0, doc.y - 2, x0 + ancho_util, doc.y - 2, COLOR.suave);
    doc.texto(x0 + anchoNum + 4, doc.y - 14, 'PROMEDIO DEL CURSO', { tamano: 8, negrita: true });
    notas.columnas.forEach((c, i) => {
        doc.texto(x0 + anchoNum + anchoNombre + i * anchoAsig, doc.y - 14, formatoNota(c.promedio), { tamano: 8.5, negrita: true, rgb: colorNota(c.promedio), alinear: 'centro', ancho: anchoAsig });
    });
    const xf2 = x0 + anchoNum + anchoNombre + notas.columnas.length * anchoAsig;
    doc.texto(xf2, doc.y - 14, formatoNota(notas.promedioCurso), { tamano: 9, negrita: true, rgb: colorNota(notas.promedioCurso), alinear: 'centro', ancho: anchoFinal });
    doc.y -= 34;

    doc.espacio(30 + notas.columnas.length * 12);
    doc.texto(x0, doc.y - 8, 'ASIGNATURAS Y DOCENTES', { tamano: 7, negrita: true, rgb: COLOR.suave });
    doc.y -= 16;
    notas.columnas.forEach((c, i) => {
        doc.texto(x0, doc.y - 8, `${siglas[i].toUpperCase()}`, { tamano: 8, negrita: true, rgb: COLOR.acento });
        doc.texto(x0 + 36, doc.y - 8, recortar(`${c.nombre} - ${c.profesor}`, ancho_util - 36, 8, false), { tamano: 8 });
        doc.y -= 12;
    });
    doc.y -= 8;
    doc.texto(x0, doc.y - 8, `Nota minima de aprobacion: 4,0. Asistencia bajo ${85}% se marca en rojo. Generado por ${emitidoPor}.`, { tamano: 8, rgb: COLOR.suave });

    return doc.generar();
};

module.exports = { generarInformeNotas, generarInformeCurso };
