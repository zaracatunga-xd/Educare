const express = require('express');
const router = express.Router();
const profesorController = require('../auth/controllers/profesorController');
const pool = require('../config/db');
const chat = require('../utils/chat');
const boletin = require('../utils/boletin');
const { generarInformeNotas } = require('../utils/pdf');
const { sesionUsuario, soloProfesor, estudianteDelProfesor } = require('../utils/profesor');

router.use(require('./chatRoutes'));
router.use(require('./jefeRoutes'));
router.use(require('./profesorGestionRoutes'));

// ==========================================
// 1. DASHBOARD PRINCIPAL DEL PROFESOR
// ==========================================
router.get('/profesor', async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const id_persona = sessionUser.id_persona;
        connection = await pool.getConnection();

        // 1. Obtener Estudiantes asignados
        const [estudiantes] = await connection.query(`
            SELECT DISTINCT 
                e.id_estudiante, 
                p.nombre, 
                p.apellido, 
                p.rut,
                CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, '')) AS nombre_curso,
                tn.nombre AS tipo_nee, 
                f.estado AS fudei_estado
            FROM PROFESOR prof
            INNER JOIN CURSO_ASIGNATURA ca ON prof.id_profesor = ca.id_profesor
            INNER JOIN CURSO_PERIODO cp ON ca.id_curso_periodo = cp.id_curso_periodo
            INNER JOIN CURSO c ON cp.id_curso = c.id_curso
            INNER JOIN INSCRIPCION i ON cp.id_curso_periodo = i.id_curso_periodo AND i.estado IN ('A', 'APROBADO')
            INNER JOIN ESTUDIANTE e ON i.id_estudiante = e.id_estudiante
            INNER JOIN PERSONA p ON e.id_persona = p.id_persona
            LEFT JOIN FUDEI f ON e.id_estudiante = f.id_estudiante
            LEFT JOIN TIPO_NEE tn ON f.id_tipo_nee = tn.id_tipo_nee
            WHERE prof.id_persona = ?
            ORDER BY p.apellido ASC, p.nombre ASC
        `, [id_persona]);

        // 2. Obtener Avisos e Informes de Dirección
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
              AND (ad.tipo_destino = 'GLOBAL' OR (ad.tipo_destino = 'ROL' AND r.nombre IN ('Profesor', 'Profesor Jefe')))
            ORDER BY a.fecha_publicacion DESC
        `, [id_persona]);

        const fudeiPendientes = (estudiantes || []).filter(e => e.fudei_estado === 'EN_PROCESO').length;

        let mensajesPendientes = 0;
        try {
            mensajesPendientes = await chat.contarNoLeidos(sessionUser.id_usuario);
        } catch (errorChat) {
            console.error("❌ Error al contar mensajes pendientes:", errorChat.message);
        }

        res.render('profesor/profesor', {
            title: 'Panel Docente - Educare',
            user: sessionUser,
            estudiantes: estudiantes || [],
            fudeiPendientes: fudeiPendientes || 0,
            avisos: avisos || [],
            mensajesPendientes
        });

    } catch (error) {
        console.error("❌ Error al cargar panel docente:", error.message);
        res.render('profesor/profesor', {
            title: 'Panel Docente - Educare',
            user: req.session.user || req.session.usuario,
            estudiantes: [],
            fudeiPendientes: 0,
            avisos: [],
            mensajesPendientes: 0
        });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/profesor/informe-notas/:id', soloProfesor, async (req, res) => {
    const sessionUser = sesionUsuario(req);
    let connection;
    try {
        connection = await pool.getConnection();
        const estudiante = await estudianteDelProfesor(connection, parseInt(req.params.id, 10), sessionUser.id_persona);
        if (!estudiante) return res.status(404).send('Estudiante no encontrado entre tus cursos.');

        const periodos = await boletin.periodosDelEstudiante(connection, estudiante.id_estudiante);
        const periodo = periodos.find((p) => p.id_curso_periodo === estudiante.id_curso_periodo) || periodos[0];
        if (!periodo) return res.status(404).send('El estudiante no tiene periodos con inscripción activa.');

        const datos = await boletin.construirBoletin(connection, estudiante.id_estudiante, periodo.id_curso_periodo);
        const pdf = generarInformeNotas({
            estudiante,
            periodo,
            boletin: datos,
            emitidoPor: `Prof. ${sessionUser.nombre || ''} ${sessionUser.apellido || ''}`.trim(),
            fechaEmision: boletin.formatoFecha(new Date()),
            formatoNota: boletin.formatoNota,
            formatoFecha: boletin.formatoFecha
        });

        const nombreArchivo = `informe-notas-${estudiante.apellido}-${estudiante.nombre}-${periodo.anio}-S${periodo.semestre}.pdf`
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
});

// ==========================================
// 2. BANDEJA DE AVISOS (ESTILO GMAIL)
// ==========================================
router.get('/profesor/avisos', async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

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
              AND (ad.tipo_destino = 'GLOBAL' OR (ad.tipo_destino = 'ROL' AND r.nombre IN ('Profesor', 'Profesor Jefe')))
            ORDER BY a.fecha_publicacion DESC
        `);

        res.render('profesor/avisosP', {
            title: 'Centro de Comunicados - Educare',
            user: sessionUser,
            avisos: avisos || []
        });

    } catch (error) {
        console.error("❌ Error al cargar avisos del profesor:", error.message);
        res.render('profesor/avisosP', {
            title: 'Centro de Comunicados - Educare',
            user: req.session.user || req.session.usuario,
            avisos: []
        });
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// 3. ACCIONES Y CONTROLADORES
// ==========================================

// ==========================================
// NÓMINA COMPLETA DE ALUMNOS ASIGNADOS
// ==========================================
router.get('/profesor/estudiantes', async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const id_persona = sessionUser.id_persona;
        connection = await pool.getConnection();

        // 1. Obtener lista completa de estudiantes asignados
        const [estudiantes] = await connection.query(`
            SELECT DISTINCT 
                e.id_estudiante, 
                p.nombre, 
                p.apellido, 
                p.rut,
                c.nivel,
                c.seccion,
                CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, '')) AS nombre_curso,
                tn.nombre AS tipo_nee, 
                f.estado AS fudei_estado,
                f.id_fudei
            FROM PROFESOR prof
            INNER JOIN CURSO_ASIGNATURA ca ON prof.id_profesor = ca.id_profesor
            INNER JOIN CURSO_PERIODO cp ON ca.id_curso_periodo = cp.id_curso_periodo
            INNER JOIN CURSO c ON cp.id_curso = c.id_curso
            INNER JOIN INSCRIPCION i ON cp.id_curso_periodo = i.id_curso_periodo AND i.estado IN ('A', 'APROBADO')
            INNER JOIN ESTUDIANTE e ON i.id_estudiante = e.id_estudiante
            INNER JOIN PERSONA p ON e.id_persona = p.id_persona
            LEFT JOIN FUDEI f ON e.id_estudiante = f.id_estudiante
            LEFT JOIN TIPO_NEE tn ON f.id_tipo_nee = tn.id_tipo_nee
            WHERE prof.id_persona = ?
            ORDER BY c.nivel ASC, c.seccion ASC, p.apellido ASC
        `, [id_persona]);

        // 2. Obtener lista de cursos únicos asignados al profesor
        const [cursos] = await connection.query(`
            SELECT DISTINCT 
                c.nivel,
                c.seccion,
                CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, '')) AS nombre_curso
            FROM PROFESOR prof
            INNER JOIN CURSO_ASIGNATURA ca ON prof.id_profesor = ca.id_profesor
            INNER JOIN CURSO_PERIODO cp ON ca.id_curso_periodo = cp.id_curso_periodo
            INNER JOIN CURSO c ON cp.id_curso = c.id_curso
            WHERE prof.id_persona = ?
            ORDER BY c.nivel ASC, c.seccion ASC
        `, [id_persona]);

        const fudeiPendientes = (estudiantes || []).filter(e => e.fudei_estado === 'EN_PROCESO').length;

        res.render('profesor/alumnos', {
            title: 'Alumnos Asignados - Educare',
            user: sessionUser,
            estudiantes: estudiantes || [],
            cursos: cursos || [],
            fudeiPendientes
        });

    } catch (error) {
        console.error("❌ Error al cargar nómina de alumnos:", error.message);
        res.render('profesor/alumnos', {
            title: 'Alumnos Asignados - Educare',
            user: req.session.user || req.session.usuario,
            estudiantes: [],
            cursos: [],
            fudeiPendientes: 0
        });
    } finally {
        if (connection) connection.release();
    }
});

// Alias por si acceden mediante /profesor/alumnos
router.get('/profesor/alumnos', (req, res) => res.redirect('/profesor/estudiantes'));

router.get('/profesor/mensajes', (req, res) => {
    const consulta = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect('/profesor/atencionApo' + consulta);
});

router.get('/profesor/notasP', (req, res) => {
    const consulta = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect('/profesor/calificaciones' + consulta);
});

// ==========================================
// BANDEJA DE SOLICITUDES DE MATRÍCULA
// ==========================================

// 1. Ver solicitudes pendientes
router.get('/profesor/solicitudes', async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        connection = await pool.getConnection();

        const [profRows] = await connection.query(`
            SELECT pr.id_profesor 
            FROM PROFESOR pr 
            INNER JOIN USUARIO u ON pr.id_persona = u.id_persona 
            WHERE u.id_usuario = ?
        `, [Number(sessionUser.id_usuario)]);

        if (profRows.length === 0) {
            return res.render('profesor/solicitudes', {
                title: 'Solicitudes de Ingreso - Educare',
                user: sessionUser,
                solicitudes: [],
                error: 'No tienes un perfil de profesor asignado.'
            });
        }

        const idProfesor = profRows[0].id_profesor;

        const [solicitudes] = await connection.query(`
            SELECT DISTINCT
                i.id_inscripcion,
                i.fecha_inscripcion,
                p_est.rut AS rut_estudiante,
                CONCAT(p_est.nombre, ' ', p_est.apellido) AS nombre_estudiante,
                c.nivel,
                c.seccion,
                CONCAT(p_apo.nombre, ' ', p_apo.apellido) AS nombre_apoderado,
                ae.parentesco
            FROM INSCRIPCION i
            INNER JOIN CURSO_PERIODO cp ON i.id_curso_periodo = cp.id_curso_periodo
            INNER JOIN CURSO c ON cp.id_curso = c.id_curso
            INNER JOIN CURSO_ASIGNATURA ca ON cp.id_curso_periodo = ca.id_curso_periodo
            INNER JOIN ESTUDIANTE e ON i.id_estudiante = e.id_estudiante
            INNER JOIN PERSONA p_est ON e.id_persona = p_est.id_persona
            LEFT JOIN APODERADO_ESTUDIANTE ae ON e.id_estudiante = ae.id_estudiante
            LEFT JOIN APODERADO a ON ae.id_apoderado = a.id_apoderado
            LEFT JOIN PERSONA p_apo ON a.id_persona = p_apo.id_persona
            WHERE ca.id_profesor = ? AND i.estado = 'P'
            ORDER BY i.fecha_inscripcion DESC
        `, [idProfesor]);

        res.render('profesor/solicitudes', {
            title: 'Solicitudes de Ingreso - Educare',
            user: sessionUser,
            solicitudes: solicitudes || [],
            error: req.query.error || null,
            success: req.query.success || null
        });

    } catch (error) {
        console.error("❌ Error al cargar solicitudes:", error.message);
        res.render('profesor/solicitudes', {
            title: 'Solicitudes de Ingreso - Educare',
            user: req.session.user || req.session.usuario,
            solicitudes: [],
            error: 'Error al consultar las solicitudes de ingreso.'
        });
    } finally {
        if (connection) connection.release();
    }
});

const actualizarSolicitud = (estadoNuevo, mensajeOk) => async (req, res) => {
    const { id } = req.params;
    const sessionUser = req.session.user || req.session.usuario;
    if (!sessionUser) return res.redirect('/login');

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.query(`
            SELECT i.id_estudiante
            FROM INSCRIPCION i
            INNER JOIN CURSO_ASIGNATURA ca ON ca.id_curso_periodo = i.id_curso_periodo
            INNER JOIN PROFESOR pr ON pr.id_profesor = ca.id_profesor
            WHERE i.id_inscripcion = ? AND i.estado = 'P' AND pr.id_persona = ?
            LIMIT 1
        `, [id, sessionUser.id_persona]);

        if (rows.length === 0) {
            throw new Error('Solicitud no encontrada o sin permisos para gestionarla.');
        }

        await connection.query(
            `UPDATE INSCRIPCION SET estado = ? WHERE id_inscripcion = ?`,
            [estadoNuevo, id]
        );
        await connection.query(
            `UPDATE APODERADO_ESTUDIANTE SET estado = ? WHERE id_estudiante = ?`,
            [estadoNuevo, rows[0].id_estudiante]
        );

        await connection.commit();
        return res.redirect(`/profesor/solicitudes?success=${encodeURIComponent(mensajeOk)}`);
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Error al gestionar solicitud:", error.message);
        return res.redirect(`/profesor/solicitudes?error=${encodeURIComponent(error.message)}`);
    } finally {
        if (connection) connection.release();
    }
};

router.post('/profesor/solicitudes/aceptar/:id', actualizarSolicitud('A', 'Estudiante aceptado exitosamente en el curso.'));
router.post('/profesor/solicitudes/rechazar/:id', actualizarSolicitud('I', 'Solicitud de ingreso rechazada.'));

module.exports = router;