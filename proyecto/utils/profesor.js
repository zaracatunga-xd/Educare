const sesionUsuario = (req) => req.session.user || req.session.usuario || null;

const soloProfesor = (req, res, next) => {
    const usuario = sesionUsuario(req);
    if (!usuario) return res.redirect('/login');
    const rol = String(usuario.rol || '').toLowerCase();
    const esProfesor = Number(usuario.id_rol) === 2 || rol === 'profesor' || rol === 'profesor jefe';
    if (!esProfesor) return res.redirect('/');
    next();
};

const aIso = (valor) => {
    if (!valor) return '';
    if (typeof valor === 'string') return valor.slice(0, 10);
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const lista = (valor) => {
    if (Array.isArray(valor)) return valor;
    if (valor === undefined || valor === null || valor === '') return [];
    return [valor];
};

const texto = (valor) => (typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null);

const asignacionesProfesor = async (conn, idPersona) => {
    const [filas] = await conn.query(`
        SELECT
            ca.id_curso_asig,
            ca.id_curso_periodo,
            c.id_curso,
            a.id_asignatura,
            a.nombre AS asignatura,
            TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) AS nombre_curso,
            pa.\`año\` AS anio,
            pa.semestre
        FROM PROFESOR pr
        INNER JOIN CURSO_ASIGNATURA ca ON ca.id_profesor = pr.id_profesor
        INNER JOIN CURSO_PERIODO cp ON cp.id_curso_periodo = ca.id_curso_periodo
        INNER JOIN CURSO c ON c.id_curso = cp.id_curso
        INNER JOIN ASIGNATURA a ON a.id_asignatura = ca.id_asignatura
        INNER JOIN PERIODO_ACADEMICO pa ON pa.id_periodo = cp.id_periodo
        WHERE pr.id_persona = ?
        ORDER BY pa.\`año\` DESC, pa.semestre DESC, c.nivel ASC, c.seccion ASC, a.nombre ASC
    `, [idPersona]);

    const periodos = new Set(filas.map((f) => `${f.anio}-${f.semestre}`));
    const variosPeriodos = periodos.size > 1;
    return filas.map((f) => ({
        ...f,
        etiqueta: `${f.nombre_curso} · ${f.asignatura}${variosPeriodos ? ` (${f.anio}-${f.semestre})` : ''}`
    }));
};

const asignacionDelProfesor = async (conn, idCursoAsig, idPersona) => {
    const [filas] = await conn.query(`
        SELECT ca.id_curso_asig, ca.id_curso_periodo, cp.id_periodo
        FROM CURSO_ASIGNATURA ca
        INNER JOIN PROFESOR pr ON pr.id_profesor = ca.id_profesor
        INNER JOIN CURSO_PERIODO cp ON cp.id_curso_periodo = ca.id_curso_periodo
        WHERE ca.id_curso_asig = ? AND pr.id_persona = ?
        LIMIT 1
    `, [idCursoAsig, idPersona]);
    return filas[0] || null;
};

const estudiantesInscritos = async (conn, idCursoPeriodo) => {
    const [filas] = await conn.query(`
        SELECT e.id_estudiante, i.id_inscripcion, p.nombre, p.apellido, p.rut
        FROM INSCRIPCION i
        INNER JOIN ESTUDIANTE e ON e.id_estudiante = i.id_estudiante
        INNER JOIN PERSONA p ON p.id_persona = e.id_persona
        WHERE i.id_curso_periodo = ? AND i.estado = 'A'
        ORDER BY p.apellido ASC, p.nombre ASC
    `, [idCursoPeriodo]);
    return filas;
};

const estudianteDelProfesor = async (conn, idEstudiante, idPersona) => {
    const [filas] = await conn.query(`
        SELECT
            e.id_estudiante,
            i.id_inscripcion,
            i.id_curso_periodo,
            i.id_periodo,
            p.nombre,
            p.apellido,
            p.rut,
            p.fecha_nacimiento,
            TRIM(CONCAT(COALESCE(c.nivel, ''), ' ', COALESCE(c.seccion, ''))) AS nombre_curso
        FROM PROFESOR pr
        INNER JOIN CURSO_ASIGNATURA ca ON ca.id_profesor = pr.id_profesor
        INNER JOIN INSCRIPCION i ON i.id_curso_periodo = ca.id_curso_periodo AND i.estado = 'A'
        INNER JOIN ESTUDIANTE e ON e.id_estudiante = i.id_estudiante
        INNER JOIN PERSONA p ON p.id_persona = e.id_persona
        INNER JOIN CURSO_PERIODO cp ON cp.id_curso_periodo = i.id_curso_periodo
        INNER JOIN CURSO c ON c.id_curso = cp.id_curso
        WHERE pr.id_persona = ? AND e.id_estudiante = ?
        ORDER BY i.id_inscripcion DESC
        LIMIT 1
    `, [idPersona, idEstudiante]);
    return filas[0] || null;
};

module.exports = {
    sesionUsuario,
    soloProfesor,
    aIso,
    lista,
    texto,
    asignacionesProfesor,
    asignacionDelProfesor,
    estudiantesInscritos,
    estudianteDelProfesor
};
