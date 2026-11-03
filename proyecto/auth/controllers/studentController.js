const pool = require('../../config/db');
const { getAllStudents, getStudentById, getStudentsByCourse } = require('../../models/studentModel');

// 1. Mostrar lista de estudiantes
exports.showStudentsList = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const selectedCourse = req.query.id_curso || '';

        // Obtener estudiantes mediante modelo o consulta SQL directa de respaldo
        let students = [];
        try {
            const [rows] = await pool.query(`
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
                LEFT JOIN INSCRIPCION i ON e.id_estudiante = i.id_estudiante AND i.estado = 'A'
                LEFT JOIN CURSO_PERIODO cp ON i.id_curso_periodo = cp.id_curso_periodo
                LEFT JOIN CURSO c ON cp.id_curso = c.id_curso
                LEFT JOIN FUDEI f ON e.id_estudiante = f.id_estudiante
                LEFT JOIN TIPO_NEE tn ON f.id_tipo_nee = tn.id_tipo_nee
                ORDER BY p.apellido ASC, p.nombre ASC;
            `);
            students = rows;
        } catch (errModel) {
            console.error('Error al consultar estudiantes:', errModel);
        }

        // Obtener cursos para filtro (Corregido: concatena nivel y seccion)
        let cursos = [];
        try {
            const [cursosRows] = await pool.query(`
                SELECT 
                    cp.id_curso_periodo, 
                    TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) AS nombre_curso
                FROM CURSO_PERIODO cp
                INNER JOIN CURSO c ON cp.id_curso = c.id_curso
                ORDER BY c.nivel ASC, c.seccion ASC
            `);
            cursos = cursosRows;
        } catch (errCursos) {
            try {
                const [cRows] = await pool.query(`
                    SELECT 
                        id_curso AS id_curso_periodo, 
                        TRIM(CONCAT(COALESCE(nivel, ''), ' ', COALESCE(seccion, ''))) AS nombre_curso 
                    FROM CURSO
                `);
                cursos = cRows;
            } catch (e) {
                console.log('Aviso: No se pudieron cargar los cursos:', e.message);
            }
        }

        // Filtrar si se seleccionó curso
        if (selectedCourse && students.length > 0) {
            students = students.filter(s => 
                s.id_curso_periodo == selectedCourse || s.id_curso == selectedCourse
            );
        }

        console.log(`✅ Estudiantes cargados desde studentController: ${students.length}`);

        res.render('admin/students', {
            title: 'Gestión de Estudiantes - Educare',
            user: sessionUser,
            students: students || [],
            estudiantes: students || [],
            cursos: cursos || [],
            selectedCourse: selectedCourse,
            error: null
        });

    } catch (error) {
        console.error('Error critico en showStudentsList:', error);
        res.render('admin/students', {
            title: 'Gestión de Estudiantes - Educare',
            user: req.session.user || req.session.usuario,
            students: [],
            estudiantes: [],
            cursos: [],
            selectedCourse: '',
            error: 'Ocurrió un error al cargar la lista de estudiantes.'
        });
    }
};

// 2. Mostrar detalle de un estudiante
exports.showStudentDetail = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const { id } = req.params;

        if (!id || isNaN(id)) {
            return res.render('admin/students', {
                title: 'Estudiantes - Educare',
                user: sessionUser,
                students: [],
                error: 'ID de estudiante inválido'
            });
        }

        const studentDetails = await getStudentById(id);

        if (!studentDetails || studentDetails.length === 0) {
            return res.render('admin/students', {
                title: 'Estudiantes - Educare',
                user: sessionUser,
                students: [],
                error: 'Estudiante no encontrado'
            });
        }

        res.render('admin/student-detail', {
            title: `Detalle Estudiante - ${studentDetails[0].nombre} ${studentDetails[0].apellido}`,
            user: sessionUser,
            student: studentDetails[0],
            details: studentDetails,
            error: null
        });

    } catch (error) {
        console.error('Error en studentController.showStudentDetail:', error);
        res.render('admin/students', {
            title: 'Estudiantes - Educare',
            user: req.session.user || req.session.usuario,
            students: [],
            error: 'Error al cargar el detalle del estudiante'
        });
    }
};

// 3. Mostrar estudiantes por curso
exports.showStudentsByCourse = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const { id_curso_periodo } = req.query;

        if (!id_curso_periodo || isNaN(id_curso_periodo)) {
            const students = await getAllStudents();
            return res.render('admin/students', {
                title: 'Estudiantes - Educare',
                user: sessionUser,
                students: students,
                error: 'ID de curso inválido'
            });
        }

        const students = await getStudentsByCourse(id_curso_periodo);

        res.render('admin/students', {
            title: 'Estudiantes por Curso - Educare',
            user: sessionUser,
            students: students,
            filteredByCourse: true,
            curso_periodo_id: id_curso_periodo,
            error: null
        });

    } catch (error) {
        console.error('Error en studentController.showStudentsByCourse:', error);
        const students = await getAllStudents().catch(() => []);
        res.render('admin/students', {
            title: 'Estudiantes - Educare',
            user: req.session.user || req.session.usuario,
            students: students,
            error: 'Error al cargar estudiantes por curso'
        });
    }
};

// 4. Mostrar panel de administración con contadores
exports.showAdminHome = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        if (Number(sessionUser.id_rol) !== 1) {
            return res.redirect('/admin/students');
        }

        const [profesoresResult] = await pool.query('SELECT COUNT(*) AS total FROM PROFESOR');
        const [estudiantesResult] = await pool.query('SELECT COUNT(*) AS total FROM ESTUDIANTE');
        const [apoderadosResult] = await pool.query('SELECT COUNT(*) AS total FROM APODERADO');
        const [solicitudesResult] = await pool.query("SELECT COUNT(*) AS total FROM USUARIO WHERE estado = 'pendiente'");

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
        console.error('Error en studentController.showAdminHome:', error);
        res.status(500).send('Error interno del servidor al cargar el panel de administración.');
    }
};

// 5. Eliminar estudiante y sus dependencias
exports.postEliminarEstudiante = async (req, res) => {
    const { id } = req.params;

    if (!id || id === 'undefined' || id === 'null') {
        console.error('❌ ID de estudiante no válido.');
        return res.redirect('/admin/students');
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        let id_persona = null;
        let id_usuario = null;
        let id_estudiante = null;

        const [estRows] = await connection.query('SELECT id_estudiante, id_persona FROM ESTUDIANTE WHERE id_estudiante = ?', [id]);
        if (estRows.length > 0) {
            id_estudiante = estRows[0].id_estudiante;
            id_persona = estRows[0].id_persona;
        }

        if (!id_persona) {
            const [usrRows] = await connection.query('SELECT id_usuario, id_persona FROM USUARIO WHERE id_usuario = ?', [id]);
            if (usrRows.length > 0) {
                id_usuario = usrRows[0].id_usuario;
                id_persona = usrRows[0].id_persona;
            }
        }

        if (!id_persona) {
            const [perRows] = await connection.query('SELECT id_persona FROM PERSONA WHERE id_persona = ?', [id]);
            if (perRows.length > 0) {
                id_persona = perRows[0].id_persona;
            }
        }

        if (id_persona) {
            if (!id_estudiante) {
                const [e] = await connection.query('SELECT id_estudiante FROM ESTUDIANTE WHERE id_persona = ?', [id_persona]);
                if (e.length > 0) id_estudiante = e[0].id_estudiante;
            }
            if (!id_usuario) {
                const [u] = await connection.query('SELECT id_usuario FROM USUARIO WHERE id_persona = ?', [id_persona]);
                if (u.length > 0) id_usuario = u[0].id_usuario;
            }
        }

        const runDelete = async (sql, params) => {
            try { await connection.query(sql, params); } catch (e) {}
        };

        if (id_estudiante) {
            await runDelete('DELETE FROM ESTUDIANTE_CURSO WHERE id_estudiante = ?', [id_estudiante]);
            await runDelete('DELETE FROM CALIFICACION WHERE id_estudiante = ?', [id_estudiante]);
            await runDelete('DELETE FROM ASISTENCIA WHERE id_estudiante = ?', [id_estudiante]);
            await runDelete('DELETE FROM ANOTACION WHERE id_estudiante = ?', [id_estudiante]);
            await runDelete('DELETE FROM FUDEI WHERE id_estudiante = ?', [id_estudiante]);
            await runDelete('DELETE FROM ESTUDIANTE WHERE id_estudiante = ?', [id_estudiante]);
        }

        if (id_usuario) {
            await runDelete('DELETE FROM USUARIO_ROL WHERE id_usuario = ?', [id_usuario]);
            await runDelete('DELETE FROM AVISO_DESTINATARIO WHERE id_usuario = ?', [id_usuario]);
            await runDelete('DELETE FROM AVISO WHERE id_usuario = ?', [id_usuario]);
            await runDelete('DELETE FROM AUDITORIA WHERE id_usuario = ?', [id_usuario]);
            await runDelete('DELETE FROM USUARIO WHERE id_usuario = ?', [id_usuario]);
        }

        if (id_persona) {
            await runDelete('DELETE FROM ESTUDIANTE WHERE id_persona = ?', [id_persona]);
            await runDelete('DELETE FROM USUARIO WHERE id_persona = ?', [id_persona]);
            await runDelete('DELETE FROM PERSONA WHERE id_persona = ?', [id_persona]);
        }

        await runDelete('DELETE FROM ESTUDIANTE_CURSO WHERE id_estudiante = ?', [id]);
        await runDelete('DELETE FROM ESTUDIANTE WHERE id_estudiante = ? OR id_persona = ?', [id, id]);
        await runDelete('DELETE FROM USUARIO WHERE id_usuario = ? OR id_persona = ?', [id, id]);
        await runDelete('DELETE FROM PERSONA WHERE id_persona = ?', [id]);

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.commit();

        console.log(`✅ Estudiante ID ${id} eliminado con éxito.`);

    } catch (error) {
        if (connection) {
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            await connection.rollback();
        }
        console.error('❌ Error al eliminar estudiante:', error);
    } finally {
        if (connection) connection.release();
    }

    return res.redirect('/admin/students');
};