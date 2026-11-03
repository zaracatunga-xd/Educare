const express = require('express');
const router = express.Router();
const apoderadoController = require('../auth/controllers/apoderadoController');
const pool = require('../config/db');
const chat = require('../utils/chat');
const boletin = require('../utils/boletin');
const { generarInformeNotas } = require('../utils/pdf');
const { validarNacimiento, validarNoFutura, validarPosterior, primerError } = require('../utils/fechas');

const obtenerTiposNee = async (conn) => {
    try {
        const [filas] = await conn.query('SELECT id_tipo_nee, clasificacion, nombre FROM TIPO_NEE ORDER BY clasificacion, nombre');
        return filas || [];
    } catch (error) {
        console.error("❌ Error al cargar el catálogo NEE:", error.message);
        return [];
    }
};

// Funciones auxiliares para sanitizar texto y formatear fechas
const cleanVal = (v) => (v && typeof v === 'string' && v.trim() !== '') ? v.trim() : null;

const formatDateForInput = (dateVal) => {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
        return isNaN(dateVal.getTime()) ? '' : dateVal.toISOString().split('T')[0];
    }
    if (typeof dateVal === 'string') {
        const trimmed = dateVal.trim();
        if (!trimmed) return '';
        if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
            return trimmed.substring(0, 10);
        }
        const parts = trimmed.split(/[/.-]/);
        if (parts.length === 3) {
            if (parts[2].length === 4) { // Formato DD/MM/YYYY
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
            if (parts[0].length === 4) { // Formato YYYY/MM/DD
                return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            }
        }
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    }
    return '';
};

// ==========================================
// 1. DASHBOARD PRINCIPAL DEL APODERADO
// ==========================================
router.get('/apoderado', async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const userId = Number(sessionUser.id_usuario);
        connection = await pool.getConnection();

        // Obtener Estudiantes a cargo del Apoderado con su estado de inscripción
        const [estudiantes] = await connection.query(`
            SELECT DISTINCT 
                e.id_estudiante, 
                p.nombre, 
                p.apellido, 
                p.rut,
                CONCAT(p.nombre, ' ', p.apellido) AS nombre_completo,
                TRIM(CONCAT(COALESCE(c.nivel, 'Sin'), ' ', COALESCE(c.seccion, 'Curso'))) AS nombre_curso,
                ae.estado AS estado_vinculo,
                CASE i.estado WHEN 'A' THEN 'APROBADO' WHEN 'I' THEN 'RECHAZADO' ELSE 'PENDIENTE' END AS estado_inscripcion
            FROM APODERADO_ESTUDIANTE ae
            INNER JOIN APODERADO a ON ae.id_apoderado = a.id_apoderado
            INNER JOIN USUARIO u ON a.id_persona = u.id_persona
            INNER JOIN ESTUDIANTE e ON ae.id_estudiante = e.id_estudiante
            INNER JOIN PERSONA p ON e.id_persona = p.id_persona
            LEFT JOIN INSCRIPCION i ON e.id_estudiante = i.id_estudiante
            LEFT JOIN CURSO_PERIODO cp ON i.id_curso_periodo = cp.id_curso_periodo
            LEFT JOIN CURSO c ON cp.id_curso = c.id_curso
            WHERE u.id_usuario = ?
            ORDER BY p.apellido ASC, p.nombre ASC
        `, [userId]);

        // Obtener Avisos e Informes Oficiales dirigidos al Apoderado
        const [avisos] = await connection.query(`
            SELECT DISTINCT 
                a.id_aviso, 
                a.titulo, 
                a.contenido, 
                a.prioridad, 
                a.fecha_publicacion,
                p.nombre AS autor_nombre,
                p.apellido AS autor_apellido
            FROM AVISO a
            INNER JOIN USUARIO u ON a.id_usuario = u.id_usuario
            INNER JOIN PERSONA p ON u.id_persona = p.id_persona
            INNER JOIN AVISO_DESTINATARIO ad ON a.id_aviso = ad.id_aviso
            LEFT JOIN ROL r ON ad.id_rol = r.id_rol
            WHERE a.estado IN ('A', 'ACTIVO')
              AND (a.fecha_expiracion IS NULL OR a.fecha_expiracion >= CURDATE())
              AND (
                ad.tipo_destino = 'GLOBAL' 
                OR (ad.tipo_destino = 'ROL' AND r.nombre = 'Apoderado')
                OR (ad.tipo_destino = 'CURSO' AND ad.id_curso IN (
                    SELECT cp.id_curso 
                    FROM APODERADO_ESTUDIANTE ae2
                    INNER JOIN APODERADO a2 ON ae2.id_apoderado = a2.id_apoderado
                    INNER JOIN USUARIO u2 ON a2.id_persona = u2.id_persona
                    INNER JOIN ESTUDIANTE est ON ae2.id_estudiante = est.id_estudiante
                    INNER JOIN INSCRIPCION ins ON est.id_estudiante = ins.id_estudiante
                    INNER JOIN CURSO_PERIODO cp ON ins.id_curso_periodo = cp.id_curso_periodo
                    WHERE u2.id_usuario = ?
                ))
              )
            ORDER BY a.fecha_publicacion DESC
        `, [userId]);

        let mensajesPendientes = 0;
        try {
            mensajesPendientes = await chat.contarNoLeidos(sessionUser.id_usuario);
        } catch (errorChat) {
            console.error("❌ Error al contar mensajes pendientes:", errorChat.message);
        }

        res.render('apoderado/apoderado', {
            title: 'Portal Apoderado - Educare',
            user: sessionUser,
            estudiantes: estudiantes || [],
            pupilos: estudiantes || [],
            avisos: avisos || [],
            mensajesPendientes
        });

    } catch (error) {
        console.error("❌ Error al cargar dashboard del apoderado:", error.message);
        res.render('apoderado/apoderado', {
            title: 'Portal Apoderado - Educare',
            user: req.session.user || req.session.usuario,
            estudiantes: [],
            pupilos: [],
            avisos: [],
            mensajesPendientes: 0
        });
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// 2. BANDEJA DE COMUNICADOS (ESTILO GMAIL)
// ==========================================
router.get('/apoderado/avisos', async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const userId = Number(sessionUser.id_usuario);
        connection = await pool.getConnection();

        const [avisos] = await connection.query(`
            SELECT DISTINCT 
                a.id_aviso, 
                a.titulo, 
                a.contenido, 
                a.prioridad, 
                a.fecha_publicacion,
                a.fecha_expiracion,
                p.nombre AS autor_nombre,
                p.apellido AS autor_apellido,
                ad.tipo_destino
            FROM AVISO a
            INNER JOIN USUARIO u ON a.id_usuario = u.id_usuario
            INNER JOIN PERSONA p ON u.id_persona = p.id_persona
            INNER JOIN AVISO_DESTINATARIO ad ON a.id_aviso = ad.id_aviso
            LEFT JOIN ROL r ON ad.id_rol = r.id_rol
            WHERE a.estado IN ('A', 'ACTIVO')
              AND (a.fecha_expiracion IS NULL OR a.fecha_expiracion >= CURDATE())
              AND (
                ad.tipo_destino = 'GLOBAL' 
                OR (ad.tipo_destino = 'ROL' AND r.nombre = 'Apoderado')
                OR (ad.tipo_destino = 'CURSO' AND ad.id_curso IN (
                    SELECT cp.id_curso 
                    FROM APODERADO_ESTUDIANTE ae2
                    INNER JOIN APODERADO a2 ON ae2.id_apoderado = a2.id_apoderado
                    INNER JOIN USUARIO u2 ON a2.id_persona = u2.id_persona
                    INNER JOIN ESTUDIANTE est ON ae2.id_estudiante = est.id_estudiante
                    INNER JOIN INSCRIPCION ins ON est.id_estudiante = ins.id_estudiante
                    INNER JOIN CURSO_PERIODO cp ON ins.id_curso_periodo = cp.id_curso_periodo
                    WHERE u2.id_usuario = ?
                ))
              )
            ORDER BY a.fecha_publicacion DESC
        `, [userId]);

        res.render('apoderado/avisosA', {
            title: 'Comunicados Oficiales - Educare',
            user: sessionUser,
            avisos: avisos || []
        });

    } catch (error) {
        console.error("❌ Error al cargar comunicados del apoderado:", error.message);
        res.render('apoderado/avisosA', {
            title: 'Comunicados Oficiales - Educare',
            user: req.session.user || req.session.usuario,
            avisos: []
        });
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// 3. REGISTRO DE NUEVO PUPILO
// ==========================================
router.get('/apoderado/agregar-pupilo', async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        connection = await pool.getConnection();

        // Obtener cursos activos y el conteo actual de estudiantes inscritos
        const [cursos] = await connection.query(`
            SELECT 
                c.id_curso, 
                c.nivel, 
                c.seccion, 
                c.jornada,
                COUNT(i.id_inscripcion) AS inscritos
            FROM CURSO c
            LEFT JOIN CURSO_PERIODO cp ON c.id_curso = cp.id_curso
            LEFT JOIN INSCRIPCION i ON cp.id_curso_periodo = i.id_curso_periodo AND i.estado IN ('A', 'P')
            WHERE c.estado IN ('A', 'ACTIVO')
            GROUP BY c.id_curso, c.nivel, c.seccion, c.jornada
            ORDER BY c.nivel ASC, c.seccion ASC
        `);

        res.render('apoderado/registroEstudiante', { 
            title: 'Registrar Estudiante - Educare',
            user: sessionUser,
            cursos: cursos || [],
            tiposNee: await obtenerTiposNee(connection),
            error: null 
        });

    } catch (error) {
        console.error("❌ Error al cargar formulario de registro:", error.message);
        res.render('apoderado/registroEstudiante', { 
            title: 'Registrar Estudiante - Educare',
            user: req.session.user || req.session.usuario,
            cursos: [],
            tiposNee: [],
            error: 'Error al cargar los cursos disponibles.' 
        });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/apoderado/agregar-pupilo', async (req, res) => {
    const {
        rut, nombre, apellido, fecha_nacimiento, genero, parentesco, id_curso,
        id_tipo_nee, fecha_evaluacion, fecha_vencimiento,
        sintesis_salud, sintesis_psicoeducativa, sintesis_escolar, sintesis_social_familiar,
        evaluador_nombre, evaluador_rol, evaluador_registro, evaluador_fecha,
        apoyo_area, apoyo_descripcion, apoyo_horas
    } = req.body;

    let connection;

    const errorEnFechas = () => primerError(
        validarNacimiento(formatDateForInput(fecha_nacimiento), 'estudiante'),
        validarNoFutura(formatDateForInput(fecha_evaluacion), 'La fecha de evaluación'),
        validarPosterior(formatDateForInput(fecha_evaluacion), formatDateForInput(fecha_vencimiento), 'La fecha de vencimiento', 'la fecha de evaluación'),
        ...[].concat(evaluador_fecha || []).map((f) => validarNoFutura(formatDateForInput(f), 'La fecha del evaluador'))
    );

    // Función auxiliar para recargar los cursos en caso de error
    const obtenerCursosAux = async (conn) => {
        const [rows] = await conn.query(`
            SELECT c.id_curso, c.nivel, c.seccion, c.jornada, COUNT(i.id_inscripcion) AS inscritos
            FROM CURSO c
            LEFT JOIN CURSO_PERIODO cp ON c.id_curso = cp.id_curso
            LEFT JOIN INSCRIPCION i ON cp.id_curso_periodo = i.id_curso_periodo AND i.estado IN ('A', 'P')
            WHERE c.estado IN ('A', 'ACTIVO')
            GROUP BY c.id_curso, c.nivel, c.seccion, c.jornada
            ORDER BY c.nivel ASC, c.seccion ASC
        `);
        return rows || [];
    };

    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        connection = await pool.getConnection();

        // Validar campos obligatorios
        if (!cleanVal(rut) || !cleanVal(nombre) || !cleanVal(apellido) || !cleanVal(id_curso)) {
            const cursosList = await obtenerCursosAux(connection);
            return res.render('apoderado/registroEstudiante', {
                title: 'Registrar Estudiante - Educare',
                user: sessionUser,
                cursos: cursosList,
                tiposNee: connection ? await obtenerTiposNee(connection) : [],
                error: 'Por favor completa los campos obligatorios: RUT, Nombres, Apellidos y Curso a Matricular.'
            });
        }

        const errorFechas = errorEnFechas();
        if (errorFechas) {
            const cursosList = await obtenerCursosAux(connection);
            return res.render('apoderado/registroEstudiante', {
                title: 'Registrar Estudiante - Educare',
                user: sessionUser,
                cursos: cursosList,
                tiposNee: connection ? await obtenerTiposNee(connection) : [],
                error: errorFechas
            });
        }

        // VALIDACIÓN DE CAPACIDAD DEL CURSO (MÁXIMO 15 ALUMNOS)
        const [conteoRows] = await connection.query(`
            SELECT COUNT(i.id_inscripcion) AS total_inscritos
            FROM INSCRIPCION i
            INNER JOIN CURSO_PERIODO cp ON i.id_curso_periodo = cp.id_curso_periodo
            WHERE cp.id_curso = ? AND i.estado IN ('A', 'P')
        `, [id_curso]);

        const totalInscritos = conteoRows[0]?.total_inscritos || 0;

        if (totalInscritos >= 15) {
            const cursosList = await obtenerCursosAux(connection);
            return res.render('apoderado/registroEstudiante', {
                title: 'Registrar Estudiante - Educare',
                user: sessionUser,
                cursos: cursosList,
                tiposNee: connection ? await obtenerTiposNee(connection) : [],
                error: 'Las matrículas están llenas en este curso'
            });
        }

        await connection.beginTransaction();

        const userId = Number(sessionUser.id_usuario);
        const [userRows] = await connection.query(`
            SELECT u.id_persona, a.id_apoderado 
            FROM USUARIO u 
            LEFT JOIN APODERADO a ON u.id_persona = a.id_persona 
            WHERE u.id_usuario = ?
            LIMIT 1
        `, [userId]);

        if (userRows.length === 0) {
            throw new Error("No se encontró la cuenta de usuario en la base de datos.");
        }

        let idPersonaApoderado = userRows[0].id_persona;
        let idApoderado = userRows[0].id_apoderado;

        if (!idApoderado) {
            const [apoInsert] = await connection.query(
                `INSERT INTO APODERADO (id_persona) VALUES (?)`,
                [idPersonaApoderado]
            );
            idApoderado = apoInsert.insertId;
        }

        // 1. Insertar Persona y Estudiante
        const fNacimiento = formatDateForInput(fecha_nacimiento);
        const [resPersona] = await connection.query(
            `INSERT INTO PERSONA (rut, nombre, apellido, fecha_nacimiento, genero) VALUES (?, ?, ?, ?, ?)`,
            [cleanVal(rut), cleanVal(nombre), cleanVal(apellido), fNacimiento || null, cleanVal(genero) || 'Otro']
        );
        const idPersonaEstudiante = resPersona.insertId;

        const [resEstudiante] = await connection.query(
            `INSERT INTO ESTUDIANTE (id_persona, estado) VALUES (?, 'A')`,
            [idPersonaEstudiante]
        );
        const idEstudiante = resEstudiante.insertId;

        // 2. Vincular Apoderado con Estudiante
        await connection.query(
            `INSERT INTO APODERADO_ESTUDIANTE (id_apoderado, id_estudiante, parentesco, estado) VALUES (?, ?, ?, 'P')`,
            [idApoderado, idEstudiante, cleanVal(parentesco) || 'Apoderado']
        );

        // 3. Vincular Estudiante con el Curso Seleccionado (INSCRIPCION)
        let [periodos] = await connection.query(`SELECT id_periodo FROM PERIODO_ACADEMICO WHERE estado IN ('A', 'ACTIVO') LIMIT 1`);
        let idPeriodo = periodos.length > 0 ? periodos[0].id_periodo : 1;

        let [cpRows] = await connection.query(
            `SELECT id_curso_periodo FROM CURSO_PERIODO WHERE id_curso = ? AND id_periodo = ? LIMIT 1`,
            [id_curso, idPeriodo]
        );

        let idCursoPeriodo;
        if (cpRows.length > 0) {
            idCursoPeriodo = cpRows[0].id_curso_periodo;
        } else {
            const [cpInsert] = await connection.query(
                `INSERT INTO CURSO_PERIODO (id_curso, id_periodo) VALUES (?, ?)`,
                [id_curso, idPeriodo]
            );
            idCursoPeriodo = cpInsert.insertId;
        }

        await connection.query(
            `INSERT INTO INSCRIPCION (id_estudiante, id_curso_periodo, id_periodo, fecha_inscripcion, estado)
             VALUES (?, ?, ?, CURDATE(), 'P')`,
            [idEstudiante, idCursoPeriodo, idPeriodo]
        );

        // 4. Crear registro FUDEI
        const hoyStr = new Date().toISOString().split('T')[0];
        const fEvaluacion = formatDateForInput(fecha_evaluacion) || hoyStr;
        let fVencimiento = formatDateForInput(fecha_vencimiento);
        if (fVencimiento && fVencimiento < fEvaluacion) fVencimiento = null;

        const [resFudei] = await connection.query(
            `INSERT INTO FUDEI (id_estudiante, id_periodo, id_tipo_nee, fecha_evaluacion, fecha_vencimiento, id_coordinador, id_director, estado)
             VALUES (?, ?, ?, ?, ?, 1, 1, 'EN_PROCESO')`,
            [idEstudiante, idPeriodo, cleanVal(id_tipo_nee) || 1, fEvaluacion, fVencimiento]
        );
        const idFudei = resFudei.insertId;

        await connection.query(
            `INSERT INTO FUDEI_SINTESIS_EVALUACION (id_fudei, sintesis_salud, sintesis_psicoeducativa, sintesis_escolar, sintesis_social_familiar)
             VALUES (?, ?, ?, ?, ?)`,
            [idFudei, sintesis_salud || '', sintesis_psicoeducativa || '', sintesis_escolar || '', sintesis_social_familiar || '']
        );

        // Insertar Evaluadores
        const evalNombres = Array.isArray(evaluador_nombre) ? evaluador_nombre : (evaluador_nombre ? [evaluador_nombre] : []);
        const evalRoles = Array.isArray(evaluador_rol) ? evaluador_rol : (evaluador_rol ? [evaluador_rol] : []);
        const evalRegs = Array.isArray(evaluador_registro) ? evaluador_registro : (evaluador_registro ? [evaluador_registro] : []);
        const evalFechas = Array.isArray(evaluador_fecha) ? evaluador_fecha : (evaluador_fecha ? [evaluador_fecha] : []);

        for (let i = 0; i < evalNombres.length; i++) {
            const nom = cleanVal(evalNombres[i]);
            if (nom) {
                await connection.query(
                    `INSERT INTO FUDEI_EQUIPO_EVALUADOR (id_fudei, nombre_completo, rol_profesional, registro_profesional, fecha_evaluacion)
                     VALUES (?, ?, ?, ?, ?)`,
                    [idFudei, nom, cleanVal(evalRoles[i]) || '', cleanVal(evalRegs[i]) || '', formatDateForInput(evalFechas[i]) || hoyStr]
                );
            }
        }

        // Insertar Apoyos
        const apoyoAreas = Array.isArray(apoyo_area) ? apoyo_area : (apoyo_area ? [apoyo_area] : []);
        const apoyoDescs = Array.isArray(apoyo_descripcion) ? apoyo_descripcion : (apoyo_descripcion ? [apoyo_descripcion] : []);
        const apoyoHrs = Array.isArray(apoyo_horas) ? apoyo_horas : (apoyo_horas ? [apoyo_horas] : []);

        for (let i = 0; i < apoyoAreas.length; i++) {
            const area = cleanVal(apoyoAreas[i]);
            if (area) {
                await connection.query(
                    `INSERT INTO FUDEI_APOYO (id_fudei, area_apoyo, descripcion_intervencion, frecuencia_semanal_hrs)
                     VALUES (?, ?, ?, ?)`,
                    [idFudei, area, cleanVal(apoyoDescs[i]) || '', parseFloat(apoyoHrs[i]) || 1.0]
                );
            }
        }

        await connection.commit();
        return res.redirect('/apoderado?created=true');

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Error al guardar pupilo:", error.message);

        let mensajeError = error.message;
        if (error.code === 'ER_DUP_ENTRY') mensajeError = 'El RUT ingresado ya existe en el sistema.';

        const cursosList = connection ? await obtenerCursosAux(connection) : [];

        return res.render('apoderado/registroEstudiante', {
            title: 'Registrar Estudiante - Educare',
            user: req.session.user || req.session.usuario,
            cursos: cursosList,
                tiposNee: connection ? await obtenerTiposNee(connection) : [],
            error: mensajeError
        });
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// 4. EDICIÓN DEL PUPILO Y FUDEI
// ==========================================
router.get('/apoderado/editar-pupilo/:id', async (req, res) => {
    const idEstudiante = req.params.id;
    let connection;

    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        connection = await pool.getConnection();

        const userId = Number(sessionUser.id_usuario);
        const [estRows] = await connection.query(`
            SELECT 
                e.id_estudiante,
                p.id_persona,
                p.rut,
                p.nombre,
                p.apellido,
                p.fecha_nacimiento,
                p.genero,
                ae.parentesco
            FROM ESTUDIANTE e
            INNER JOIN PERSONA p ON e.id_persona = p.id_persona
            INNER JOIN APODERADO_ESTUDIANTE ae ON e.id_estudiante = ae.id_estudiante
            INNER JOIN APODERADO a ON ae.id_apoderado = a.id_apoderado
            INNER JOIN USUARIO u ON a.id_persona = u.id_persona
            WHERE e.id_estudiante = ? AND u.id_usuario = ?
            LIMIT 1
        `, [idEstudiante, userId]);

        if (estRows.length === 0) {
            return res.redirect('/apoderado?error=No tiene permisos para ver o editar este estudiante.');
        }

        const pupilo = estRows[0];
        pupilo.fecha_nacimiento_fmt = formatDateForInput(pupilo.fecha_nacimiento);

        const [tiposNee] = await connection.query(`SELECT id_tipo_nee, clasificacion, nombre FROM TIPO_NEE ORDER BY clasificacion, nombre`);

        const [fudeiRows] = await connection.query(`
            SELECT * FROM FUDEI WHERE id_estudiante = ? ORDER BY id_fudei DESC LIMIT 1
        `, [idEstudiante]);

        let fudei = fudeiRows[0] || null;
        let sintesis = {};
        let evaluadores = [];
        let apoyos = [];

        if (fudei) {
            fudei.fecha_evaluacion_fmt = formatDateForInput(fudei.fecha_evaluacion);
            fudei.fecha_vencimiento_fmt = formatDateForInput(fudei.fecha_vencimiento);

            const [sintesisRows] = await connection.query(`SELECT * FROM FUDEI_SINTESIS_EVALUACION WHERE id_fudei = ? LIMIT 1`, [fudei.id_fudei]);
            sintesis = sintesisRows[0] || {};

            const [evalRows] = await connection.query(`SELECT * FROM FUDEI_EQUIPO_EVALUADOR WHERE id_fudei = ?`, [fudei.id_fudei]);
            evaluadores = (evalRows || []).map(e => ({
                ...e,
                fecha_evaluacion_fmt: formatDateForInput(e.fecha_evaluacion)
            }));

            const [apoyoRows] = await connection.query(`SELECT * FROM FUDEI_APOYO WHERE id_fudei = ?`, [fudei.id_fudei]);
            apoyos = apoyoRows || [];
        }

        res.render('apoderado/editar-estudiante', {
            title: 'Editar Estudiante y FUDEI - Educare',
            user: sessionUser,
            pupilo,
            fudei,
            sintesis,
            evaluadores,
            apoyos,
            tiposNee: tiposNee || [],
            error: req.query.error || null,
            mensaje: req.query.updated === 'true' ? '¡Estudiante actualizado correctamente!' : null
        });

    } catch (error) {
        console.error("❌ Error al cargar datos del pupilo y FUDEI:", error.message);
        res.redirect('/apoderado?error=Error al cargar la información');
    } finally {
        if (connection) connection.release();
    }
});

router.post('/apoderado/editar-pupilo/:id', async (req, res) => {
    const idEstudiante = req.params.id;
    const {
        rut, nombre, apellido, fecha_nacimiento, genero, parentesco,
        id_tipo_nee, fecha_evaluacion, fecha_vencimiento,
        sintesis_salud, sintesis_psicoeducativa, sintesis_escolar, sintesis_social_familiar,
        evaluador_nombre, evaluador_rol, evaluador_registro, evaluador_fecha,
        apoyo_area, apoyo_descripcion, apoyo_horas
    } = req.body;

    let connection;

    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        if (!cleanVal(rut) || !cleanVal(nombre) || !cleanVal(apellido)) {
            return res.redirect(`/apoderado/editar-pupilo/${idEstudiante}?error=Faltan campos obligatorios: RUT, Nombre y Apellido.`);
        }

        const errorFechas = primerError(
            validarNacimiento(formatDateForInput(fecha_nacimiento), 'estudiante'),
            validarNoFutura(formatDateForInput(fecha_evaluacion), 'La fecha de evaluación'),
            validarPosterior(formatDateForInput(fecha_evaluacion), formatDateForInput(fecha_vencimiento), 'La fecha de vencimiento', 'la fecha de evaluación'),
            ...[].concat(evaluador_fecha || []).map((f) => validarNoFutura(formatDateForInput(f), 'La fecha del evaluador'))
        );
        if (errorFechas) {
            return res.redirect(`/apoderado/editar-pupilo/${idEstudiante}?error=${encodeURIComponent(errorFechas)}`);
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const userId = Number(sessionUser.id_usuario);
        const [estRows] = await connection.query(`
            SELECT e.id_persona 
            FROM ESTUDIANTE e
            INNER JOIN APODERADO_ESTUDIANTE ae ON e.id_estudiante = ae.id_estudiante
            INNER JOIN APODERADO a ON ae.id_apoderado = a.id_apoderado
            INNER JOIN USUARIO u ON a.id_persona = u.id_persona
            WHERE e.id_estudiante = ? AND u.id_usuario = ?
            LIMIT 1
        `, [idEstudiante, userId]);

        if (estRows.length === 0) throw new Error("Acceso denegado: Estudiante no pertenece a la cuenta actual.");

        const idPersona = estRows[0].id_persona;

        const fNacimientoVal = formatDateForInput(fecha_nacimiento) || null;
        const fEvaluacionVal = formatDateForInput(fecha_evaluacion) || new Date().toISOString().split('T')[0];
        let fVencimientoVal = formatDateForInput(fecha_vencimiento) || null;
        if (fVencimientoVal && fVencimientoVal < fEvaluacionVal) fVencimientoVal = null;

        // Sanitización estricta de id_tipo_nee para evitar fallos de Foreign Key
        const idTipoNeeParsed = parseInt(cleanVal(id_tipo_nee), 10);
        const idTipoNeeValidado = (!isNaN(idTipoNeeParsed) && idTipoNeeParsed > 0) ? idTipoNeeParsed : 1;

        // 1. Actualizar Datos Personales
        await connection.query(
            `UPDATE PERSONA SET rut = ?, nombre = ?, apellido = ?, fecha_nacimiento = ?, genero = ? WHERE id_persona = ?`,
            [cleanVal(rut), cleanVal(nombre), cleanVal(apellido), fNacimientoVal, cleanVal(genero) || 'Otro', idPersona]
        );

        // 2. Actualizar Parentesco
        await connection.query(
            `UPDATE APODERADO_ESTUDIANTE SET parentesco = ? WHERE id_estudiante = ?`,
            [cleanVal(parentesco) || 'Apoderado', idEstudiante]
        );

        // 3. Gestionar FUDEI y Síntesis
        const [fudeiRows] = await connection.query(`SELECT id_fudei, estado FROM FUDEI WHERE id_estudiante = ? ORDER BY id_fudei DESC LIMIT 1`, [idEstudiante]);
        
        let idFudei;
        if (fudeiRows.length > 0) {
            idFudei = fudeiRows[0].id_fudei;

            if (fudeiRows[0].estado === 'FINALIZADO') {
                throw new Error("El FUDEI ya se encuentra FINALIZADO y no permite modificaciones.");
            }

            await connection.query(
                `UPDATE FUDEI SET id_tipo_nee = ?, fecha_evaluacion = ?, fecha_vencimiento = ? WHERE id_fudei = ?`,
                [idTipoNeeValidado, fEvaluacionVal, fVencimientoVal, idFudei]
            );

            await connection.query(`
                INSERT INTO FUDEI_SINTESIS_EVALUACION (id_fudei, sintesis_salud, sintesis_psicoeducativa, sintesis_escolar, sintesis_social_familiar)
                VALUES (?, ?, ?, ?, ?)
                AS new_data
                ON DUPLICATE KEY UPDATE
                    sintesis_salud = new_data.sintesis_salud,
                    sintesis_psicoeducativa = new_data.sintesis_psicoeducativa,
                    sintesis_escolar = new_data.sintesis_escolar,
                    sintesis_social_familiar = new_data.sintesis_social_familiar
            `, [idFudei, sintesis_salud || '', sintesis_psicoeducativa || '', sintesis_escolar || '', sintesis_social_familiar || '']);

        } else {
            const [resFudei] = await connection.query(
                `INSERT INTO FUDEI (id_estudiante, id_periodo, id_tipo_nee, fecha_evaluacion, fecha_vencimiento, id_coordinador, id_director, estado)
                 VALUES (?, 1, ?, ?, ?, 1, 1, 'EN_PROCESO')`,
                [idEstudiante, idTipoNeeValidado, fEvaluacionVal, fVencimientoVal]
            );
            idFudei = resFudei.insertId;

            await connection.query(
                `INSERT INTO FUDEI_SINTESIS_EVALUACION (id_fudei, sintesis_salud, sintesis_psicoeducativa, sintesis_escolar, sintesis_social_familiar)
                 VALUES (?, ?, ?, ?, ?)`,
                [idFudei, sintesis_salud || '', sintesis_psicoeducativa || '', sintesis_escolar || '', sintesis_social_familiar || '']
            );
        }

        // 4. Actualizar Equipo Evaluador
        await connection.query(`DELETE FROM FUDEI_EQUIPO_EVALUADOR WHERE id_fudei = ?`, [idFudei]);
        const evalNombres = Array.isArray(evaluador_nombre) ? evaluador_nombre : (evaluador_nombre ? [evaluador_nombre] : []);
        const evalRoles = Array.isArray(evaluador_rol) ? evaluador_rol : (evaluador_rol ? [evaluador_rol] : []);
        const evalRegs = Array.isArray(evaluador_registro) ? evaluador_registro : (evaluador_registro ? [evaluador_registro] : []);
        const evalFechas = Array.isArray(evaluador_fecha) ? evaluador_fecha : (evaluador_fecha ? [evaluador_fecha] : []);

        for (let i = 0; i < evalNombres.length; i++) {
            const nom = cleanVal(evalNombres[i]);
            if (nom) {
                await connection.query(
                    `INSERT INTO FUDEI_EQUIPO_EVALUADOR (id_fudei, nombre_completo, rol_profesional, registro_profesional, fecha_evaluacion)
                     VALUES (?, ?, ?, ?, ?)`,
                    [idFudei, nom, cleanVal(evalRoles[i]) || '', cleanVal(evalRegs[i]) || '', formatDateForInput(evalFechas[i]) || fEvaluacionVal]
                );
            }
        }

        // 5. Actualizar Apoyos
        await connection.query(`DELETE FROM FUDEI_APOYO WHERE id_fudei = ?`, [idFudei]);
        const apoyoAreas = Array.isArray(apoyo_area) ? apoyo_area : (apoyo_area ? [apoyo_area] : []);
        const apoyoDescs = Array.isArray(apoyo_descripcion) ? apoyo_descripcion : (apoyo_descripcion ? [apoyo_descripcion] : []);
        const apoyoHrs = Array.isArray(apoyo_horas) ? apoyo_horas : (apoyo_horas ? [apoyo_horas] : []);

        for (let i = 0; i < apoyoAreas.length; i++) {
            const area = cleanVal(apoyoAreas[i]);
            if (area) {
                await connection.query(
                    `INSERT INTO FUDEI_APOYO (id_fudei, area_apoyo, descripcion_intervencion, frecuencia_semanal_hrs)
                     VALUES (?, ?, ?, ?)`,
                    [idFudei, area, cleanVal(apoyoDescs[i]) || '', parseFloat(apoyoHrs[i]) || 1.0]
                );
            }
        }

        await connection.commit();
        return res.redirect(`/apoderado/editar-pupilo/${idEstudiante}?updated=true`);

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Error al actualizar estudiante/FUDEI:", error.message);
        return res.redirect(`/apoderado/editar-pupilo/${idEstudiante}?error=${encodeURIComponent(error.message)}`);
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// 5. CONSULTA DE NOTAS Y CHAT
// ==========================================
const TITULO_NOTAS = 'Notas del Estudiante - Educare';

const cargarContextoNotas = async (connection, sessionUser, idParam, periodoParam) => {
    const pupilos = await boletin.pupilosDelApoderado(connection, sessionUser.id_usuario);
    if (pupilos.length === 0) return { pupilos, pupiloSeleccionado: null, periodos: [], periodoSeleccionado: null };

    const idSolicitado = parseInt(idParam, 10);
    const pupiloSeleccionado = pupilos.find((p) => p.id_estudiante === idSolicitado) || pupilos[0];
    const periodos = await boletin.periodosDelEstudiante(connection, pupiloSeleccionado.id_estudiante);
    const idPeriodo = parseInt(periodoParam, 10);
    const periodoSeleccionado = periodos.find((p) => p.id_curso_periodo === idPeriodo) || periodos[0] || null;
    return { pupilos, pupiloSeleccionado, periodos, periodoSeleccionado };
};

const obtenerNotasEstudiante = async (req, res) => {
    const sessionUser = req.session.user || req.session.usuario;
    if (!sessionUser) return res.redirect('/login');

    const vacio = {
        title: TITULO_NOTAS,
        user: sessionUser,
        pupilos: [],
        pupiloSeleccionado: null,
        periodos: [],
        periodoSeleccionado: null,
        boletin: null,
        error: null
    };

    let connection;
    try {
        connection = await pool.getConnection();
        const contexto = await cargarContextoNotas(connection, sessionUser, req.params.id, req.query.periodo);

        if (contexto.pupilos.length === 0) {
            return res.render('apoderado/notas-estu', { ...vacio, error: 'No se encontraron estudiantes asociados a esta cuenta.' });
        }

        const datosBoletin = contexto.periodoSeleccionado
            ? await boletin.construirBoletin(connection, contexto.pupiloSeleccionado.id_estudiante, contexto.periodoSeleccionado.id_curso_periodo)
            : null;

        res.render('apoderado/notas-estu', {
            ...vacio,
            ...contexto,
            boletin: datosBoletin,
            formatoNota: boletin.formatoNota,
            formatoFecha: boletin.formatoFecha
        });
    } catch (error) {
        console.error("❌ Error al obtener notas:", error.message);
        res.render('apoderado/notas-estu', { ...vacio, error: `Error al consultar notas: ${error.message}` });
    } finally {
        if (connection) connection.release();
    }
};

const descargarInformeNotas = async (req, res) => {
    const sessionUser = req.session.user || req.session.usuario;
    if (!sessionUser) return res.redirect('/login');

    let connection;
    try {
        connection = await pool.getConnection();
        const contexto = await cargarContextoNotas(connection, sessionUser, req.params.id, req.query.periodo);
        const idSolicitado = parseInt(req.params.id, 10);

        if (!contexto.pupiloSeleccionado || contexto.pupiloSeleccionado.id_estudiante !== idSolicitado) {
            return res.status(404).send('Estudiante no encontrado.');
        }
        if (!contexto.periodoSeleccionado) {
            return res.status(404).send('El estudiante no tiene periodos con inscripción activa.');
        }

        const datosBoletin = await boletin.construirBoletin(connection, idSolicitado, contexto.periodoSeleccionado.id_curso_periodo);
        const pdf = generarInformeNotas({
            estudiante: contexto.pupiloSeleccionado,
            periodo: contexto.periodoSeleccionado,
            boletin: datosBoletin,
            emitidoPor: `${sessionUser.nombre || ''} ${sessionUser.apellido || ''}`.trim() || 'Educare',
            fechaEmision: boletin.formatoFecha(new Date()),
            formatoNota: boletin.formatoNota,
            formatoFecha: boletin.formatoFecha
        });

        const nombreArchivo = `informe-notas-${contexto.pupiloSeleccionado.apellido}-${contexto.pupiloSeleccionado.nombre}-${contexto.periodoSeleccionado.anio}-S${contexto.periodoSeleccionado.semestre}.pdf`
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
        res.setHeader('Content-Length', pdf.length);
        res.end(pdf);
    } catch (error) {
        console.error("❌ Error al generar informe de notas:", error.message);
        res.status(500).send('No se pudo generar el informe de notas.');
    } finally {
        if (connection) connection.release();
    }
};

router.get('/apoderado/mensajes', async (req, res) => {
    let connection;
    const sessionUser = req.session.user || req.session.usuario;
    if (!sessionUser) return res.redirect('/login');

    try {
        connection = await pool.getConnection();

        const [profesores] = await connection.query(`
            SELECT
                up.id_usuario AS id_usuario_profesor,
                p_prof.nombre AS prof_nombre,
                p_prof.apellido AS prof_apellido,
                GROUP_CONCAT(DISTINCT asig.nombre SEPARATOR ', ') AS asignaturas,
                GROUP_CONCAT(DISTINCT CONCAT(p_est.nombre, ' ', p_est.apellido) SEPARATOR ', ') AS hijos,
                GROUP_CONCAT(DISTINCT TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) SEPARATOR ', ') AS cursos
            FROM APODERADO_ESTUDIANTE ae
            INNER JOIN APODERADO a ON a.id_apoderado = ae.id_apoderado
            INNER JOIN USUARIO u ON u.id_persona = a.id_persona
            INNER JOIN ESTUDIANTE e ON e.id_estudiante = ae.id_estudiante
            INNER JOIN PERSONA p_est ON p_est.id_persona = e.id_persona
            INNER JOIN INSCRIPCION i ON i.id_estudiante = e.id_estudiante AND i.estado = 'A'
            INNER JOIN CURSO_PERIODO cp ON cp.id_curso_periodo = i.id_curso_periodo
            INNER JOIN CURSO c ON c.id_curso = cp.id_curso
            INNER JOIN CURSO_ASIGNATURA ca ON ca.id_curso_periodo = cp.id_curso_periodo
            INNER JOIN ASIGNATURA asig ON asig.id_asignatura = ca.id_asignatura
            INNER JOIN PROFESOR prof ON prof.id_profesor = ca.id_profesor
            INNER JOIN PERSONA p_prof ON p_prof.id_persona = prof.id_persona
            INNER JOIN USUARIO up ON up.id_persona = prof.id_persona
            WHERE u.id_usuario = ? AND ae.estado = 'A'
            GROUP BY up.id_usuario, p_prof.nombre, p_prof.apellido
            ORDER BY p_prof.apellido ASC, p_prof.nombre ASC
        `, [sessionUser.id_usuario]);

        res.render('apoderado/chat-profe_apo', {
            title: 'Chat Docente - Educare',
            user: sessionUser,
            profesores: profesores || [],
            error: null
        });

    } catch (error) {
        console.error("❌ Error al cargar chat docente:", error.message);
        res.render('apoderado/chat-profe_apo', {
            title: 'Chat Docente - Educare',
            user: sessionUser,
            profesores: [],
            error: 'No se pudo cargar la lista de docentes.'
        });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/apoderado/notas-estu/:id/informe', descargarInformeNotas);
router.get('/apoderado/notas-estu', obtenerNotasEstudiante);
router.get('/apoderado/notas-estu/:id', obtenerNotasEstudiante);

module.exports = router;