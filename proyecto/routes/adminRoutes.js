const express = require('express');
const router = express.Router();
const adminController = require('../auth/controllers/adminController');
const { isAdmin } = require('../auth/authMiddleware');
const pool = require('../config/db');
const { validarNoPasada } = require('../utils/fechas');
const jefe = require('../utils/jefe');

// Middleware de verificación
const checkAdmin = typeof isAdmin === 'function' ? isAdmin : (req, res, next) => next();

// ==========================================
// 0. DASHBOARD ADMINISTRATIVO
// ==========================================
router.get('/admin', checkAdmin, adminController.showAdminDashboard);

// ==========================================
// 1. GESTIÓN DE PROFESORES
// ==========================================
router.get('/admin/profesores', checkAdmin, adminController.showProfesoresList);
router.get('/admin/profesores-edit/:id', checkAdmin, adminController.getEditarProfesor);
router.post('/admin/profesores-edit/:id', checkAdmin, adminController.postEditarProfesor);
router.post('/admin/profesores-delete/:id', checkAdmin, adminController.postEliminarProfesor);

// ==========================================
// 2. GESTIÓN DE ESTUDIANTES
// ==========================================
router.get('/admin/students', checkAdmin, adminController.showEstudiantesList);
router.get('/admin/student-edit/:id', checkAdmin, adminController.getEditarEstudiante);
router.post('/admin/student-edit/:id', checkAdmin, adminController.postEditarEstudiante);
router.post('/admin/students-delete/:id', checkAdmin, adminController.postEliminarEstudiante);

// ==========================================
// 3. GESTIÓN DE APODERADOS
// ==========================================
router.get('/admin/apoderadoA', checkAdmin, adminController.showApoderadosList);
router.get('/admin/apoderado-edit/:id', checkAdmin, adminController.getEditarApoderado);
router.post('/admin/apoderado-edit/:id', checkAdmin, adminController.postEditarApoderado);
router.post('/admin/apoderados-delete/:id', checkAdmin, adminController.postEliminarApoderado);

// ==========================================
// 4. SOLICITUDES PENDIENTES
// ==========================================
router.get('/admin/solicitudes', checkAdmin, adminController.showSolicitudesList);
router.post('/admin/usuarios/:id/aprobar', checkAdmin, adminController.aprobarUsuario);
router.post('/admin/usuarios/:id/rechazar', checkAdmin, adminController.rechazarUsuario);

// ==========================================
// 5. GESTIÓN DE CURSOS, RAMOS Y DOCENTES
// ==========================================
router.get('/admin/cursos', checkAdmin, async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        connection = await pool.getConnection();

        // 1. Obtener Cursos Activos
        const [cursos] = await connection.query(`
            SELECT id_curso, nivel, seccion, jornada, sala, estado
            FROM CURSO
            ORDER BY nivel ASC, seccion ASC
        `);

        // 2. Obtener Asignaturas Activas
        const [asignaturas] = await connection.query(`
            SELECT id_asignatura, codigo, nombre, descripcion, estado
            FROM ASIGNATURA
            ORDER BY nombre ASC
        `);

        // 3. Obtener Profesores Activos
        const [profesores] = await connection.query(`
            SELECT 
                pr.id_profesor, 
                pr.id_asignatura,
                CONCAT(p.nombre, ' ', p.apellido) AS nombre_completo,
                COALESCE(a.nombre, 'Sin especialidad') AS especialidad
            FROM PROFESOR pr
            INNER JOIN PERSONA p ON pr.id_persona = p.id_persona
            LEFT JOIN ASIGNATURA a ON a.id_asignatura = pr.id_asignatura
            ORDER BY p.apellido ASC, p.nombre ASC
        `);

        // 4. Obtener Carga Académica (Asignaciones actuales de Profesor -> Curso + Ramo)
        const [asignaciones] = await connection.query(`
            SELECT 
                ca.id_curso_asig,
                c.id_curso,
                TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) AS nombre_curso,
                asig.nombre AS nombre_asignatura,
                CONCAT(p.nombre, ' ', p.apellido) AS nombre_profesor
            FROM CURSO_ASIGNATURA ca
            INNER JOIN CURSO_PERIODO cp ON ca.id_curso_periodo = cp.id_curso_periodo
            INNER JOIN CURSO c ON cp.id_curso = c.id_curso
            INNER JOIN ASIGNATURA asig ON ca.id_asignatura = asig.id_asignatura
            INNER JOIN PROFESOR pr ON ca.id_profesor = pr.id_profesor
            INNER JOIN PERSONA p ON pr.id_persona = p.id_persona
            ORDER BY c.nivel ASC, c.seccion ASC, asig.nombre ASC
        `);

        let jefaturas = [];
        try {
            const [filasJefatura] = await connection.query(`
                SELECT
                    cp.id_curso_periodo,
                    TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) AS nombre_curso,
                    CONCAT(pa.\`año\`, '-', pa.semestre) AS periodo,
                    CONCAT(p.nombre, ' ', p.apellido) AS nombre_jefe
                FROM CURSO_PERIODO cp
                INNER JOIN CURSO c ON c.id_curso = cp.id_curso
                INNER JOIN PERIODO_ACADEMICO pa ON pa.id_periodo = cp.id_periodo
                INNER JOIN PROFESOR pr ON pr.id_profesor = cp.id_profesor_jefe
                INNER JOIN PERSONA p ON p.id_persona = pr.id_persona
                ORDER BY c.nivel ASC, c.seccion ASC
            `);
            jefaturas = filasJefatura;
        } catch (errorJefatura) {
            console.error("❌ Jefaturas no disponibles (¿migración pendiente?):", errorJefatura.message);
        }

        res.render('admin/cursos', {
            title: 'Gestión de Cursos y Ramos - Educare',
            user: sessionUser,
            jefaturas,
            cursos: cursos || [],
            asignaturas: asignaturas || [],
            profesores: profesores || [],
            asignaciones: asignaciones || [],
            error: req.query.error || null,
            success: req.query.success || null
        });

    } catch (error) {
        console.error("❌ Error al cargar Cursos y Ramos:", error.message);
        res.render('admin/cursos', {
            title: 'Gestión de Cursos y Ramos - Educare',
            user: req.session.user || req.session.usuario,
            cursos: [],
            asignaturas: [],
            profesores: [],
            asignaciones: [],
            jefaturas: [],
            error: `Error al consultar la base de datos: ${error.message}`,
            success: null
        });
    } finally {
        if (connection) connection.release();
    }
});

// Ruta para crear nuevos Cursos
router.post('/admin/cursos/crear-curso', checkAdmin, async (req, res) => {
    const { nivel, seccion, jornada, sala } = req.body;
    let connection;

    try {
        if (!nivel || !seccion) {
            return res.redirect('/admin/cursos?error=El nivel y la sección son requeridos.');
        }

        connection = await pool.getConnection();
        await connection.query(
            `INSERT INTO CURSO (nivel, seccion, jornada, sala, estado) VALUES (?, ?, ?, ?, 'A')`,
            [nivel.trim(), seccion.trim().toUpperCase(), jornada || 'Mañana', sala || 'S/N']
        );

        return res.redirect('/admin/cursos?success=Curso creado correctamente.');
    } catch (error) {
        console.error("❌ Error al crear curso:", error.message);
        return res.redirect(`/admin/cursos?error=${encodeURIComponent(error.message)}`);
    } finally {
        if (connection) connection.release();
    }
});

// Ruta para crear nuevas Asignaturas
router.post('/admin/cursos/crear-asignatura', checkAdmin, async (req, res) => {
    const { codigo, nombre, descripcion } = req.body;
    let connection;

    try {
        if (!codigo || !nombre) {
            return res.redirect('/admin/cursos?error=El código y nombre del ramo son requeridos.');
        }

        connection = await pool.getConnection();
        await connection.query(
            `INSERT INTO ASIGNATURA (codigo, nombre, descripcion, estado) VALUES (?, ?, ?, 'A')`,
            [codigo.trim().toUpperCase(), nombre.trim(), descripcion ? descripcion.trim() : '']
        );

        return res.redirect('/admin/cursos?success=Asignatura agregada exitosamente.');
    } catch (error) {
        console.error("❌ Error al crear asignatura:", error.message);
        let msg = error.message;
        if (error.code === 'ER_DUP_ENTRY') msg = 'El código de asignatura ya se encuentra registrado.';
        return res.redirect(`/admin/cursos?error=${encodeURIComponent(msg)}`);
    } finally {
        if (connection) connection.release();
    }
});

// Ruta para Asignar un Profesor a un Curso y Ramo
router.post('/admin/cursos/asignar-profesor', checkAdmin, async (req, res) => {
    const { id_curso, id_asignatura, id_profesor } = req.body;
    let connection;

    try {
        if (!id_curso || !id_asignatura || !id_profesor) {
            return res.redirect('/admin/cursos?error=Debes seleccionar un curso, un ramo y un profesor.');
        }

        connection = await pool.getConnection();

        const [profRows] = await connection.query(
            'SELECT id_asignatura FROM PROFESOR WHERE id_profesor = ?',
            [id_profesor]
        );
        if (profRows.length === 0 || String(profRows[0].id_asignatura) !== String(id_asignatura)) {
            return res.redirect(`/admin/cursos?error=${encodeURIComponent('El profesor seleccionado no imparte la asignatura elegida.')}`);
        }

        await connection.beginTransaction();

        // 1. Obtener el período académico activo
        let [periodos] = await connection.query(`SELECT id_periodo FROM PERIODO_ACADEMICO WHERE estado = 'A' LIMIT 1`);
        let idPeriodo = periodos.length > 0 ? periodos[0].id_periodo : 1;

        // 2. Verificar o crear el registro en CURSO_PERIODO (sin las columnas 'cupos' ni 'estado')
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

        // 3. Vincular el ramo y el profesor al curso
        await connection.query(`
            INSERT INTO CURSO_ASIGNATURA (id_curso_periodo, id_asignatura, id_profesor)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE id_profesor = VALUES(id_profesor)
        `, [idCursoPeriodo, id_asignatura, id_profesor]);

        await connection.commit();
        return res.redirect('/admin/cursos?success=Profesor asignado al curso exitosamente.');

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Error al asignar profesor:", error.message);
        return res.redirect(`/admin/cursos?error=${encodeURIComponent(error.message)}`);
    } finally {
        if (connection) connection.release();
    }
});

router.post('/admin/cursos/asignar-jefe', checkAdmin, async (req, res) => {
    const { id_curso, id_profesor } = req.body;
    if (!id_curso || !id_profesor) {
        return res.redirect('/admin/cursos?error=Debes seleccionar un curso y un profesor jefe.');
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [periodos] = await connection.query(`SELECT id_periodo FROM PERIODO_ACADEMICO WHERE estado = 'A' LIMIT 1`);
        const idPeriodo = periodos.length > 0 ? periodos[0].id_periodo : 1;

        const [cpRows] = await connection.query(
            'SELECT id_curso_periodo, id_profesor_jefe FROM CURSO_PERIODO WHERE id_curso = ? AND id_periodo = ? LIMIT 1',
            [id_curso, idPeriodo]
        );

        let idCursoPeriodo;
        let jefeAnterior = null;
        if (cpRows.length > 0) {
            idCursoPeriodo = cpRows[0].id_curso_periodo;
            jefeAnterior = cpRows[0].id_profesor_jefe;
        } else {
            const [insertado] = await connection.query('INSERT INTO CURSO_PERIODO (id_curso, id_periodo) VALUES (?, ?)', [id_curso, idPeriodo]);
            idCursoPeriodo = insertado.insertId;
        }

        await connection.query('UPDATE CURSO_PERIODO SET id_profesor_jefe = ? WHERE id_curso_periodo = ?', [id_profesor, idCursoPeriodo]);
        await jefe.sincronizarRolJefe(connection, id_profesor);
        if (jefeAnterior && String(jefeAnterior) !== String(id_profesor)) {
            await jefe.sincronizarRolJefe(connection, jefeAnterior);
        }

        await connection.commit();
        return res.redirect('/admin/cursos?success=Profesor jefe asignado. Debe cerrar sesión y volver a ingresar para ver su nuevo panel.');
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Error al asignar profesor jefe:", error.message);
        return res.redirect(`/admin/cursos?error=${encodeURIComponent('No se pudo asignar el profesor jefe: ' + error.message)}`);
    } finally {
        if (connection) connection.release();
    }
});

router.post('/admin/cursos/quitar-jefe/:id', checkAdmin, async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [filas] = await connection.query('SELECT id_profesor_jefe FROM CURSO_PERIODO WHERE id_curso_periodo = ?', [req.params.id]);
        if (filas.length === 0 || !filas[0].id_profesor_jefe) {
            await connection.rollback();
            return res.redirect('/admin/cursos?error=La jefatura indicada no existe.');
        }

        await connection.query('UPDATE CURSO_PERIODO SET id_profesor_jefe = NULL WHERE id_curso_periodo = ?', [req.params.id]);
        await jefe.sincronizarRolJefe(connection, filas[0].id_profesor_jefe);
        await connection.commit();
        return res.redirect('/admin/cursos?success=Jefatura retirada correctamente.');
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Error al quitar profesor jefe:", error.message);
        return res.redirect(`/admin/cursos?error=${encodeURIComponent(error.message)}`);
    } finally {
        if (connection) connection.release();
    }
});

// Ruta para desvincular la carga académica
router.post('/admin/cursos/eliminar-asignacion/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.query(`DELETE FROM CURSO_ASIGNATURA WHERE id_curso_asig = ?`, [id]);
        return res.redirect('/admin/cursos?success=Asignación eliminada correctamente.');
    } catch (error) {
        console.error("❌ Error al eliminar asignación:", error.message);
        return res.redirect(`/admin/cursos?error=${encodeURIComponent(error.message)}`);
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// 6. GESTIÓN DE AVISOS Y CIRCULARES
// ==========================================
router.get('/admin/avisos', checkAdmin, async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        connection = await pool.getConnection();

        const [avisos] = await connection.query(`
            SELECT 
                a.id_aviso,
                a.titulo,
                a.contenido,
                a.prioridad,
                a.fecha_publicacion,
                a.fecha_expiracion,
                a.estado,
                p.nombre AS autor_nombre,
                p.apellido AS autor_apellido,
                ad.tipo_destino,
                r.nombre AS nombre_rol,
                CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, '')) AS nombre_curso
            FROM AVISO a
            INNER JOIN USUARIO u ON a.id_usuario = u.id_usuario
            INNER JOIN PERSONA p ON u.id_persona = p.id_persona
            LEFT JOIN AVISO_DESTINATARIO ad ON a.id_aviso = ad.id_aviso
            LEFT JOIN ROL r ON ad.id_rol = r.id_rol
            LEFT JOIN CURSO c ON ad.id_curso = c.id_curso
            WHERE a.estado = 'A'
            ORDER BY a.fecha_publicacion DESC
        `);

        const avisosFmt = (avisos || []).map(a => ({
            ...a,
            fecha_expiracion_fmt: a.fecha_expiracion ? new Date(a.fecha_expiracion).toISOString().split('T')[0] : ''
        }));

        const [roles] = await connection.query(`SELECT id_rol, nombre FROM ROL ORDER BY nombre ASC`);

        const [cursos] = await connection.query(`
            SELECT id_curso, CONCAT(COALESCE(nivel, ''), ' ', COALESCE(seccion, '')) AS nombre_curso 
            FROM CURSO 
            WHERE estado = 'A'
            ORDER BY nivel ASC, seccion ASC
        `);

        res.render('admin/avisos', {
            title: 'Avisos e Informes - Educare',
            user: sessionUser,
            avisos: avisosFmt,
            roles: roles || [],
            cursos: cursos || [],
            error: req.query.error || null,
            success: req.query.success || null
        });

    } catch (error) {
        console.error("❌ Error al cargar avisos:", error.message);
        res.render('admin/avisos', {
            title: 'Avisos e Informes - Educare',
            user: req.session.user || req.session.usuario,
            avisos: [],
            roles: [],
            cursos: [],
            error: `Error al consultar la base de datos: ${error.message}`,
            success: null
        });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/admin/avisos/crear', checkAdmin, async (req, res) => {
    const { titulo, contenido, prioridad, tipo_destino, id_rol, id_curso, fecha_expiracion } = req.body;
    let connection;

    try {
        const sessionUser = req.session.user || req.session.usuario;
        const id_usuario = sessionUser.id_usuario || sessionUser.id;

        if (!titulo || !contenido) {
            return res.redirect('/admin/avisos?error=El título y el contenido son obligatorios.');
        }

        const errorFecha = validarNoPasada(fecha_expiracion, 'La fecha de expiración');
        if (errorFecha) {
            return res.redirect(`/admin/avisos?error=${encodeURIComponent(errorFecha)}`);
        }

        if ((tipo_destino === 'ROL' && !id_rol) || (tipo_destino === 'CURSO' && !id_curso)) {
            return res.redirect('/admin/avisos?error=Debes seleccionar el rol o el curso de destino.');
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [resultAviso] = await connection.query(`
            INSERT INTO AVISO (id_usuario, titulo, contenido, prioridad, fecha_expiracion, estado)
            VALUES (?, ?, ?, ?, ?, 'A')
        `, [
            id_usuario,
            titulo.trim(),
            contenido.trim(),
            prioridad || 'Normal',
            fecha_expiracion && fecha_expiracion.trim() !== '' ? fecha_expiracion : null
        ]);

        const newAvisoId = resultAviso.insertId;

        let targetRol = (tipo_destino === 'ROL' && id_rol) ? id_rol : null;
        let targetCurso = (tipo_destino === 'CURSO' && id_curso) ? id_curso : null;

        await connection.query(`
            INSERT INTO AVISO_DESTINATARIO (id_aviso, tipo_destino, id_rol, id_curso)
            VALUES (?, ?, ?, ?)
        `, [newAvisoId, tipo_destino || 'GLOBAL', targetRol, targetCurso]);

        await connection.commit();
        return res.redirect(`/admin/avisos?success=${encodeURIComponent('Aviso publicado exitosamente.')}`);

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Error al crear aviso:", error.message);
        return res.redirect(`/admin/avisos?error=${encodeURIComponent(error.message)}`);
    } finally {
        if (connection) connection.release();
    }
});

router.post('/admin/avisos/editar/:id', checkAdmin, async (req, res) => {
    const idAviso = req.params.id;
    const { titulo, prioridad, fecha_expiracion, contenido } = req.body;
    let connection;

    try {
        if (!titulo || !contenido) {
            return res.redirect('/admin/avisos?error=El título y contenido son obligatorios para editar.');
        }

        const errorFecha = validarNoPasada(fecha_expiracion, 'La fecha de expiración');
        if (errorFecha) {
            return res.redirect(`/admin/avisos?error=${encodeURIComponent(errorFecha)}`);
        }

        connection = await pool.getConnection();
        const fExpiracionVal = fecha_expiracion && fecha_expiracion.trim() !== '' ? fecha_expiracion : null;

        await connection.query(`
            UPDATE AVISO 
            SET titulo = ?, prioridad = ?, fecha_expiracion = ?, contenido = ?
            WHERE id_aviso = ?
        `, [titulo.trim(), prioridad || 'Normal', fExpiracionVal, contenido.trim(), idAviso]);

        return res.redirect('/admin/avisos?success=Comunicado actualizado correctamente.');

    } catch (error) {
        console.error("❌ Error al editar aviso:", error.message);
        return res.redirect(`/admin/avisos?error=${encodeURIComponent(error.message)}`);
    } finally {
        if (connection) connection.release();
    }
});

router.post('/admin/avisos/eliminar/:id', checkAdmin, async (req, res) => {
    const idAviso = req.params.id;
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query(`DELETE FROM AVISO_DESTINATARIO WHERE id_aviso = ?`, [idAviso]);
        const [resultado] = await connection.query(`DELETE FROM AVISO WHERE id_aviso = ?`, [idAviso]);

        await connection.commit();

        if (resultado.affectedRows === 0) {
            return res.redirect(`/admin/avisos?error=${encodeURIComponent('El aviso ya no existe.')}`);
        }
        return res.redirect(`/admin/avisos?success=${encodeURIComponent('Aviso eliminado correctamente.')}`);

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("❌ Error al eliminar aviso:", error.message);
        return res.redirect(`/admin/avisos?error=${encodeURIComponent(error.message)}`);
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;