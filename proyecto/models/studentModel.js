const pool = require('../config/db');

// Modelo de estudiantes - consultar todos los estudiantes con sus datos personales y cursos
const getAllStudents = async () => {
    try {
        const [rows] = await pool.query(
            `SELECT e.id_estudiante, e.estado,
                    p.id_persona, p.rut, p.nombre, p.apellido, p.fecha_nacimiento, p.genero,
                    c.nivel, c.seccion, c.jornada, c.sala,
                    pa.año, pa.semestre,
                    i.fecha_inscripcion
             FROM estudiante e
             INNER JOIN persona p ON p.id_persona = e.id_persona
             LEFT JOIN inscripcion i ON i.id_estudiante = e.id_estudiante
             LEFT JOIN curso_periodo cp ON cp.id_curso_periodo = i.id_curso_periodo
             LEFT JOIN curso c ON c.id_curso = cp.id_curso
             LEFT JOIN periodo_academico pa ON pa.id_periodo = cp.id_periodo
             WHERE e.estado = 'A'
             ORDER BY p.apellido, p.nombre`
        );
        return rows;
    } catch (error) {
        console.error('Error en studentModel.getAllStudents:', error);
        throw error;
    }
};

// Modelo de estudiantes - consultar un estudiante por ID con detalles completos
const getStudentById = async (id_estudiante) => {
    try {
        const [rows] = await pool.query(
            `SELECT e.id_estudiante, e.estado,
                    p.id_persona, p.rut, p.nombre, p.apellido, p.fecha_nacimiento, p.genero,
                    c.nivel, c.seccion, c.jornada, c.sala,
                    pa.año, pa.semestre,
                    i.fecha_inscripcion,
                    a.nombre as asignatura_nombre,
                    pr.especialidad as profesor_especialidad,
                    pp.nombre as profesor_nombre,
                    pp.apellido as profesor_apellido
             FROM estudiante e
             INNER JOIN persona p ON p.id_persona = e.id_persona
             LEFT JOIN inscripcion i ON i.id_estudiante = e.id_estudiante
             LEFT JOIN curso_periodo cp ON cp.id_curso_periodo = i.id_curso_periodo
             LEFT JOIN curso c ON c.id_curso = cp.id_curso
             LEFT JOIN periodo_academico pa ON pa.id_periodo = cp.id_periodo
             LEFT JOIN curso_asignatura ca ON ca.id_curso_periodo = cp.id_curso_periodo
             LEFT JOIN asignatura a ON a.id_asignatura = ca.id_asignatura
             LEFT JOIN profesor pr ON pr.id_profesor = ca.id_profesor
             LEFT JOIN persona pp ON pp.id_persona = pr.id_persona
             WHERE e.id_estudiante = ? AND e.estado = 'A'`,
            [id_estudiante]
        );
        return rows;
    } catch (error) {
        console.error('Error en studentModel.getStudentById:', error);
        throw error;
    }
};

// Modelo de estudiantes - consultar estudiantes por curso
const getStudentsByCourse = async (id_curso_periodo) => {
    try {
        const [rows] = await pool.query(
            `SELECT e.id_estudiante, e.estado,
                    p.id_persona, p.rut, p.nombre, p.apellido, p.fecha_nacimiento, p.genero,
                    c.nivel, c.seccion, c.jornada, c.sala,
                    pa.año, pa.semestre,
                    i.fecha_inscripcion
             FROM estudiante e
             INNER JOIN persona p ON p.id_persona = e.id_persona
             INNER JOIN inscripcion i ON i.id_estudiante = e.id_estudiante
             INNER JOIN curso_periodo cp ON cp.id_curso_periodo = i.id_curso_periodo
             INNER JOIN curso c ON c.id_curso = cp.id_curso
             INNER JOIN periodo_academico pa ON pa.id_periodo = cp.id_periodo
             WHERE cp.id_curso_periodo = ? AND e.estado = 'A' AND i.estado = 'A'
             ORDER BY p.apellido, p.nombre`,
            [id_curso_periodo]
        );
        return rows;
    } catch (error) {
        console.error('Error en studentModel.getStudentsByCourse:', error);
        throw error;
    }
};

module.exports = {
    getAllStudents,
    getStudentById,
    getStudentsByCourse
};
