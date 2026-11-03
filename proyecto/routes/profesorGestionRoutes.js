const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const {
    hoyIso,
    esFechaValida,
    validarNoFutura,
    validarPosterior,
    primerError
} = require('../utils/fechas');
const {
    sesionUsuario,
    soloProfesor,
    aIso,
    lista,
    texto,
    asignacionesProfesor,
    asignacionDelProfesor,
    estudiantesInscritos,
    estudianteDelProfesor
} = require('../utils/profesor');

router.use(
    ['/profesor/fudei', '/profesor/asistencia', '/profesor/calificaciones', '/profesor/atencionApo', '/profesor/enviar-aviso-masivo', '/profesor/comunicados'],
    soloProfesor
);

const ESTADOS_ASISTENCIA = ['Presente', 'Ausente', 'Tardanza'];
const TIPOS_EVALUACION = ['Prueba', 'Control', 'Trabajo', 'Tarea', 'Proyecto', 'Otro'];
const PRIORIDADES = ['Baja', 'Normal', 'Alta'];
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const mensajeError = (error, generico) => (error && error.sqlState === '45000' ? error.sqlMessage : generico);

const desplazarDias = (dias) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return aIso(d);
};

// ==========================================
// ASISTENCIA
// ==========================================
router.get('/profesor/asistencia', async (req, res) => {
    let connection;
    const usuario = sesionUsuario(req);
    try {
        connection = await pool.getConnection();

        const asignaciones = await asignacionesProfesor(connection, usuario.id_persona);
        const seleccionada = asignaciones.find((a) => String(a.id_curso_asig) === String(req.query.id_curso_asig)) || asignaciones[0] || null;

        const hoy = hoyIso();
        let fecha = aIso(req.query.fecha);
        if (!esFechaValida(fecha) || fecha > hoy) fecha = hoy;

        let sesiones = [];
        let sesionActual = null;
        let estudiantes = [];

        if (seleccionada) {
            const [filasSesiones] = await connection.query(`
                SELECT id_sesion, TIME_FORMAT(hora_inicio, '%H:%i') AS hora_inicio, TIME_FORMAT(hora_fin, '%H:%i') AS hora_fin, sala
                FROM SESION_CLASE
                WHERE id_curso_asig = ? AND fecha = ?
                ORDER BY hora_inicio ASC
            `, [seleccionada.id_curso_asig, fecha]);
            sesiones = filasSesiones;

            if (req.query.id_sesion !== 'nueva') {
                sesionActual = sesiones.find((s) => String(s.id_sesion) === String(req.query.id_sesion)) || sesiones[0] || null;
            }

            estudiantes = await estudiantesInscritos(connection, seleccionada.id_curso_periodo);

            if (sesionActual) {
                const [registros] = await connection.query(
                    'SELECT id_estudiante, estado, observacion FROM ASISTENCIA WHERE id_sesion = ?',
                    [sesionActual.id_sesion]
                );
                const porEstudiante = new Map(registros.map((r) => [r.id_estudiante, r]));
                estudiantes = estudiantes.map((e) => {
                    const r = porEstudiante.get(e.id_estudiante);
                    return { ...e, estado: r ? r.estado : '', observacion: r ? r.observacion || '' : '' };
                });
            } else {
                estudiantes = estudiantes.map((e) => ({ ...e, estado: '', observacion: '' }));
            }
        }

        res.render('profesor/asistencia', {
            title: 'Control de Asistencia - Educare',
            user: usuario,
            asignaciones,
            seleccionada,
            fecha,
            hoy,
            sesiones,
            sesionActual,
            estudiantes,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('❌ Error al cargar asistencia:', error.message);
        res.render('profesor/asistencia', {
            title: 'Control de Asistencia - Educare',
            user: usuario,
            asignaciones: [],
            seleccionada: null,
            fecha: hoyIso(),
            hoy: hoyIso(),
            sesiones: [],
            sesionActual: null,
            estudiantes: [],
            error: 'Ocurrió un error al cargar la asistencia.',
            success: null
        });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/profesor/asistencia/guardar', async (req, res) => {
    const usuario = sesionUsuario(req);
    const { id_curso_asig, fecha, id_sesion, hora_inicio, hora_fin, sala, registros } = req.body;
    const falla = (mensaje, codigo = 400) => res.status(codigo).json({ ok: false, error: mensaje });

    if (!esFechaValida(fecha)) return falla('La fecha no es válida.');
    const errorFecha = validarNoFutura(fecha, 'La fecha de asistencia');
    if (errorFecha) return falla(errorFecha);
    if (!Array.isArray(registros) || registros.length === 0) return falla('No hay registros de asistencia para guardar.');
    if (registros.length > 300) return falla('Se enviaron demasiados registros.');

    let connection;
    try {
        connection = await pool.getConnection();

        const asignacion = await asignacionDelProfesor(connection, id_curso_asig, usuario.id_persona);
        if (!asignacion) return falla('No tienes asignado este curso y asignatura.', 403);

        const idSesionNumero = parseInt(id_sesion, 10);
        const nuevaSesion = !Number.isInteger(idSesionNumero) || idSesionNumero <= 0;
        if (nuevaSesion) {
            if (!REGEX_HORA.test(hora_inicio || '') || !REGEX_HORA.test(hora_fin || '')) return falla('Indica la hora de inicio y término de la clase.');
            if (hora_fin <= hora_inicio) return falla('La hora de término debe ser posterior a la de inicio.');
        }

        const inscritos = await estudiantesInscritos(connection, asignacion.id_curso_periodo);
        const porEstudiante = new Map(inscritos.map((e) => [e.id_estudiante, e]));

        for (const r of registros) {
            if (!porEstudiante.has(Number(r.id_estudiante))) return falla('Hay estudiantes que no pertenecen a este curso.');
            if (!ESTADOS_ASISTENCIA.includes(r.estado)) return falla('Estado de asistencia no válido.');
            if (typeof r.observacion === 'string' && r.observacion.length > 255) return falla('La observación no puede superar los 255 caracteres.');
        }

        await connection.beginTransaction();

        let idSesionFinal = idSesionNumero;
        if (nuevaSesion) {
            const [resultado] = await connection.query(`
                INSERT INTO SESION_CLASE (id_curso_asig, id_curso_periodo, fecha, hora_inicio, hora_fin, sala)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [asignacion.id_curso_asig, asignacion.id_curso_periodo, fecha, hora_inicio, hora_fin, texto(sala)]);
            idSesionFinal = resultado.insertId;
        } else {
            const [sesion] = await connection.query(
                'SELECT id_sesion FROM SESION_CLASE WHERE id_sesion = ? AND id_curso_asig = ? AND fecha = ?',
                [idSesionFinal, asignacion.id_curso_asig, fecha]
            );
            if (sesion.length === 0) {
                await connection.rollback();
                return falla('La clase seleccionada no existe para esa fecha.');
            }
        }

        for (const r of registros) {
            const estudiante = porEstudiante.get(Number(r.id_estudiante));
            await connection.query(`
                INSERT INTO ASISTENCIA (id_sesion, id_estudiante, id_inscripcion, id_curso_periodo, estado, observacion)
                VALUES (?, ?, ?, ?, ?, ?)
                AS nuevo
                ON DUPLICATE KEY UPDATE estado = nuevo.estado, observacion = nuevo.observacion
            `, [idSesionFinal, estudiante.id_estudiante, estudiante.id_inscripcion, asignacion.id_curso_periodo, r.estado, texto(r.observacion)]);
        }

        await connection.commit();
        res.json({ ok: true, id_sesion: idSesionFinal, guardados: registros.length });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error al guardar asistencia:', error.message);
        falla(mensajeError(error, 'No se pudo guardar la asistencia.'), 500);
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// CALIFICACIONES
// ==========================================
router.get('/profesor/calificaciones', async (req, res) => {
    let connection;
    const usuario = sesionUsuario(req);
    try {
        connection = await pool.getConnection();

        const asignaciones = await asignacionesProfesor(connection, usuario.id_persona);
        const idEstudianteDestacado = parseInt(req.query.estudiante, 10) || null;

        let seleccionada = asignaciones.find((a) => String(a.id_curso_asig) === String(req.query.id_curso_asig)) || null;
        if (!seleccionada && idEstudianteDestacado) {
            const [cursosDelAlumno] = await connection.query(
                "SELECT id_curso_periodo FROM INSCRIPCION WHERE id_estudiante = ? AND estado = 'A'",
                [idEstudianteDestacado]
            );
            const ids = new Set(cursosDelAlumno.map((c) => c.id_curso_periodo));
            seleccionada = asignaciones.find((a) => ids.has(a.id_curso_periodo)) || null;
        }
        seleccionada = seleccionada || asignaciones[0] || null;

        let evaluaciones = [];
        let estudiantes = [];
        let porcentajeUsado = 0;

        if (seleccionada) {
            const [filasEvaluaciones] = await connection.query(`
                SELECT id_evaluacion, nombre, tipo, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, porcentaje
                FROM EVALUACION
                WHERE id_curso_asig = ? AND estado = 'A'
                ORDER BY fecha ASC, id_evaluacion ASC
            `, [seleccionada.id_curso_asig]);
            evaluaciones = filasEvaluaciones.map((e) => ({ ...e, porcentaje: Number(e.porcentaje) }));
            porcentajeUsado = evaluaciones.reduce((s, e) => s + e.porcentaje, 0);

            const inscritos = await estudiantesInscritos(connection, seleccionada.id_curso_periodo);

            const [calificaciones] = await connection.query(`
                SELECT c.id_estudiante, c.id_evaluacion, c.nota, c.observacion, e.fecha
                FROM CALIFICACION c
                INNER JOIN EVALUACION e ON e.id_evaluacion = c.id_evaluacion
                WHERE e.id_curso_asig = ? AND e.estado = 'A'
                ORDER BY e.fecha ASC, e.id_evaluacion ASC
            `, [seleccionada.id_curso_asig]);

            const notas = new Map();
            const observaciones = new Map();
            calificaciones.forEach((c) => {
                if (c.nota === null) return;
                notas.set(`${c.id_estudiante}-${c.id_evaluacion}`, Number(c.nota));
                observaciones.set(c.id_estudiante, c.observacion || '');
            });

            estudiantes = inscritos.map((e) => ({
                ...e,
                notas: Object.fromEntries(evaluaciones.map((ev) => [ev.id_evaluacion, notas.get(`${e.id_estudiante}-${ev.id_evaluacion}`) ?? null])),
                observacion: observaciones.get(e.id_estudiante) || ''
            }));
        }

        res.render('profesor/notasP', {
            title: 'Registro de Calificaciones - Educare',
            user: usuario,
            asignaciones,
            seleccionada,
            evaluaciones,
            estudiantes,
            porcentajeUsado,
            idEstudianteDestacado,
            hoy: hoyIso(),
            fechaMin: desplazarDias(-365),
            fechaMax: desplazarDias(365)
        });
    } catch (error) {
        console.error('❌ Error al cargar calificaciones:', error.message);
        res.render('profesor/notasP', {
            title: 'Registro de Calificaciones - Educare',
            user: usuario,
            asignaciones: [],
            seleccionada: null,
            evaluaciones: [],
            estudiantes: [],
            porcentajeUsado: 0,
            idEstudianteDestacado: null,
            hoy: hoyIso(),
            fechaMin: desplazarDias(-365),
            fechaMax: desplazarDias(365)
        });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/profesor/calificaciones/guardar', async (req, res) => {
    const usuario = sesionUsuario(req);
    const { id_curso_asig, notas, observaciones } = req.body;
    const falla = (mensaje, codigo = 400) => res.status(codigo).json({ ok: false, error: mensaje });

    const listaNotas = Array.isArray(notas) ? notas : [];
    const listaObservaciones = Array.isArray(observaciones) ? observaciones : [];
    if (listaNotas.length === 0 && listaObservaciones.length === 0) return falla('No hay cambios para guardar.');
    if (listaNotas.length > 2000) return falla('Se enviaron demasiados registros.');

    let connection;
    try {
        connection = await pool.getConnection();

        const asignacion = await asignacionDelProfesor(connection, id_curso_asig, usuario.id_persona);
        if (!asignacion) return falla('No tienes asignado este curso y asignatura.', 403);

        const inscritos = await estudiantesInscritos(connection, asignacion.id_curso_periodo);
        const porEstudiante = new Map(inscritos.map((e) => [e.id_estudiante, e]));

        const [evaluaciones] = await connection.query(
            "SELECT id_evaluacion FROM EVALUACION WHERE id_curso_asig = ? AND estado = 'A'",
            [asignacion.id_curso_asig]
        );
        const idsEvaluacion = new Set(evaluaciones.map((e) => e.id_evaluacion));

        const cambios = [];
        for (const n of listaNotas) {
            const idEstudiante = Number(n.id_estudiante);
            const idEvaluacion = Number(n.id_evaluacion);
            if (!porEstudiante.has(idEstudiante) || !idsEvaluacion.has(idEvaluacion)) return falla('Hay notas que no corresponden a este curso.');

            const crudo = n.nota === null || n.nota === undefined ? '' : String(n.nota).replace(',', '.').trim();
            if (crudo === '') {
                cambios.push({ idEstudiante, idEvaluacion, nota: null });
                continue;
            }
            const valor = Number(crudo);
            if (!Number.isFinite(valor) || valor < 1 || valor > 7) return falla('Las notas deben estar entre 1.0 y 7.0.');
            cambios.push({ idEstudiante, idEvaluacion, nota: Math.round(valor * 100) / 100 });
        }

        for (const o of listaObservaciones) {
            if (!porEstudiante.has(Number(o.id_estudiante))) return falla('Hay observaciones que no corresponden a este curso.');
            if (typeof o.observacion === 'string' && o.observacion.length > 255) return falla('La observación no puede superar los 255 caracteres.');
        }

        await connection.beginTransaction();

        for (const c of cambios) {
            if (c.nota === null) {
                await connection.query('DELETE FROM CALIFICACION WHERE id_evaluacion = ? AND id_estudiante = ?', [c.idEvaluacion, c.idEstudiante]);
                continue;
            }
            const estudiante = porEstudiante.get(c.idEstudiante);
            await connection.query(`
                INSERT INTO CALIFICACION (id_evaluacion, id_estudiante, id_inscripcion, id_curso_periodo, puntaje_obtenido, nota)
                VALUES (?, ?, ?, ?, NULL, ?)
                AS nueva
                ON DUPLICATE KEY UPDATE nota = nueva.nota, puntaje_obtenido = NULL
            `, [c.idEvaluacion, c.idEstudiante, estudiante.id_inscripcion, asignacion.id_curso_periodo, c.nota]);
        }

        for (const o of listaObservaciones) {
            const idEstudiante = Number(o.id_estudiante);
            await connection.query(`
                UPDATE CALIFICACION c
                INNER JOIN EVALUACION e ON e.id_evaluacion = c.id_evaluacion
                SET c.observacion = NULL
                WHERE c.id_estudiante = ? AND e.id_curso_asig = ?
            `, [idEstudiante, asignacion.id_curso_asig]);

            const observacion = texto(o.observacion);
            if (!observacion) continue;

            const [ultima] = await connection.query(`
                SELECT c.id_calificacion
                FROM CALIFICACION c
                INNER JOIN EVALUACION e ON e.id_evaluacion = c.id_evaluacion
                WHERE c.id_estudiante = ? AND e.id_curso_asig = ? AND e.estado = 'A' AND c.nota IS NOT NULL
                ORDER BY e.fecha DESC, e.id_evaluacion DESC
                LIMIT 1
            `, [idEstudiante, asignacion.id_curso_asig]);

            if (ultima.length > 0) {
                await connection.query('UPDATE CALIFICACION SET observacion = ? WHERE id_calificacion = ?', [observacion, ultima[0].id_calificacion]);
            }
        }

        await connection.commit();
        res.json({ ok: true, notas: cambios.length, observaciones: listaObservaciones.length });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error al guardar calificaciones:', error.message);
        falla(mensajeError(error, 'No se pudieron guardar las calificaciones.'), 500);
    } finally {
        if (connection) connection.release();
    }
});

router.post('/profesor/calificaciones/evaluacion', async (req, res) => {
    const usuario = sesionUsuario(req);
    const { id_curso_asig, nombre, tipo, fecha, porcentaje } = req.body;
    const falla = (mensaje, codigo = 400) => res.status(codigo).json({ ok: false, error: mensaje });

    const nombreLimpio = texto(nombre);
    if (!nombreLimpio) return falla('Indica el nombre de la evaluación.');
    if (nombreLimpio.length > 100) return falla('El nombre no puede superar los 100 caracteres.');
    if (!TIPOS_EVALUACION.includes(tipo)) return falla('Tipo de evaluación no válido.');
    if (!esFechaValida(fecha)) return falla('La fecha de la evaluación no es válida.');
    if (fecha < desplazarDias(-365) || fecha > desplazarDias(365)) return falla('La fecha debe estar dentro de un año desde hoy.');

    const peso = Number(String(porcentaje).replace(',', '.'));
    if (!Number.isFinite(peso) || peso <= 0 || peso > 100) return falla('La ponderación debe ser mayor a 0 y no superar 100%.');

    let connection;
    try {
        connection = await pool.getConnection();

        const asignacion = await asignacionDelProfesor(connection, id_curso_asig, usuario.id_persona);
        if (!asignacion) return falla('No tienes asignado este curso y asignatura.', 403);

        const [suma] = await connection.query(
            "SELECT COALESCE(SUM(porcentaje), 0) AS usado FROM EVALUACION WHERE id_curso_asig = ? AND estado = 'A'",
            [asignacion.id_curso_asig]
        );
        const disponible = Math.round((100 - Number(suma[0].usado)) * 100) / 100;
        if (peso > disponible) return falla(`Solo queda ${disponible}% de ponderación disponible en esta asignatura.`);

        await connection.query(`
            INSERT INTO EVALUACION (id_curso_asig, id_curso_periodo, nombre, tipo, fecha, puntaje_maximo, porcentaje)
            VALUES (?, ?, ?, ?, ?, 7, ?)
        `, [asignacion.id_curso_asig, asignacion.id_curso_periodo, nombreLimpio, tipo, fecha, Math.round(peso * 100) / 100]);

        res.json({ ok: true });
    } catch (error) {
        console.error('❌ Error al crear evaluación:', error.message);
        falla(mensajeError(error, 'No se pudo crear la evaluación.'), 500);
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// FUDEI
// ==========================================
const cargarFudei = async (connection, idEstudiante) => {
    const [fudeiRows] = await connection.query(
        'SELECT * FROM FUDEI WHERE id_estudiante = ? ORDER BY id_fudei DESC LIMIT 1',
        [idEstudiante]
    );
    const fudei = fudeiRows[0] || null;
    if (!fudei) return { fudei: null, sintesis: {}, evaluadores: [], apoyos: [] };

    fudei.fecha_evaluacion_fmt = aIso(fudei.fecha_evaluacion);
    fudei.fecha_vencimiento_fmt = aIso(fudei.fecha_vencimiento);

    const [sintesisRows] = await connection.query('SELECT * FROM FUDEI_SINTESIS_EVALUACION WHERE id_fudei = ? LIMIT 1', [fudei.id_fudei]);
    const [evaluadores] = await connection.query('SELECT * FROM FUDEI_EQUIPO_EVALUADOR WHERE id_fudei = ? ORDER BY id_equipo_evaluador ASC', [fudei.id_fudei]);
    const [apoyos] = await connection.query('SELECT * FROM FUDEI_APOYO WHERE id_fudei = ? ORDER BY id_apoyo ASC', [fudei.id_fudei]);

    return {
        fudei,
        sintesis: sintesisRows[0] || {},
        evaluadores: evaluadores.map((e) => ({ ...e, fecha_evaluacion_fmt: aIso(e.fecha_evaluacion) })),
        apoyos
    };
};

router.get('/profesor/fudei/:id', async (req, res) => {
    let connection;
    const usuario = sesionUsuario(req);
    try {
        connection = await pool.getConnection();

        const estudiante = await estudianteDelProfesor(connection, req.params.id, usuario.id_persona);
        if (!estudiante) return res.redirect('/profesor/estudiantes');
        estudiante.fecha_nacimiento_fmt = aIso(estudiante.fecha_nacimiento);

        const datos = await cargarFudei(connection, estudiante.id_estudiante);
        const [tiposNee] = await connection.query('SELECT id_tipo_nee, clasificacion, nombre FROM TIPO_NEE ORDER BY clasificacion, nombre');

        res.render('profesor/fudei', {
            title: 'Expediente FUDEI - Educare',
            user: usuario,
            estudiante,
            ...datos,
            tiposNee,
            hoy: hoyIso(),
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('❌ Error al cargar FUDEI:', error.message);
        res.redirect('/profesor/estudiantes');
    } finally {
        if (connection) connection.release();
    }
});

router.post('/profesor/fudei/:id', async (req, res) => {
    const idEstudiante = req.params.id;
    const usuario = sesionUsuario(req);
    const volver = (clave, mensaje) => res.redirect(`/profesor/fudei/${idEstudiante}?${clave}=${encodeURIComponent(mensaje)}`);
    const {
        id_tipo_nee, fecha_evaluacion, fecha_vencimiento,
        sintesis_salud, sintesis_psicoeducativa, sintesis_escolar, sintesis_social_familiar,
        evaluador_nombre, evaluador_rol, evaluador_registro, evaluador_fecha,
        apoyo_area, apoyo_descripcion, apoyo_horas
    } = req.body;

    const fechaEvaluacion = aIso(fecha_evaluacion);
    const fechaVencimiento = aIso(fecha_vencimiento) || null;
    const fechasEvaluadores = lista(evaluador_fecha).map(aIso);

    if (!fechaEvaluacion) return volver('error', 'La fecha de evaluación es obligatoria.');
    const errorFechas = primerError(
        esFechaValida(fechaEvaluacion) ? null : 'La fecha de evaluación no es válida.',
        validarNoFutura(fechaEvaluacion, 'La fecha de evaluación'),
        validarPosterior(fechaEvaluacion, fechaVencimiento, 'La fecha de vencimiento', 'la fecha de evaluación'),
        ...fechasEvaluadores.map((f) => validarNoFutura(f, 'La fecha del evaluador'))
    );
    if (errorFechas) return volver('error', errorFechas);

    const idTipoNee = parseInt(id_tipo_nee, 10);
    if (!Number.isInteger(idTipoNee) || idTipoNee <= 0) return volver('error', 'Selecciona el tipo de NEE.');

    let connection;
    try {
        connection = await pool.getConnection();

        const estudiante = await estudianteDelProfesor(connection, idEstudiante, usuario.id_persona);
        if (!estudiante) return res.redirect('/profesor/estudiantes');

        const [tipo] = await connection.query('SELECT id_tipo_nee FROM TIPO_NEE WHERE id_tipo_nee = ?', [idTipoNee]);
        if (tipo.length === 0) return volver('error', 'El tipo de NEE seleccionado no existe.');

        await connection.beginTransaction();

        const [fudeiRows] = await connection.query(
            'SELECT id_fudei, estado FROM FUDEI WHERE id_estudiante = ? ORDER BY id_fudei DESC LIMIT 1 FOR UPDATE',
            [estudiante.id_estudiante]
        );

        let idFudei;
        if (fudeiRows.length > 0) {
            if (fudeiRows[0].estado === 'FINALIZADO') {
                await connection.rollback();
                return volver('error', 'El FUDEI ya está finalizado y no admite modificaciones.');
            }
            idFudei = fudeiRows[0].id_fudei;
            await connection.query(
                'UPDATE FUDEI SET id_tipo_nee = ?, fecha_evaluacion = ?, fecha_vencimiento = ? WHERE id_fudei = ?',
                [idTipoNee, fechaEvaluacion, fechaVencimiento, idFudei]
            );
        } else {
            const [admin] = await connection.query(`
                SELECT ur.id_usuario
                FROM USUARIO_ROL ur
                INNER JOIN ROL r ON r.id_rol = ur.id_rol
                WHERE r.nombre = 'Administrador'
                ORDER BY ur.id_usuario ASC
                LIMIT 1
            `);
            const idDirector = admin.length > 0 ? admin[0].id_usuario : usuario.id_usuario;
            const [creado] = await connection.query(`
                INSERT INTO FUDEI (id_estudiante, id_periodo, id_tipo_nee, fecha_evaluacion, fecha_vencimiento, id_coordinador, id_director, estado)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'EN_PROCESO')
            `, [estudiante.id_estudiante, estudiante.id_periodo, idTipoNee, fechaEvaluacion, fechaVencimiento, usuario.id_usuario, idDirector]);
            idFudei = creado.insertId;
        }

        await connection.query(`
            INSERT INTO FUDEI_SINTESIS_EVALUACION (id_fudei, sintesis_salud, sintesis_psicoeducativa, sintesis_escolar, sintesis_social_familiar)
            VALUES (?, ?, ?, ?, ?)
            AS nuevo
            ON DUPLICATE KEY UPDATE
                sintesis_salud = nuevo.sintesis_salud,
                sintesis_psicoeducativa = nuevo.sintesis_psicoeducativa,
                sintesis_escolar = nuevo.sintesis_escolar,
                sintesis_social_familiar = nuevo.sintesis_social_familiar
        `, [idFudei, sintesis_salud || '', sintesis_psicoeducativa || '', sintesis_escolar || '', sintesis_social_familiar || '']);

        await connection.query('DELETE FROM FUDEI_EQUIPO_EVALUADOR WHERE id_fudei = ?', [idFudei]);
        const nombres = lista(evaluador_nombre);
        const roles = lista(evaluador_rol);
        const registros = lista(evaluador_registro);
        for (let i = 0; i < nombres.length; i++) {
            const nombre = texto(nombres[i]);
            if (!nombre) continue;
            await connection.query(`
                INSERT INTO FUDEI_EQUIPO_EVALUADOR (id_fudei, nombre_completo, rol_profesional, registro_profesional, fecha_evaluacion)
                VALUES (?, ?, ?, ?, ?)
            `, [idFudei, nombre, texto(roles[i]) || '', texto(registros[i]) || '', fechasEvaluadores[i] || fechaEvaluacion]);
        }

        await connection.query('DELETE FROM FUDEI_APOYO WHERE id_fudei = ?', [idFudei]);
        const areas = lista(apoyo_area);
        const descripciones = lista(apoyo_descripcion);
        const horas = lista(apoyo_horas);
        for (let i = 0; i < areas.length; i++) {
            const area = texto(areas[i]);
            if (!area) continue;
            const hrs = parseFloat(String(horas[i]).replace(',', '.'));
            await connection.query(`
                INSERT INTO FUDEI_APOYO (id_fudei, area_apoyo, descripcion_intervencion, frecuencia_semanal_hrs)
                VALUES (?, ?, ?, ?)
            `, [idFudei, area, texto(descripciones[i]) || '', Number.isFinite(hrs) && hrs > 0 ? hrs : 1]);
        }

        await connection.commit();
        volver('success', 'El expediente FUDEI se guardó correctamente.');
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error al guardar FUDEI:', error.message);
        volver('error', mensajeError(error, 'No se pudo guardar el expediente FUDEI.'));
    } finally {
        if (connection) connection.release();
    }
});

router.post('/profesor/fudei/:id/finalizar', async (req, res) => {
    const idEstudiante = req.params.id;
    const usuario = sesionUsuario(req);
    const volver = (clave, mensaje) => res.redirect(`/profesor/fudei/${idEstudiante}?${clave}=${encodeURIComponent(mensaje)}`);

    let connection;
    try {
        connection = await pool.getConnection();

        const estudiante = await estudianteDelProfesor(connection, idEstudiante, usuario.id_persona);
        if (!estudiante) return res.redirect('/profesor/estudiantes');

        const datos = await cargarFudei(connection, estudiante.id_estudiante);
        if (!datos.fudei) return volver('error', 'Primero guarda el expediente FUDEI.');
        if (datos.fudei.estado === 'FINALIZADO') return volver('error', 'El FUDEI ya está finalizado.');

        const s = datos.sintesis;
        const completa = [s.sintesis_salud, s.sintesis_psicoeducativa, s.sintesis_escolar, s.sintesis_social_familiar]
            .every((v) => typeof v === 'string' && v.trim() !== '');
        if (!completa) return volver('error', 'Completa las cuatro síntesis de evaluación antes de finalizar el FUDEI.');

        await connection.query("UPDATE FUDEI SET estado = 'FINALIZADO' WHERE id_fudei = ?", [datos.fudei.id_fudei]);
        volver('success', 'El FUDEI fue finalizado y ya no admite modificaciones.');
    } catch (error) {
        console.error('❌ Error al finalizar FUDEI:', error.message);
        volver('error', mensajeError(error, 'No se pudo finalizar el FUDEI.'));
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// ATENCIÓN A APODERADOS Y AVISOS POR CURSO
// ==========================================
const cursosDelProfesor = async (connection, idPersona) => {
    const [cursos] = await connection.query(`
        SELECT DISTINCT
            c.id_curso,
            c.nivel,
            c.seccion,
            TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) AS nombre_curso
        FROM PROFESOR prof
        INNER JOIN CURSO_ASIGNATURA ca ON ca.id_profesor = prof.id_profesor
        INNER JOIN CURSO_PERIODO cp ON cp.id_curso_periodo = ca.id_curso_periodo
        INNER JOIN CURSO c ON c.id_curso = cp.id_curso
        WHERE prof.id_persona = ?
        ORDER BY c.nivel ASC, c.seccion ASC
    `, [idPersona]);
    return cursos;
};

const historialComunicados = async (connection, idUsuario) => {
    const [filas] = await connection.query(`
        SELECT
            a.id_aviso,
            a.titulo,
            a.contenido,
            a.prioridad,
            a.fecha_publicacion,
            GROUP_CONCAT(DISTINCT c.id_curso ORDER BY c.nivel, c.seccion SEPARATOR ',') AS ids_cursos,
            GROUP_CONCAT(DISTINCT TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) ORDER BY c.nivel, c.seccion SEPARATOR ', ') AS cursos
        FROM AVISO a
        LEFT JOIN AVISO_DESTINATARIO ad ON ad.id_aviso = a.id_aviso AND ad.tipo_destino = 'CURSO'
        LEFT JOIN CURSO c ON c.id_curso = ad.id_curso
        WHERE a.id_usuario = ? AND a.estado = 'A'
        GROUP BY a.id_aviso, a.titulo, a.contenido, a.prioridad, a.fecha_publicacion
        ORDER BY a.fecha_publicacion DESC, a.id_aviso DESC
        LIMIT 100
    `, [idUsuario]);
    return filas.map((f) => ({
        ...f,
        ids_cursos: f.ids_cursos || '',
        cursos: f.cursos || 'Sin curso',
        fecha_publicacion: f.fecha_publicacion instanceof Date ? f.fecha_publicacion.toISOString() : f.fecha_publicacion
    }));
};

const validarComunicado = (cuerpo) => {
    const titulo = texto(cuerpo.titulo);
    const contenido = texto(cuerpo.contenido);
    if (!titulo || !contenido) return { error: 'El título y el contenido del comunicado son obligatorios.' };
    if (titulo.length > 100) return { error: 'El título no puede superar los 100 caracteres.' };
    if (contenido.length > 2000) return { error: 'El contenido no puede superar los 2000 caracteres.' };
    return { titulo, contenido, prioridad: PRIORIDADES.includes(cuerpo.prioridad) ? cuerpo.prioridad : 'Normal' };
};

router.get('/profesor/atencionApo', async (req, res) => {
    let connection;
    const usuario = sesionUsuario(req);
    try {
        connection = await pool.getConnection();

        const [apoderados] = await connection.query(`
            SELECT
                ua.id_usuario AS id_usuario_apoderado,
                p_apo.nombre AS apo_nombre,
                p_apo.apellido AS apo_apellido,
                GROUP_CONCAT(DISTINCT CONCAT(p_est.nombre, ' ', p_est.apellido) SEPARATOR ', ') AS hijos,
                GROUP_CONCAT(DISTINCT TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) SEPARATOR ', ') AS cursos,
                GROUP_CONCAT(DISTINCT e.id_estudiante) AS ids_estudiantes
            FROM PROFESOR prof
            INNER JOIN CURSO_ASIGNATURA ca ON ca.id_profesor = prof.id_profesor
            INNER JOIN CURSO_PERIODO cp ON cp.id_curso_periodo = ca.id_curso_periodo
            INNER JOIN CURSO c ON c.id_curso = cp.id_curso
            INNER JOIN INSCRIPCION i ON i.id_curso_periodo = ca.id_curso_periodo AND i.estado = 'A'
            INNER JOIN ESTUDIANTE e ON e.id_estudiante = i.id_estudiante
            INNER JOIN PERSONA p_est ON p_est.id_persona = e.id_persona
            INNER JOIN APODERADO_ESTUDIANTE ae ON ae.id_estudiante = e.id_estudiante AND ae.estado = 'A'
            INNER JOIN APODERADO a ON a.id_apoderado = ae.id_apoderado
            INNER JOIN PERSONA p_apo ON p_apo.id_persona = a.id_persona
            INNER JOIN USUARIO ua ON ua.id_persona = a.id_persona
            WHERE prof.id_persona = ?
            GROUP BY ua.id_usuario, p_apo.nombre, p_apo.apellido
            ORDER BY p_apo.apellido ASC, p_apo.nombre ASC
        `, [usuario.id_persona]);

        const cursos = await cursosDelProfesor(connection, usuario.id_persona);
        const comunicados = await historialComunicados(connection, usuario.id_usuario);

        const idEstudiante = String(req.query.estudiante || '');
        const inicial = idEstudiante
            ? apoderados.findIndex((a) => (a.ids_estudiantes || '').split(',').includes(idEstudiante))
            : -1;

        res.render('profesor/atencionApo', {
            title: 'Atención a Apoderados - Educare',
            user: usuario,
            apoderados,
            cursos,
            comunicados,
            indiceInicial: inicial >= 0 ? inicial : 0,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (error) {
        console.error('❌ Error al cargar atención a apoderados:', error.message);
        res.render('profesor/atencionApo', {
            title: 'Atención a Apoderados - Educare',
            user: usuario,
            apoderados: [],
            cursos: [],
            comunicados: [],
            indiceInicial: 0,
            error: 'Ocurrió un error al cargar la atención a apoderados.',
            success: null
        });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/profesor/enviar-aviso-masivo', async (req, res) => {
    const usuario = sesionUsuario(req);
    const volver = (clave, mensaje) => res.redirect(`/profesor/atencionApo?${clave}=${encodeURIComponent(mensaje)}`);
    const { id_curso, prioridad, titulo, contenido } = req.body;

    const datos = validarComunicado({ titulo, contenido, prioridad });
    if (datos.error) return volver('error', datos.error);
    const { titulo: tituloLimpio, contenido: contenidoLimpio, prioridad: prioridadFinal } = datos;

    let connection;
    try {
        connection = await pool.getConnection();

        const cursos = await cursosDelProfesor(connection, usuario.id_persona);
        let destinos;
        if (id_curso === 'TODOS') {
            destinos = cursos;
        } else {
            destinos = cursos.filter((c) => String(c.id_curso) === String(id_curso));
        }
        if (destinos.length === 0) return volver('error', 'No se encontró un curso asignado para enviar el comunicado.');

        await connection.beginTransaction();

        const [aviso] = await connection.query(`
            INSERT INTO AVISO (id_usuario, titulo, contenido, prioridad, estado)
            VALUES (?, ?, ?, ?, 'A')
        `, [usuario.id_usuario, tituloLimpio, contenidoLimpio, prioridadFinal]);

        for (const curso of destinos) {
            await connection.query(
                "INSERT INTO AVISO_DESTINATARIO (id_aviso, tipo_destino, id_curso) VALUES (?, 'CURSO', ?)",
                [aviso.insertId, curso.id_curso]
            );
        }

        await connection.commit();
        const alcance = destinos.length === 1 ? `al curso ${destinos[0].nombre_curso}` : `a ${destinos.length} cursos`;
        volver('success', `Comunicado enviado ${alcance}.`);
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error al emitir comunicado:', error.message);
        volver('error', mensajeError(error, 'No se pudo emitir el comunicado.'));
    } finally {
        if (connection) connection.release();
    }
});

router.post('/profesor/comunicados/:id/editar', async (req, res) => {
    const usuario = sesionUsuario(req);
    const volver = (clave, mensaje) => res.redirect(`/profesor/atencionApo?${clave}=${encodeURIComponent(mensaje)}`);
    const idAviso = parseInt(req.params.id, 10);
    if (!Number.isInteger(idAviso)) return volver('error', 'Comunicado no válido.');

    const datos = validarComunicado(req.body);
    if (datos.error) return volver('error', datos.error);

    let connection;
    try {
        connection = await pool.getConnection();

        const [propios] = await connection.query(
            "SELECT id_aviso FROM AVISO WHERE id_aviso = ? AND id_usuario = ? AND estado = 'A'",
            [idAviso, usuario.id_usuario]
        );
        if (propios.length === 0) return volver('error', 'No se encontró el comunicado o no te pertenece.');

        const cursos = await cursosDelProfesor(connection, usuario.id_persona);
        const permitidos = new Set(cursos.map((c) => String(c.id_curso)));
        const elegidos = [...new Set(lista(req.body.id_curso).map(String))].filter((id) => permitidos.has(id));
        if (elegidos.length === 0) return volver('error', 'Selecciona al menos un curso destinatario válido.');

        await connection.beginTransaction();
        await connection.query(
            'UPDATE AVISO SET titulo = ?, contenido = ?, prioridad = ? WHERE id_aviso = ? AND id_usuario = ?',
            [datos.titulo, datos.contenido, datos.prioridad, idAviso, usuario.id_usuario]
        );
        await connection.query("DELETE FROM AVISO_DESTINATARIO WHERE id_aviso = ? AND tipo_destino = 'CURSO'", [idAviso]);
        for (const idCurso of elegidos) {
            await connection.query(
                "INSERT INTO AVISO_DESTINATARIO (id_aviso, tipo_destino, id_curso) VALUES (?, 'CURSO', ?)",
                [idAviso, idCurso]
            );
        }
        await connection.commit();
        volver('success', 'Comunicado actualizado correctamente.');
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error al editar comunicado:', error.message);
        volver('error', mensajeError(error, 'No se pudo actualizar el comunicado.'));
    } finally {
        if (connection) connection.release();
    }
});

router.post('/profesor/comunicados/:id/eliminar', async (req, res) => {
    const usuario = sesionUsuario(req);
    const volver = (clave, mensaje) => res.redirect(`/profesor/atencionApo?${clave}=${encodeURIComponent(mensaje)}`);
    const idAviso = parseInt(req.params.id, 10);
    if (!Number.isInteger(idAviso)) return volver('error', 'Comunicado no válido.');

    let connection;
    try {
        connection = await pool.getConnection();

        const [propios] = await connection.query(
            "SELECT id_aviso FROM AVISO WHERE id_aviso = ? AND id_usuario = ? AND estado = 'A'",
            [idAviso, usuario.id_usuario]
        );
        if (propios.length === 0) return volver('error', 'No se encontró el comunicado o no te pertenece.');

        await connection.beginTransaction();
        await connection.query('DELETE FROM AVISO_DESTINATARIO WHERE id_aviso = ?', [idAviso]);
        await connection.query('DELETE FROM AVISO WHERE id_aviso = ? AND id_usuario = ?', [idAviso, usuario.id_usuario]);
        await connection.commit();
        volver('success', 'Comunicado eliminado correctamente.');
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error al eliminar comunicado:', error.message);
        volver('error', mensajeError(error, 'No se pudo eliminar el comunicado.'));
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
