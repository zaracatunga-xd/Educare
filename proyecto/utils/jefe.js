const { numero, calcularPromedio, estadoDe } = require('./boletin');

const ROL_JEFE = 'profesor jefe';
const UMBRAL_ASISTENCIA = 85;

const esJefe = (usuario) => !!usuario && String(usuario.rol || '').toLowerCase() === ROL_JEFE;

const soloJefe = (req, res, next) => {
    const usuario = req.session.user || req.session.usuario;
    if (!usuario) return res.redirect('/login');
    if (!esJefe(usuario)) return res.redirect('/');
    next();
};

const cursosJefatura = async (conn, idPersona) => {
    const [filas] = await conn.query(`
        SELECT
            cp.id_curso_periodo,
            cp.id_periodo,
            c.id_curso,
            c.nivel,
            c.seccion,
            c.jornada,
            c.sala,
            pa.\`año\` AS anio,
            pa.semestre
        FROM CURSO_PERIODO cp
        INNER JOIN PROFESOR pr ON pr.id_profesor = cp.id_profesor_jefe
        INNER JOIN CURSO c ON c.id_curso = cp.id_curso
        INNER JOIN PERIODO_ACADEMICO pa ON pa.id_periodo = cp.id_periodo
        WHERE pr.id_persona = ?
        ORDER BY pa.\`año\` DESC, pa.semestre DESC, c.nivel ASC, c.seccion ASC
    `, [idPersona]);
    return filas.map((f) => ({
        ...f,
        nombre_curso: `${f.nivel} ${f.seccion}`.trim(),
        etiqueta: `${f.nivel} ${f.seccion} · ${f.anio}-${f.semestre}`
    }));
};

const resolverCurso = (cursos, idParam) => {
    const id = parseInt(idParam, 10);
    return cursos.find((c) => c.id_curso_periodo === id) || cursos[0] || null;
};

const estudiantesCurso = async (conn, curso) => {
    const [filas] = await conn.query(`
        SELECT
            e.id_estudiante,
            i.id_inscripcion,
            p.rut,
            p.nombre,
            p.apellido,
            p.fecha_nacimiento,
            p.genero
        FROM INSCRIPCION i
        INNER JOIN ESTUDIANTE e ON e.id_estudiante = i.id_estudiante
        INNER JOIN PERSONA p ON p.id_persona = e.id_persona
        WHERE i.id_curso_periodo = ? AND i.estado = 'A'
        ORDER BY p.apellido ASC, p.nombre ASC
    `, [curso.id_curso_periodo]);

    const [fudeis] = await conn.query(`
        SELECT f.id_estudiante, f.estado, tn.nombre AS nee, tn.clasificacion
        FROM FUDEI f
        INNER JOIN TIPO_NEE tn ON tn.id_tipo_nee = f.id_tipo_nee
        WHERE f.id_periodo = ?
    `, [curso.id_periodo]);
    const porEstudiante = new Map(fudeis.map((f) => [f.id_estudiante, f]));

    return filas.map((e) => {
        const f = porEstudiante.get(e.id_estudiante);
        return {
            ...e,
            nombre_completo: `${e.nombre} ${e.apellido}`,
            nee: f ? f.nee : null,
            nee_clasificacion: f ? f.clasificacion : null,
            fudei_estado: f ? f.estado : null
        };
    });
};

const calcularEdad = (fecha) => {
    if (!fecha) return null;
    const nac = fecha instanceof Date ? fecha : new Date(fecha);
    if (Number.isNaN(nac.getTime())) return null;
    const hoy = new Date();
    let edad = hoy.getFullYear() - nac.getFullYear();
    const cumple = hoy.getMonth() > nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() >= nac.getDate());
    if (!cumple) edad -= 1;
    return edad;
};

const notasCurso = async (conn, curso, estudiantes) => {
    const [asignaturas] = await conn.query(`
        SELECT
            ca.id_curso_asig,
            a.id_asignatura,
            a.nombre AS asignatura,
            pr.id_profesor,
            p.nombre AS prof_nombre,
            p.apellido AS prof_apellido
        FROM CURSO_ASIGNATURA ca
        INNER JOIN ASIGNATURA a ON a.id_asignatura = ca.id_asignatura
        INNER JOIN PROFESOR pr ON pr.id_profesor = ca.id_profesor
        INNER JOIN PERSONA p ON p.id_persona = pr.id_persona
        WHERE ca.id_curso_periodo = ?
        ORDER BY a.nombre ASC
    `, [curso.id_curso_periodo]);

    const [evaluaciones] = await conn.query(`
        SELECT id_evaluacion, id_curso_asig, nombre, tipo, fecha, porcentaje
        FROM EVALUACION
        WHERE id_curso_periodo = ? AND estado = 'A'
        ORDER BY fecha ASC, id_evaluacion ASC
    `, [curso.id_curso_periodo]);

    const [calificaciones] = await conn.query(`
        SELECT c.id_evaluacion, c.id_estudiante, c.nota
        FROM CALIFICACION c
        INNER JOIN EVALUACION e ON e.id_evaluacion = c.id_evaluacion
        WHERE e.id_curso_periodo = ? AND e.estado = 'A' AND c.nota IS NOT NULL
    `, [curso.id_curso_periodo]);

    const notas = new Map(calificaciones.map((c) => [`${c.id_estudiante}-${c.id_evaluacion}`, numero(c.nota)]));
    const evalsPorAsig = new Map();
    evaluaciones.forEach((e) => {
        if (!evalsPorAsig.has(e.id_curso_asig)) evalsPorAsig.set(e.id_curso_asig, []);
        evalsPorAsig.get(e.id_curso_asig).push({ ...e, porcentaje: numero(e.porcentaje) || 0 });
    });

    const columnas = asignaturas.map((a) => ({
        id_curso_asig: a.id_curso_asig,
        nombre: a.asignatura,
        profesor: `${a.prof_nombre} ${a.prof_apellido}`,
        evaluaciones: (evalsPorAsig.get(a.id_curso_asig) || []).length
    }));

    const filas = estudiantes.map((est) => {
        const promedios = asignaturas.map((a) => {
            const items = (evalsPorAsig.get(a.id_curso_asig) || []).map((ev) => ({
                nota: notas.has(`${est.id_estudiante}-${ev.id_evaluacion}`) ? notas.get(`${est.id_estudiante}-${ev.id_evaluacion}`) : null,
                porcentaje: ev.porcentaje
            }));
            return calcularPromedio(items);
        });
        const validos = promedios.filter((p) => p !== null);
        const general = validos.length ? Math.round((validos.reduce((s, p) => s + p, 0) / validos.length) * 10) / 10 : null;
        return {
            ...est,
            promedios,
            general,
            estado: estadoDe(general),
            reprobadas: promedios.filter((p) => p !== null && p < 4).length
        };
    });

    const promediosColumna = columnas.map((_, i) => {
        const vals = filas.map((f) => f.promedios[i]).filter((p) => p !== null);
        return vals.length ? Math.round((vals.reduce((s, p) => s + p, 0) / vals.length) * 10) / 10 : null;
    });
    const generales = filas.map((f) => f.general).filter((g) => g !== null);
    const promedioCurso = generales.length ? Math.round((generales.reduce((s, g) => s + g, 0) / generales.length) * 10) / 10 : null;

    columnas.forEach((c, i) => {
        c.promedio = promediosColumna[i];
        c.reprobados = filas.filter((f) => f.promedios[i] !== null && f.promedios[i] < 4).length;
    });

    return { columnas, filas, promedioCurso };
};

const asistenciaCurso = async (conn, curso, estudiantes) => {
    const [conteos] = await conn.query(`
        SELECT a.id_estudiante, s.id_curso_asig, a.estado, COUNT(*) AS total
        FROM ASISTENCIA a
        INNER JOIN SESION_CLASE s ON s.id_sesion = a.id_sesion
        WHERE a.id_curso_periodo = ?
        GROUP BY a.id_estudiante, s.id_curso_asig, a.estado
    `, [curso.id_curso_periodo]);

    const [sesiones] = await conn.query(
        'SELECT COUNT(*) AS total FROM SESION_CLASE WHERE id_curso_periodo = ?',
        [curso.id_curso_periodo]
    );

    const porEstudiante = new Map();
    const porAsignatura = new Map();
    const sumar = (mapa, clave, estado, total) => {
        if (!mapa.has(clave)) mapa.set(clave, { Presente: 0, Ausente: 0, Tardanza: 0 });
        mapa.get(clave)[estado] = (mapa.get(clave)[estado] || 0) + Number(total);
    };
    conteos.forEach((c) => {
        sumar(porEstudiante, c.id_estudiante, c.estado, c.total);
        sumar(porAsignatura, c.id_curso_asig, c.estado, c.total);
    });

    const porcentaje = (r) => {
        const total = r.Presente + r.Ausente + r.Tardanza;
        return total ? Math.round(((r.Presente + r.Tardanza) / total) * 1000) / 10 : null;
    };

    const filas = estudiantes.map((e) => {
        const r = porEstudiante.get(e.id_estudiante) || { Presente: 0, Ausente: 0, Tardanza: 0 };
        const pct = porcentaje(r);
        return {
            ...e,
            presentes: r.Presente,
            ausentes: r.Ausente,
            tardanzas: r.Tardanza,
            registros: r.Presente + r.Ausente + r.Tardanza,
            porcentaje: pct,
            alerta: pct !== null && pct < UMBRAL_ASISTENCIA
        };
    });

    const global = { Presente: 0, Ausente: 0, Tardanza: 0 };
    porEstudiante.forEach((r) => { Object.keys(global).forEach((k) => { global[k] += r[k]; }); });

    return {
        filas,
        porAsignatura,
        porcentajeCurso: porcentaje(global),
        totalSesiones: Number(sesiones[0].total) || 0,
        porcentaje
    };
};

const apoderadosCurso = async (conn, curso) => {
    const [filas] = await conn.query(`
        SELECT
            u.id_usuario,
            ap.id_apoderado,
            pa.nombre,
            pa.apellido,
            pa.rut,
            u.correo,
            ap.telefono,
            ae.parentesco,
            e.id_estudiante,
            pe.nombre AS est_nombre,
            pe.apellido AS est_apellido
        FROM INSCRIPCION i
        INNER JOIN ESTUDIANTE e ON e.id_estudiante = i.id_estudiante
        INNER JOIN PERSONA pe ON pe.id_persona = e.id_persona
        INNER JOIN APODERADO_ESTUDIANTE ae ON ae.id_estudiante = e.id_estudiante AND ae.estado = 'A'
        INNER JOIN APODERADO ap ON ap.id_apoderado = ae.id_apoderado
        INNER JOIN PERSONA pa ON pa.id_persona = ap.id_persona
        LEFT JOIN USUARIO u ON u.id_persona = ap.id_persona
        WHERE i.id_curso_periodo = ? AND i.estado = 'A'
        ORDER BY pa.apellido ASC, pa.nombre ASC, pe.nombre ASC
    `, [curso.id_curso_periodo]);

    const mapa = new Map();
    filas.forEach((f) => {
        if (!mapa.has(f.id_apoderado)) {
            mapa.set(f.id_apoderado, {
                id_apoderado: f.id_apoderado,
                id_usuario: f.id_usuario,
                nombre_completo: `${f.nombre} ${f.apellido}`,
                rut: f.rut,
                correo: f.correo,
                telefono: f.telefono,
                pupilos: []
            });
        }
        mapa.get(f.id_apoderado).pupilos.push({
            id_estudiante: f.id_estudiante,
            nombre: `${f.est_nombre} ${f.est_apellido}`,
            parentesco: f.parentesco
        });
    });
    return Array.from(mapa.values());
};

const estudianteDeJefatura = async (conn, curso, idEstudiante) => {
    const [filas] = await conn.query(`
        SELECT e.id_estudiante, p.rut, p.nombre, p.apellido, p.fecha_nacimiento, p.genero
        FROM INSCRIPCION i
        INNER JOIN ESTUDIANTE e ON e.id_estudiante = i.id_estudiante
        INNER JOIN PERSONA p ON p.id_persona = e.id_persona
        WHERE i.id_curso_periodo = ? AND i.estado = 'A' AND e.id_estudiante = ?
        LIMIT 1
    `, [curso.id_curso_periodo, idEstudiante]);
    return filas[0] || null;
};

const sincronizarRolJefe = async (conn, idProfesor) => {
    const [usuarios] = await conn.query(`
        SELECT u.id_usuario
        FROM PROFESOR pr
        INNER JOIN USUARIO u ON u.id_persona = pr.id_persona
        WHERE pr.id_profesor = ?
    `, [idProfesor]);
    if (usuarios.length === 0) return;

    const [jefaturas] = await conn.query('SELECT COUNT(*) AS total FROM CURSO_PERIODO WHERE id_profesor_jefe = ?', [idProfesor]);
    const destino = Number(jefaturas[0].total) > 0 ? 'Profesor Jefe' : 'Profesor';
    const [roles] = await conn.query('SELECT id_rol FROM ROL WHERE nombre = ?', [destino]);
    if (roles.length === 0) return;

    await conn.query(`
        UPDATE USUARIO_ROL SET id_rol = ?
        WHERE id_usuario = ? AND id_rol IN (SELECT id_rol FROM ROL WHERE nombre IN ('Profesor', 'Profesor Jefe'))
    `, [roles[0].id_rol, usuarios[0].id_usuario]);
};

module.exports = {
    UMBRAL_ASISTENCIA,
    esJefe,
    soloJefe,
    cursosJefatura,
    resolverCurso,
    estudiantesCurso,
    calcularEdad,
    notasCurso,
    asistenciaCurso,
    apoderadosCurso,
    estudianteDeJefatura,
    sincronizarRolJefe
};
