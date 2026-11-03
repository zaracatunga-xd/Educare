const pool = require('../../config/db');

// Vista principal del panel del profesor
exports.showDashboard = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const userId = sessionUser.id_usuario || sessionUser.id_persona || sessionUser.id;

        // 1. Obtener solicitudes de estudiantes PENDIENTES de aprobación
        const [pendientes] = await pool.query(`
            SELECT 
                e.id_estudiante,
                p.rut AS rut_estudiante,
                p.nombre AS nombre_estudiante,
                p.apellido AS apellido_estudiante,
                p_apo.nombre AS nombre_apoderado,
                p_apo.apellido AS apellido_apoderado,
                ae.parentesco
            FROM APODERADO_ESTUDIANTE ae
            INNER JOIN ESTUDIANTE e ON ae.id_estudiante = e.id_estudiante
            INNER JOIN PERSONA p ON e.id_persona = p.id_persona
            INNER JOIN APODERADO ap ON ae.id_apoderado = ap.id_apoderado
            INNER JOIN PERSONA p_apo ON ap.id_persona = p_apo.id_persona
            WHERE ae.estado = 'PENDIENTE'
            ORDER BY e.id_estudiante DESC
        `);

        // 2. Obtener lista de alumnos APROBADOS (Asegurando columnas en SELECT para evitar error DISTINCT/ORDER BY)
        const [estudiantes] = await pool.query(`
            SELECT DISTINCT 
                e.id_estudiante,
                p.rut,
                p.nombre,
                p.apellido,
                TRIM(CONCAT(COALESCE(c.nivel, 'Sin'), ' ', COALESCE(c.seccion, 'Curso'))) AS nombre_curso,
                COALESCE(tn.nombre, 'Sin Diagnóstico') AS tipo_nee,
                f.id_fudei,
                f.estado AS estado_fudei,
                c.nivel,
                c.seccion
            FROM APODERADO_ESTUDIANTE ae
            INNER JOIN ESTUDIANTE e ON ae.id_estudiante = e.id_estudiante
            INNER JOIN PERSONA p ON e.id_persona = p.id_persona
            LEFT JOIN INSCRIPCION i ON e.id_estudiante = i.id_estudiante AND i.estado IN ('A', 'APROBADO')
            LEFT JOIN CURSO_PERIODO cp ON i.id_curso_periodo = cp.id_curso_periodo
            LEFT JOIN CURSO c ON cp.id_curso = c.id_curso
            LEFT JOIN FUDEI f ON e.id_estudiante = f.id_estudiante
            LEFT JOIN TIPO_NEE tn ON f.id_tipo_nee = tn.id_tipo_nee
            WHERE ae.estado IN ('APROBADO', 'A')
            ORDER BY p.apellido ASC, p.nombre ASC
        `);

        // 3. Conteo de FUDEI Pendientes (En Proceso)
        const [fudeiCountRows] = await pool.query(`
            SELECT COUNT(*) AS total
            FROM FUDEI f
            WHERE f.estado = 'EN_PROCESO'
        `);
        const fudeiPendientes = fudeiCountRows[0]?.total || 0;

        // 4. Obtener avisos oficiales dirigidos a los profesores
        const [avisos] = await pool.query(`
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
                OR (ad.tipo_destino = 'ROL' AND r.nombre IN ('Profesor', 'Profesor Jefe'))
              )
            ORDER BY a.fecha_publicacion DESC
        `);

        // 5. Obtener apoderados activos
        const [apoderados] = await pool.query(`
            SELECT 
                ap.id_apoderado,
                p.rut,
                p.nombre,
                p.apellido,
                CONCAT(p.nombre, ' ', p.apellido) AS nombre_completo,
                COUNT(ae.id_estudiante) AS total_pupilos
            FROM APODERADO ap
            INNER JOIN PERSONA p ON ap.id_persona = p.id_persona
            LEFT JOIN APODERADO_ESTUDIANTE ae ON ap.id_apoderado = ae.id_apoderado AND ae.estado IN ('APROBADO', 'A')
            GROUP BY ap.id_apoderado, p.rut, p.nombre, p.apellido
            ORDER BY p.apellido ASC, p.nombre ASC
        `);

        let successMsg = null;
        if (req.query.msg === 'approved') successMsg = 'Solicitud de pupilo APROBADA con éxito.';
        if (req.query.msg === 'rejected') successMsg = 'Solicitud de pupilo RECHAZADA correctamente.';

        res.render('profesor/profesor', {
            title: 'Panel Docente - Educare',
            user: sessionUser,
            pendientes: pendientes || [],
            estudiantes: estudiantes || [],
            alumnos: estudiantes || [], // Se envían ambas para evitar discrepancias
            fudeiPendientes,
            avisos: avisos || [],
            apoderados: apoderados || [],
            successMsg
        });

    } catch (error) {
        console.error('❌ Error al cargar dashboard docente:', error);
        res.render('profesor/profesor', {
            title: 'Panel Docente - Educare',
            user: req.session.user || req.session.usuario,
            pendientes: [],
            estudiantes: [],
            alumnos: [],
            fudeiPendientes: 0,
            avisos: [],
            apoderados: [],
            error: error.message
        });
    }
};

// Acción para APROBAR solicitud
exports.aprobarAlumno = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`
            UPDATE APODERADO_ESTUDIANTE 
            SET estado = 'A' 
            WHERE id_estudiante = ?
        `, [id]);

        res.redirect('/profesor?msg=approved');
    } catch (error) {
        console.error('❌ Error al aprobar alumno:', error);
        res.redirect('/profesor?error=true');
    }
};

// Acción para RECHAZAR solicitud
exports.rechazarAlumno = async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query(`
            UPDATE APODERADO_ESTUDIANTE 
            SET estado = 'I' 
            WHERE id_estudiante = ?
        `, [id]);

        res.redirect('/profesor?msg=rejected');
    } catch (error) {
        console.error('❌ Error al rechazar alumno:', error);
        res.redirect('/profesor?error=true');
    }
};