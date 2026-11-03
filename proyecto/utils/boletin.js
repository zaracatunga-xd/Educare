const NOTA_APROBACION = 4.0;

const numero = (valor) => {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
};

const redondear = (valor) => (valor === null ? null : Math.round(valor * 10) / 10);

const pupilosDelApoderado = async (conn, idUsuario) => {
    const [filas] = await conn.query(`
        SELECT DISTINCT e.id_estudiante, p.nombre, p.apellido, p.rut
        FROM APODERADO_ESTUDIANTE ae
        INNER JOIN APODERADO a ON a.id_apoderado = ae.id_apoderado
        INNER JOIN USUARIO u ON u.id_persona = a.id_persona
        INNER JOIN ESTUDIANTE e ON e.id_estudiante = ae.id_estudiante
        INNER JOIN PERSONA p ON p.id_persona = e.id_persona
        WHERE u.id_usuario = ? AND ae.estado = 'A'
        ORDER BY p.apellido ASC, p.nombre ASC
    `, [idUsuario]);
    return filas;
};

const periodosDelEstudiante = async (conn, idEstudiante) => {
    const [filas] = await conn.query(`
        SELECT DISTINCT
            cp.id_curso_periodo,
            pa.\`año\` AS anio,
            pa.semestre,
            TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) AS nombre_curso
        FROM INSCRIPCION i
        INNER JOIN CURSO_PERIODO cp ON cp.id_curso_periodo = i.id_curso_periodo
        INNER JOIN CURSO c ON c.id_curso = cp.id_curso
        INNER JOIN PERIODO_ACADEMICO pa ON pa.id_periodo = cp.id_periodo
        WHERE i.id_estudiante = ? AND i.estado = 'A'
        ORDER BY pa.\`año\` DESC, pa.semestre DESC
    `, [idEstudiante]);
    return filas.map((f) => ({
        ...f,
        etiqueta: `${f.anio} · Semestre ${f.semestre} · ${f.nombre_curso}`
    }));
};

const calcularPromedio = (evaluaciones) => {
    const calificadas = evaluaciones.filter((e) => e.nota !== null);
    if (calificadas.length === 0) return null;
    const pesoTotal = calificadas.reduce((s, e) => s + (e.porcentaje || 0), 0);
    if (pesoTotal > 0) {
        return redondear(calificadas.reduce((s, e) => s + e.nota * (e.porcentaje || 0), 0) / pesoTotal);
    }
    return redondear(calificadas.reduce((s, e) => s + e.nota, 0) / calificadas.length);
};

const estadoDe = (promedio) => {
    if (promedio === null) return 'PENDIENTE';
    return promedio >= NOTA_APROBACION ? 'APROBADO' : 'REPROBADO';
};

const construirBoletin = async (conn, idEstudiante, idCursoPeriodo) => {
    const [asignaturas] = await conn.query(`
        SELECT
            ca.id_curso_asig,
            a.id_asignatura,
            a.nombre AS asignatura,
            TRIM(CONCAT(COALESCE(pp.nombre, ''), ' ', COALESCE(pp.apellido, ''))) AS profesor
        FROM CURSO_ASIGNATURA ca
        INNER JOIN ASIGNATURA a ON a.id_asignatura = ca.id_asignatura
        LEFT JOIN PROFESOR pr ON pr.id_profesor = ca.id_profesor
        LEFT JOIN PERSONA pp ON pp.id_persona = pr.id_persona
        WHERE ca.id_curso_periodo = ?
        ORDER BY a.nombre ASC
    `, [idCursoPeriodo]);

    const [evaluaciones] = await conn.query(`
        SELECT
            e.id_evaluacion,
            e.id_curso_asig,
            e.nombre,
            e.tipo,
            e.fecha,
            e.puntaje_maximo,
            e.porcentaje,
            c.puntaje_obtenido,
            c.nota,
            c.observacion
        FROM EVALUACION e
        INNER JOIN CURSO_ASIGNATURA ca ON ca.id_curso_asig = e.id_curso_asig
        LEFT JOIN CALIFICACION c ON c.id_evaluacion = e.id_evaluacion AND c.id_estudiante = ?
        WHERE ca.id_curso_periodo = ? AND e.estado = 'A'
        ORDER BY e.fecha ASC, e.id_evaluacion ASC
    `, [idEstudiante, idCursoPeriodo]);

    const porAsignatura = new Map();
    asignaturas.forEach((a) => {
        if (!porAsignatura.has(a.id_asignatura)) {
            porAsignatura.set(a.id_asignatura, {
                id_asignatura: a.id_asignatura,
                nombre: a.asignatura,
                profesor: a.profesor || 'Sin profesor asignado',
                idsCursoAsig: new Set(),
                evaluaciones: []
            });
        }
        porAsignatura.get(a.id_asignatura).idsCursoAsig.add(a.id_curso_asig);
    });

    const idsVistos = new Set();
    evaluaciones.forEach((e) => {
        if (idsVistos.has(e.id_evaluacion)) return;
        idsVistos.add(e.id_evaluacion);
        const destino = Array.from(porAsignatura.values()).find((a) => a.idsCursoAsig.has(e.id_curso_asig));
        if (!destino) return;
        destino.evaluaciones.push({
            id_evaluacion: e.id_evaluacion,
            nombre: e.nombre,
            tipo: e.tipo,
            fecha: e.fecha,
            puntajeMaximo: numero(e.puntaje_maximo),
            porcentaje: numero(e.porcentaje) || 0,
            puntaje: numero(e.puntaje_obtenido),
            nota: numero(e.nota),
            observacion: e.observacion || ''
        });
    });

    const resultado = Array.from(porAsignatura.values()).map((a) => {
        const promedio = calcularPromedio(a.evaluaciones);
        const calificadas = a.evaluaciones.filter((e) => e.nota !== null);
        return {
            id_asignatura: a.id_asignatura,
            nombre: a.nombre,
            profesor: a.profesor,
            evaluaciones: a.evaluaciones,
            total: a.evaluaciones.length,
            calificadas: calificadas.length,
            cobertura: Math.min(100, calificadas.reduce((s, e) => s + e.porcentaje, 0)),
            promedio,
            estado: estadoDe(promedio),
            observacion: [...calificadas].reverse().map((e) => e.observacion).find((o) => o) || ''
        };
    });

    const conPromedio = resultado.filter((a) => a.promedio !== null);
    const promedioGeneral = conPromedio.length
        ? redondear(conPromedio.reduce((s, a) => s + a.promedio, 0) / conPromedio.length)
        : null;

    return {
        asignaturas: resultado,
        promedioGeneral,
        estadoGeneral: estadoDe(promedioGeneral),
        resumen: {
            asignaturas: resultado.length,
            aprobadas: resultado.filter((a) => a.estado === 'APROBADO').length,
            reprobadas: resultado.filter((a) => a.estado === 'REPROBADO').length,
            pendientes: resultado.filter((a) => a.estado === 'PENDIENTE').length,
            notas: resultado.reduce((s, a) => s + a.calificadas, 0)
        }
    };
};

const formatoNota = (n) => (n === null || n === undefined ? '-' : n.toFixed(1));

const formatoFecha = (valor) => {
    if (!valor) return '';
    const d = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(d.getTime())) return String(valor).slice(0, 10);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

module.exports = {
    NOTA_APROBACION,
    numero,
    calcularPromedio,
    estadoDe,
    pupilosDelApoderado,
    periodosDelEstudiante,
    construirBoletin,
    formatoNota,
    formatoFecha
};
