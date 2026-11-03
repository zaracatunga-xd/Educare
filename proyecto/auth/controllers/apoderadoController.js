const pool = require('../../config/db');

// ==========================================
// 1. DASHBOARD DEL APODERADO (/apoderado)
// ==========================================
exports.showDashboard = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const userId = Number(sessionUser.id_usuario);

        // 1. Consultar estudiantes asociados al apoderado
        const [pupilos] = await pool.query(`
            SELECT 
                e.id_estudiante,
                p.rut,
                p.nombre,
                p.apellido,
                DATE_FORMAT(p.fecha_nacimiento, '%d/%m/%Y') AS fecha_nacimiento,
                p.genero,
                ae.parentesco,
                ae.estado AS estado_relacion,
                CONCAT(c.nivel, ' ', c.seccion) AS nombre_curso,
                f.id_fudei,
                f.estado AS estado_fudei,
                tn.nombre AS diagnostico_nee
            FROM APODERADO ap
            INNER JOIN PERSONA p_apo ON ap.id_persona = p_apo.id_persona
            LEFT JOIN USUARIO u ON u.id_persona = p_apo.id_persona
            INNER JOIN APODERADO_ESTUDIANTE ae ON ap.id_apoderado = ae.id_apoderado
            INNER JOIN ESTUDIANTE e ON ae.id_estudiante = e.id_estudiante
            INNER JOIN PERSONA p ON e.id_persona = p.id_persona
            LEFT JOIN INSCRIPCION i ON e.id_estudiante = i.id_estudiante AND i.estado = 'A'
            LEFT JOIN CURSO_PERIODO cp ON i.id_curso_periodo = cp.id_curso_periodo
            LEFT JOIN CURSO c ON cp.id_curso = c.id_curso
            LEFT JOIN FUDEI f ON e.id_estudiante = f.id_estudiante
            LEFT JOIN TIPO_NEE tn ON f.id_tipo_nee = tn.id_tipo_nee
            WHERE u.id_usuario = ? 
              AND ae.estado IN ('PENDIENTE', 'APROBADO', 'A')
            ORDER BY e.id_estudiante DESC
        `, [userId]);

        // 2. Consultar cursos disponibles
        const [cursos] = await pool.query(`
            SELECT 
                c.id_curso,
                c.nivel,
                c.seccion,
                c.jornada,
                COUNT(i.id_inscripcion) AS inscritos
            FROM CURSO c
            LEFT JOIN CURSO_PERIODO cp ON cp.id_curso = c.id_curso
            LEFT JOIN INSCRIPCION i ON i.id_curso_periodo = cp.id_curso_periodo AND i.estado = 'A'
            WHERE c.estado = 'A'
            GROUP BY c.id_curso, c.nivel, c.seccion, c.jornada
            ORDER BY c.nivel ASC, c.seccion ASC
        `);

        res.render('apoderado/apoderado', {
            title: 'Panel Apoderado - Educare',
            user: sessionUser,
            pupilos: pupilos || [],
            cursos: cursos || [],
            created: req.query.created === 'true'
        });

    } catch (error) {
        console.error('❌ Error al cargar dashboard del apoderado:', error);
        res.render('apoderado/apoderado', {
            title: 'Panel Apoderado - Educare',
            user: req.session.user || req.session.usuario,
            pupilos: [],
            cursos: [],
            created: false,
            error: error.message
        });
    }
};

// ==========================================
// 2. FORMULARIO AGREGAR PUPILO (/apoderado/agregar-pupilo)
// ==========================================
exports.showAgregarPupiloForm = async (req, res) => {
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        // Consultar los cursos activos para desplegarlos en el select
        const [cursos] = await pool.query(`
            SELECT 
                c.id_curso,
                c.nivel,
                c.seccion,
                c.jornada,
                COUNT(i.id_inscripcion) AS inscritos
            FROM CURSO c
            LEFT JOIN CURSO_PERIODO cp ON cp.id_curso = c.id_curso
            LEFT JOIN INSCRIPCION i ON i.id_curso_periodo = cp.id_curso_periodo AND i.estado = 'A'
            WHERE c.estado = 'A'
            GROUP BY c.id_curso, c.nivel, c.seccion, c.jornada
            ORDER BY c.nivel ASC, c.seccion ASC
        `);

        res.render('apoderado/agregar-pupilo', {
            title: 'Ingreso de Nuevo Pupilo - Educare',
            user: sessionUser,
            cursos: cursos || [],
            error: null
        });

    } catch (error) {
        console.error('❌ Error al cargar formulario de agregar pupilo:', error);
        res.render('apoderado/agregar-pupilo', {
            title: 'Ingreso de Nuevo Pupilo - Educare',
            user: req.session.user || req.session.usuario,
            cursos: [],
            error: error.message
        });
    }
};

// ==========================================
// 3. PROCESAR Y GUARDAR NUEVO PUPILO (POST /apoderado/agregar-pupilo)
// ==========================================
exports.agregarPupilo = async (req, res) => {
    let connection;
    try {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) return res.redirect('/login');

        const userId = Number(sessionUser.id_usuario);

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Buscar el id_apoderado correspondiente al usuario logueado
        const [apoRows] = await connection.query(`
            SELECT ap.id_apoderado 
            FROM APODERADO ap
            INNER JOIN PERSONA p ON ap.id_persona = p.id_persona
            LEFT JOIN USUARIO u ON u.id_persona = p.id_persona
            WHERE u.id_usuario = ?
        `, [userId]);

        if (apoRows.length === 0) {
            throw new Error('No se encontró el registro de apoderado activo para el usuario actual.');
        }
        const id_apoderado = apoRows[0].id_apoderado;

        // Extraer variables enviadas desde el formulario
        const {
            rut, nombre, apellido, fecha_nacimiento, genero, parentesco, id_curso,
            id_tipo_nee, anamnesis, observaciones
        } = req.body;

        // 2. Insertar registros en la tabla PERSONA
        const [resPersona] = await connection.query(`
            INSERT INTO PERSONA (rut, nombre, apellido, fecha_nacimiento, genero)
            VALUES (?, ?, ?, ?, ?)
        `, [rut, nombre, apellido, fecha_nacimiento || null, genero || 'M']);
        const id_persona_estudiante = resPersona.insertId;

        // 3. Insertar registros en la tabla ESTUDIANTE
        const [resEstudiante] = await connection.query(`
            INSERT INTO ESTUDIANTE (id_persona, estado)
            VALUES (?, 'A')
        `, [id_persona_estudiante]);
        const id_estudiante = resEstudiante.insertId;

        // 4. Vincular APODERADO con ESTUDIANTE
        await connection.query(`
            INSERT INTO APODERADO_ESTUDIANTE (id_apoderado, id_estudiante, parentesco, estado)
            VALUES (?, ?, ?, 'PENDIENTE')
        `, [id_apoderado, id_estudiante, parentesco || 'Apoderado']);

        // 5. Inscribir estudiante en la tabla INSCRIPCION si seleccionó un curso
        if (id_curso && id_curso !== '') {
            const [cpRows] = await connection.query(`
                SELECT id_curso_periodo FROM CURSO_PERIODO WHERE id_curso = ? LIMIT 1
            `, [id_curso]);

            if (cpRows.length > 0) {
                await connection.query(`
                    INSERT INTO INSCRIPCION (id_estudiante, id_curso_periodo, fecha_inscripcion, estado)
                    VALUES (?, ?, NOW(), 'P')
                `, [id_estudiante, cpRows[0].id_curso_periodo]);
            }
        }

        // 6. VALIDACIÓN Y SANITIZACIÓN DE id_tipo_nee (Evita el fallo de Foreign Key)
        const id_tipo_nee_validado = (id_tipo_nee && id_tipo_nee !== '' && id_tipo_nee !== '0') 
            ? parseInt(id_tipo_nee, 10) 
            : null;

        // 7. Crear Ficha FUDEI
        await connection.query(`
            INSERT INTO FUDEI (id_estudiante, id_tipo_nee, anamnesis, observaciones, estado, fecha_creacion)
            VALUES (?, ?, ?, ?, 'EN_PROCESO', NOW())
        `, [id_estudiante, id_tipo_nee_validado, anamnesis || null, observaciones || null]);

        // Confirmar transacción
        await connection.commit();
        return res.redirect('/apoderado?created=true');

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ Error al guardar pupilo:', error.message);

        // Volver a cargar los cursos en caso de error para re-renderizar la vista
        const [cursos] = await pool.query(`
            SELECT c.id_curso, c.nivel, c.seccion, c.jornada 
            FROM CURSO c WHERE c.estado = 'A'
        `);

        return res.render('apoderado/agregar-pupilo', {
            title: 'Ingreso de Nuevo Pupilo - Educare',
            user: req.session.user || req.session.usuario,
            cursos: cursos || [],
            error: 'Atención: ' + error.message
        });
    } finally {
        if (connection) connection.release();
    }
};