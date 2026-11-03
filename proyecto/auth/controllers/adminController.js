const pool = require('../../config/db');
const { validarNacimiento } = require('../../utils/fechas');

// ==========================================
// 0. DASHBOARD ADMINISTRATIVO
// ==========================================
exports.showAdminDashboard = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser || Number(sessionUser.id_rol) !== 1) {
            return res.redirect('/'); 
        }

        const [profesoresResult] = await pool.query('SELECT COUNT(*) AS total FROM PROFESOR');
        const [estudiantesResult] = await pool.query('SELECT COUNT(*) AS total FROM ESTUDIANTE');
        const [apoderadosResult] = await pool.query('SELECT COUNT(*) AS total FROM APODERADO');
        const [solicitudesResult] = await pool.query("SELECT COUNT(*) AS total FROM USUARIO WHERE estado = 'P'");

        const totalProfesores = profesoresResult[0]?.total || 0;
        const totalEstudiantes = estudiantesResult[0]?.total || 0;
        const totalApoderados = apoderadosResult[0]?.total || 0;
        const totalSolicitudes = solicitudesResult[0]?.total || 0;

        const totalUsuarios = totalProfesores + totalEstudiantes + totalApoderados;

        res.render('admin/admin', {
            title: 'Panel de Administración - Educare',
            user: sessionUser,
            totalUsuarios,
            totalProfesores,
            totalEstudiantes,
            totalApoderados,
            totalSolicitudes
        });
    } catch (error) {
        console.error('Error al cargar datos del dashboard:', error);
        res.status(500).send('Error interno al cargar el panel de administración');
    }
};

// ==========================================
// 1. GESTIÓN DE PROFESORES
// ==========================================
exports.showProfesoresList = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser || Number(sessionUser.id_rol) !== 1) {
            return res.redirect('/'); 
        }

        const [profesores] = await pool.query(`
            SELECT 
                u.id_usuario,
                p.id_persona,
                pr.id_profesor,
                p.rut,
                p.nombre,
                p.apellido,
                DATE_FORMAT(p.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
                p.genero,
                u.correo,
                pr.id_asignatura,
                COALESCE(a.nombre, pr.especialidad, 'Sin registrar') AS especialidad,
                pr.telefono
            FROM PROFESOR pr
            INNER JOIN PERSONA p ON p.id_persona = pr.id_persona
            LEFT JOIN USUARIO u ON u.id_persona = p.id_persona
            LEFT JOIN ASIGNATURA a ON a.id_asignatura = pr.id_asignatura
            ORDER BY p.apellido ASC, p.nombre ASC;
        `);

        const [asignaturas] = await pool.query(
            `SELECT id_asignatura, codigo, nombre FROM ASIGNATURA WHERE estado = 'A' ORDER BY nombre ASC`
        );

        res.render('admin/profesores', {
            title: 'Gestión de Profesores - Administrador',
            user: sessionUser,
            profesores: profesores,
            asignaturas: asignaturas,
            error: null
        });
    } catch (error) {
        console.error('Error al cargar profesores:', error);
        res.render('admin/profesores', {
            title: 'Gestión de Profesores',
            user: req.session.user || req.session.usuario,
            profesores: [],
            asignaturas: [],
            error: 'Ocurrió un error al cargar la lista de profesores.'
        });
    }
};

exports.getEditarProfesor = (req, res) => {
    return res.redirect('/admin/profesores');
};

exports.postEditarProfesor = async (req, res) => {
    const id_usuario = req.params.id;
    const { id_persona, id_profesor, rut, nombre, apellido, fecha_nacimiento, genero, correo, id_asignatura, telefono } = req.body;

    const errorFecha = validarNacimiento(fecha_nacimiento, 'adulto');
    if (errorFecha) {
        return res.redirect(`/admin/profesores?error=${encodeURIComponent(errorFecha)}`);
    }

    let connection;
    try {
        let idAsignaturaValida = null;
        let nombreEspecialidad = null;

        if (id_asignatura) {
            const [asignaturas] = await pool.query(
                'SELECT id_asignatura, nombre FROM ASIGNATURA WHERE id_asignatura = ?',
                [id_asignatura]
            );
            if (asignaturas.length === 0) {
                return res.redirect(`/admin/profesores?error=${encodeURIComponent('La especialidad seleccionada no existe.')}`);
            }
            idAsignaturaValida = asignaturas[0].id_asignatura;
            nombreEspecialidad = asignaturas[0].nombre;
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query(`
            UPDATE PERSONA 
            SET rut = ?, nombre = ?, apellido = ?, fecha_nacimiento = ?, genero = ?
            WHERE id_persona = ?;
        `, [rut, nombre, apellido, fecha_nacimiento || null, genero, id_persona]);

        await connection.query(`
            UPDATE USUARIO 
            SET correo = ?
            WHERE id_usuario = ?;
        `, [correo, id_usuario]);

        await connection.query(`
            UPDATE PROFESOR 
            SET id_asignatura = ?, especialidad = ?, telefono = ?
            WHERE id_profesor = ?;
        `, [idAsignaturaValida, nombreEspecialidad, telefono || null, id_profesor]);

        await connection.commit();
        return res.redirect('/admin/profesores?updated=true');
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error al actualizar profesor:', error);
        const mensaje = error.code === 'ER_DUP_ENTRY'
            ? 'El RUT o el correo ya están registrados en otro usuario.'
            : 'Ocurrió un error al actualizar los datos del profesor.';
        return res.redirect(`/admin/profesores?error=${encodeURIComponent(mensaje)}`);
    } finally {
        if (connection) connection.release();
    }
};

exports.postEliminarProfesor = async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        const [userRows] = await connection.query('SELECT id_persona FROM USUARIO WHERE id_usuario = ?', [id]);
        if (userRows.length === 0) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            await connection.rollback();
            connection.release();
            return res.redirect('/admin/profesores');
        }

        const id_persona = userRows[0].id_persona;
        const [profRows] = await connection.query('SELECT id_profesor FROM PROFESOR WHERE id_persona = ?', [id_persona]);

        if (profRows.length > 0) {
            const id_profesor = profRows[0].id_profesor;
            await connection.query('DELETE FROM CURSO_ASIGNATURA WHERE id_profesor = ?', [id_profesor]);
            await connection.query('DELETE FROM PROFESOR WHERE id_profesor = ?', [id_profesor]);
        }

        await connection.query('DELETE FROM USUARIO_ROL WHERE id_usuario = ?', [id]);
        await connection.query('DELETE FROM AVISO_DESTINATARIO WHERE id_usuario = ?', [id]);
        await connection.query('DELETE FROM AVISO WHERE id_usuario = ?', [id]);
        await connection.query('DELETE FROM AUDITORIA WHERE id_usuario = ?', [id]);
        await connection.query('DELETE FROM USUARIO WHERE id_usuario = ?', [id]);
        await connection.query('DELETE FROM FUDEI_EQUIPO_EVALUADOR WHERE id_persona = ?', [id_persona]);
        await connection.query('DELETE FROM PERSONA WHERE id_persona = ?', [id_persona]);

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.commit();
        connection.release();

        return res.redirect('/admin/profesores?deleted=true');
    } catch (error) {
        if (connection) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            await connection.rollback();
            connection.release();
        }
        console.error('Error al eliminar profesor:', error);
        return res.redirect('/admin/profesores');
    }
};

// ==========================================
// 2. GESTIÓN DE ESTUDIANTES
// ==========================================
exports.showEstudiantesList = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser || Number(sessionUser.id_rol) !== 1) {
            return res.redirect('/');
        }

        const [estudiantes] = await pool.query(`
            SELECT 
                e.id_estudiante,
                p.id_persona,
                p.rut,
                CONCAT(p.nombre, ' ', p.apellido) AS nombre_completo,
                p.nombre,
                p.apellido,
                DATE_FORMAT(p.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
                p.genero,
                TRIM(CONCAT(COALESCE(c.nivel, 'Sin'), ' ', COALESCE(c.seccion, 'Curso'))) AS curso,
                COALESCE(tn.nombre, 'Sin Diagnóstico') AS diagnostico_nee
            FROM ESTUDIANTE e
            INNER JOIN PERSONA p ON p.id_persona = e.id_persona
            LEFT JOIN INSCRIPCION i ON e.id_estudiante = i.id_estudiante
            LEFT JOIN CURSO_PERIODO cp ON i.id_curso_periodo = cp.id_curso_periodo
            LEFT JOIN CURSO c ON cp.id_curso = c.id_curso
            LEFT JOIN FUDEI f ON e.id_estudiante = f.id_estudiante
            LEFT JOIN TIPO_NEE tn ON f.id_tipo_nee = tn.id_tipo_nee
            ORDER BY p.apellido ASC, p.nombre ASC;
        `);

        let cursos = [];
        try {
            const [cursosResult] = await pool.query(`
                SELECT 
                    id_curso, 
                    TRIM(CONCAT(COALESCE(nivel, ''), ' ', COALESCE(seccion, ''))) AS nombre_curso 
                FROM CURSO 
                ORDER BY nivel ASC, seccion ASC
            `);
            cursos = cursosResult;
        } catch (errCurso) {
            console.log('⚠️ No se cargó el selector de cursos:', errCurso.message);
        }

        return res.render('admin/students', {
            title: 'Gestión de Estudiantes - Educare',
            user: sessionUser,
            students: estudiantes || [],
            estudiantes: estudiantes || [],
            cursos: cursos || [],
            error: null
        });

    } catch (error) {
        console.error('❌ ERROR EN showEstudiantesList:', error);
        return res.render('admin/students', {
            title: 'Gestión de Estudiantes - Educare',
            user: req.session.user || req.session.usuario,
            students: [],
            estudiantes: [],
            cursos: [],
            error: 'Ocurrió un error al obtener la lista de estudiantes.'
        });
    }
};

exports.getEditarEstudiante = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        const { id } = req.params;

        const [rows] = await pool.query(`
            SELECT 
                e.id_estudiante,
                p.id_persona,
                p.rut,
                p.nombre,
                p.apellido,
                DATE_FORMAT(p.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
                p.genero
            FROM ESTUDIANTE e
            INNER JOIN PERSONA p ON p.id_persona = e.id_persona
            LEFT JOIN USUARIO u ON u.id_persona = p.id_persona
            WHERE e.id_estudiante = ? OR p.id_persona = ? OR u.id_usuario = ?;
        `, [id, id, id]);

        if (rows.length === 0) {
            return res.send(`⚠️ No se encontró ningún estudiante en la base de datos con el ID ${id}.`);
        }

        return res.render('admin/student-edit', {
            title: 'Editar Estudiante - Educare',
            user: sessionUser,
            estudiante: rows[0],
            student: rows[0],
            error: null
        });

    } catch (error) {
        console.error('❌ Error en getEditarEstudiante:', error);
        return res.status(500).send(`Error de Renderizado EJS: ${error.message}`);
    }
};

exports.postEditarEstudiante = async (req, res) => {
    const { id } = req.params;
    const { id_persona, rut, nombre, apellido, fecha_nacimiento, genero } = req.body;

    const errorFecha = validarNacimiento(fecha_nacimiento, 'estudiante');
    if (errorFecha) {
        return res.redirect(`/admin/students?error=${encodeURIComponent(errorFecha)}`);
    }

    try {
        await pool.query(`
            UPDATE PERSONA 
            SET rut = ?, nombre = ?, apellido = ?, fecha_nacimiento = ?, genero = ?
            WHERE id_persona = ?;
        `, [rut, nombre, apellido, fecha_nacimiento || null, genero, id_persona]);

        return res.redirect('/admin/students?updated=true');

    } catch (error) {
        console.error('❌ Error al guardar datos del estudiante:', error);
        const mensaje = error.code === 'ER_DUP_ENTRY'
            ? 'El RUT ingresado ya pertenece a otra persona.'
            : 'Ocurrió un error al guardar los datos del estudiante.';
        return res.redirect(`/admin/students?error=${encodeURIComponent(mensaje)}`);
    }
};

exports.postEliminarEstudiante = async (req, res) => {
    const { id } = req.params;
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        let id_persona = null;
        let id_usuario = null;
        let id_estudiante = null;

        const [estRows] = await connection.query(`
            SELECT e.id_estudiante, e.id_persona, u.id_usuario 
            FROM ESTUDIANTE e 
            INNER JOIN PERSONA p ON p.id_persona = e.id_persona 
            LEFT JOIN USUARIO u ON u.id_persona = p.id_persona 
            WHERE e.id_estudiante = ? OR p.id_persona = ? OR u.id_usuario = ?;
        `, [id, id, id]);

        if (estRows.length > 0) {
            id_estudiante = estRows[0].id_estudiante;
            id_persona = estRows[0].id_persona;
            id_usuario = estRows[0].id_usuario;
        }

        const safeDelete = async (sql, params) => {
            try { await connection.query(sql, params); } catch (e) {}
        };

        if (id_estudiante) {
            await safeDelete('DELETE FROM CALIFICACION WHERE id_estudiante = ?', [id_estudiante]);
            await safeDelete('DELETE FROM ASISTENCIA WHERE id_estudiante = ?', [id_estudiante]);
            await safeDelete('DELETE FROM INSCRIPCION WHERE id_estudiante = ?', [id_estudiante]);
            await safeDelete('DELETE FROM APODERADO_ESTUDIANTE WHERE id_estudiante = ?', [id_estudiante]);
            await safeDelete('DELETE FROM FUDEI_APOYO WHERE id_fudei IN (SELECT id_fudei FROM FUDEI WHERE id_estudiante = ?)', [id_estudiante]);
            await safeDelete('DELETE FROM FUDEI_EQUIPO_EVALUADOR WHERE id_fudei IN (SELECT id_fudei FROM FUDEI WHERE id_estudiante = ?)', [id_estudiante]);
            await safeDelete('DELETE FROM FUDEI_SINTESIS_EVALUACION WHERE id_fudei IN (SELECT id_fudei FROM FUDEI WHERE id_estudiante = ?)', [id_estudiante]);
            await safeDelete('DELETE FROM FUDEI WHERE id_estudiante = ?', [id_estudiante]);
            await safeDelete('DELETE FROM ESTUDIANTE WHERE id_estudiante = ?', [id_estudiante]);
        }

        if (id_usuario) {
            await safeDelete('DELETE FROM USUARIO_ROL WHERE id_usuario = ?', [id_usuario]);
            await safeDelete('DELETE FROM AVISO_DESTINATARIO WHERE id_usuario = ?', [id_usuario]);
            await safeDelete('DELETE FROM AVISO WHERE id_usuario = ?', [id_usuario]);
            await safeDelete('DELETE FROM AUDITORIA WHERE id_usuario = ?', [id_usuario]);
            await safeDelete('DELETE FROM USUARIO WHERE id_usuario = ?', [id_usuario]);
        }

        if (id_persona) {
            await safeDelete('DELETE FROM PERSONA WHERE id_persona = ?', [id_persona]);
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.commit();

        return res.redirect('/admin/students?deleted=true');

    } catch (error) {
        if (connection) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            await connection.rollback();
        }
        console.error('Error al eliminar estudiante:', error);
        return res.redirect('/admin/students');
    } finally {
        if (connection) connection.release();
    }
};

// ==========================================
// 3. GESTIÓN DE APODERADOS
// ==========================================
exports.showApoderadosList = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser || Number(sessionUser.id_rol) !== 1) {
            return res.redirect('/');
        }

        const [apoderados] = await pool.query(`
            SELECT 
                u.id_usuario,
                p.id_persona,
                ap.id_apoderado,
                p.rut,
                p.nombre,
                p.apellido,
                p.genero,
                u.correo,
                ap.telefono
            FROM APODERADO ap
            INNER JOIN PERSONA p ON p.id_persona = ap.id_persona
            LEFT JOIN USUARIO u ON u.id_persona = p.id_persona
            ORDER BY p.apellido ASC, p.nombre ASC;
        `);

        res.render('admin/apoderadoA', {
            title: 'Gestión de Apoderados - Educare',
            user: sessionUser,
            apoderados: apoderados,
            error: null
        });
    } catch (error) {
        console.error('Error al cargar lista de apoderados:', error);
        res.render('admin/apoderadoA', {
            title: 'Gestión de Apoderados',
            user: req.session.user || req.session.usuario,
            apoderados: [],
            error: 'Ocurrió un error al obtener la lista de apoderados.'
        });
    }
};

exports.getEditarApoderado = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        const { id } = req.params;

        const [rows] = await pool.query(`
            SELECT 
                u.id_usuario,
                p.id_persona,
                ap.id_apoderado,
                p.rut,
                p.nombre,
                p.apellido,
                DATE_FORMAT(p.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
                p.genero,
                u.correo,
                ap.telefono
            FROM USUARIO u
            INNER JOIN PERSONA p ON p.id_persona = u.id_persona
            INNER JOIN APODERADO ap ON ap.id_persona = p.id_persona
            WHERE u.id_usuario = ? OR ap.id_apoderado = ?;
        `, [id, id]);

        if (rows.length === 0) {
            return res.redirect('/admin/apoderadoA');
        }

        res.render('admin/apoderado-edit', {
            title: 'Editar Apoderado - Educare',
            user: sessionUser,
            apoderado: rows[0],
            error: null
        });
    } catch (error) {
        console.error('Error al obtener datos del apoderado:', error);
        res.redirect('/admin/apoderadoA');
    }
};

exports.postEditarApoderado = async (req, res) => {
    const sessionUser = req.session.user || req.session.usuario;
    const { id } = req.params;
    const { id_persona, id_apoderado, rut, nombre, apellido, fecha_nacimiento, genero, correo, telefono } = req.body;

    const errorFecha = validarNacimiento(fecha_nacimiento, 'adulto');
    if (errorFecha) {
        return res.redirect(`/admin/apoderadoA?error=${encodeURIComponent(errorFecha)}`);
    }

    try {
        await pool.query(`
            UPDATE PERSONA 
            SET rut = ?, nombre = ?, apellido = ?, fecha_nacimiento = ?, genero = ?
            WHERE id_persona = ?;
        `, [rut, nombre, apellido, fecha_nacimiento || null, genero, id_persona]);

        await pool.query(`
            UPDATE USUARIO 
            SET correo = ?
            WHERE id_usuario = ?;
        `, [correo, id]);

        await pool.query(`
            UPDATE APODERADO 
            SET telefono = ?
            WHERE id_apoderado = ?;
        `, [telefono, id_apoderado]);

        return res.redirect('/admin/apoderadoA?updated=true');

    } catch (error) {
        console.error('Error al editar apoderado:', error);
        res.render('admin/apoderado-edit', {
            title: 'Editar Apoderado - Educare',
            user: sessionUser,
            apoderado: { id_usuario: id, ...req.body },
            error: 'Ocurrió un error al guardar los cambios del apoderado.'
        });
    }
};

exports.postEliminarApoderado = async (req, res) => {
    const { id } = req.params;
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        let id_persona = null;
        let id_usuario = null;
        let id_apoderado = null;

        const [usrRows] = await connection.query('SELECT id_usuario, id_persona FROM USUARIO WHERE id_usuario = ?', [id]);
        if (usrRows.length > 0) {
            id_usuario = usrRows[0].id_usuario;
            id_persona = usrRows[0].id_persona;
        }

        const [apoRows] = await connection.query('SELECT id_apoderado, id_persona FROM APODERADO WHERE id_apoderado = ? OR id_persona = ?', [id, id_persona]);
        if (apoRows.length > 0) {
            id_apoderado = apoRows[0].id_apoderado;
            if (!id_persona) id_persona = apoRows[0].id_persona;
        }

        const safeDelete = async (sql, params) => {
            try { await connection.query(sql, params); } catch (e) {}
        };

        if (id_apoderado) {
            await safeDelete('DELETE FROM ESTUDIANTE_APODERADO WHERE id_apoderado = ?', [id_apoderado]);
            await safeDelete('DELETE FROM APODERADO_ESTUDIANTE WHERE id_apoderado = ?', [id_apoderado]);
            await safeDelete('DELETE FROM APODERADO WHERE id_apoderado = ?', [id_apoderado]);
        }

        if (id_usuario) {
            await safeDelete('DELETE FROM USUARIO_ROL WHERE id_usuario = ?', [id_usuario]);
            await safeDelete('DELETE FROM AVISO_DESTINATARIO WHERE id_usuario = ?', [id_usuario]);
            await safeDelete('DELETE FROM AVISO WHERE id_usuario = ?', [id_usuario]);
            await safeDelete('DELETE FROM AUDITORIA WHERE id_usuario = ?', [id_usuario]);
            await safeDelete('DELETE FROM USUARIO WHERE id_usuario = ?', [id_usuario]);
        }

        if (id_persona) {
            await safeDelete('DELETE FROM PERSONA WHERE id_persona = ?', [id_persona]);
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.commit();

        return res.redirect('/admin/apoderadoA?deleted=true');

    } catch (error) {
        if (connection) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            await connection.rollback();
        }
        console.error('Error al eliminar apoderado:', error);
        return res.redirect('/admin/apoderadoA');
    } finally {
        if (connection) connection.release();
    }
};

// ==========================================
// 4. GESTIÓN DE SOLICITUDES PENDIENTES
// ==========================================
exports.showSolicitudesList = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        const [rows] = await pool.query(`
            SELECT 
                u.id_usuario, 
                u.correo, 
                u.estado, 
                COALESCE(u.fecha_creacion, NOW()) AS fecha_creacion,
                p.rut, 
                p.nombre, 
                p.apellido,
                r.nombre AS rol_nombre
            FROM USUARIO u
            INNER JOIN PERSONA p ON u.id_persona = p.id_persona
            LEFT JOIN USUARIO_ROL ur ON u.id_usuario = ur.id_usuario
            LEFT JOIN ROL r ON ur.id_rol = r.id_rol
            WHERE u.estado = 'P'
            ORDER BY u.id_usuario DESC
        `);

        res.render('admin/solicitudes', {
            title: 'Solicitudes Pendientes - Educare',
            user: sessionUser,
            usuarios: rows 
        });
    } catch (error) {
        console.error('Error en showSolicitudesList:', error);
        res.status(500).send('Error interno al cargar la lista de solicitudes');
    }
};

exports.aprobarUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query(`UPDATE USUARIO SET estado = 'A' WHERE id_usuario = ?`, [id]);

        const [userRows] = await pool.query(`
            SELECT u.id_persona, r.nombre AS rol_nombre
            FROM USUARIO u
            INNER JOIN USUARIO_ROL ur ON u.id_usuario = ur.id_usuario
            INNER JOIN ROL r ON ur.id_rol = r.id_rol
            WHERE u.id_usuario = ?
        `, [id]);

        if (userRows.length > 0) {
            const { id_persona, rol_nombre } = userRows[0];
            const rolNorm = (rol_nombre || '').toLowerCase();

            if (rolNorm === 'profesor' || rolNorm === 'profesor jefe' || rolNorm === 'docente') {
                await pool.query(`INSERT IGNORE INTO PROFESOR (id_persona) VALUES (?)`, [id_persona]);
            } else if (rolNorm === 'estudiante' || rolNorm === 'alumno') {
                await pool.query(`INSERT IGNORE INTO ESTUDIANTE (id_persona) VALUES (?)`, [id_persona]);
            } else if (rolNorm === 'apoderado') {
                await pool.query(`INSERT IGNORE INTO APODERADO (id_persona) VALUES (?)`, [id_persona]);
            }
        }

        return res.redirect('/admin/solicitudes?approved=true');

    } catch (error) {
        console.error('Error al aprobar usuario:', error);
        return res.status(500).send('Error interno al aprobar el usuario');
    }
};

exports.rechazarUsuario = async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query(`UPDATE USUARIO SET estado = 'I' WHERE id_usuario = ?`, [id]);
        return res.redirect('/admin/solicitudes?rejected=true');

    } catch (error) {
        console.error('Error al rechazar usuario:', error);
        return res.status(500).send('Error interno al rechazar el usuario');
    }
};