const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const chat = require('../utils/chat');
const boletin = require('../utils/boletin');
const { generarInformeNotas, generarInformeCurso } = require('../utils/pdf');
const jefe = require('../utils/jefe');

router.use('/jefe', jefe.soloJefe);

const nombreArchivo = (base) => base
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');

const enviarPdf = (res, nombre, pdf) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo(nombre)}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
};

const conContexto = (accion) => async (req, res) => {
    const usuario = req.session.user || req.session.usuario;
    let connection;
    try {
        connection = await pool.getConnection();
        const cursos = await jefe.cursosJefatura(connection, usuario.id_persona);
        const curso = jefe.resolverCurso(cursos, req.query.curso);
        await accion({ req, res, connection, usuario, cursos, curso });
    } catch (error) {
        console.error('❌ Error en el módulo de profesor jefe:', error.message);
        if (!res.headersSent) {
            res.status(500).render('jefe/jefe', {
                title: 'Profesor Jefe - Educare',
                user: usuario,
                vacio: true,
                cursos: [],
                curso: null,
                error: 'Ocurrió un error al cargar la información de la jefatura.',
                mensajesPendientes: 0
            });
        }
    } finally {
        if (connection) connection.release();
    }
};

const sinJefatura = (res, usuario, vista, extra = {}) => res.render(vista, {
    title: 'Profesor Jefe - Educare',
    user: usuario,
    vacio: true,
    cursos: [],
    curso: null,
    error: null,
    mensajesPendientes: 0,
    ...extra
});

router.get('/jefe', conContexto(async ({ res, connection, usuario, cursos, curso }) => {
    if (!curso) return sinJefatura(res, usuario, 'jefe/jefe');

    const estudiantes = await jefe.estudiantesCurso(connection, curso);
    const notas = await jefe.notasCurso(connection, curso, estudiantes);
    const asistencia = await jefe.asistenciaCurso(connection, curso, estudiantes);
    let mensajesPendientes = 0;
    try { mensajesPendientes = await chat.contarNoLeidos(usuario.id_usuario); } catch (e) { mensajesPendientes = 0; }

    const enRiesgo = notas.filas.filter((f) => f.general !== null && (f.general < 4 || f.reprobadas >= 2));
    const asistenciaBaja = asistencia.filas.filter((f) => f.alerta);
    const mejores = notas.filas.filter((f) => f.general !== null).sort((a, b) => b.general - a.general).slice(0, 3);
    const conNee = estudiantes.filter((e) => e.nee);

    res.render('jefe/jefe', {
        title: 'Panel Profesor Jefe - Educare',
        user: usuario,
        vacio: false,
        cursos,
        curso,
        activo: 'panel',
        estudiantes,
        notas,
        asistencia,
        enRiesgo,
        asistenciaBaja,
        mejores,
        fudei: {
            conNee: conNee.length,
            enProceso: conNee.filter((e) => e.fudei_estado === 'EN_PROCESO').length,
            finalizados: conNee.filter((e) => e.fudei_estado === 'FINALIZADO').length
        },
        umbralAsistencia: jefe.UMBRAL_ASISTENCIA,
        mensajesPendientes,
        error: null
    });
}));

router.get('/jefe/notas', conContexto(async ({ res, connection, usuario, cursos, curso }) => {
    if (!curso) return sinJefatura(res, usuario, 'jefe/notas');
    const estudiantes = await jefe.estudiantesCurso(connection, curso);
    const notas = await jefe.notasCurso(connection, curso, estudiantes);
    res.render('jefe/notas', {
        title: 'Notas del Curso - Educare',
        user: usuario,
        vacio: false,
        cursos,
        curso,
        activo: 'notas',
        notas,
        error: null
    });
}));

router.get('/jefe/asistencia', conContexto(async ({ res, connection, usuario, cursos, curso }) => {
    if (!curso) return sinJefatura(res, usuario, 'jefe/asistencia');
    const estudiantes = await jefe.estudiantesCurso(connection, curso);
    const notas = await jefe.notasCurso(connection, curso, estudiantes);
    const asistencia = await jefe.asistenciaCurso(connection, curso, estudiantes);
    const asignaturas = notas.columnas.map((c) => {
        const r = asistencia.porAsignatura.get(c.id_curso_asig) || { Presente: 0, Ausente: 0, Tardanza: 0 };
        return { ...c, ...r, porcentaje: asistencia.porcentaje(r) };
    });
    res.render('jefe/asistencia', {
        title: 'Asistencia del Curso - Educare',
        user: usuario,
        vacio: false,
        cursos,
        curso,
        activo: 'asistencia',
        asistencia,
        asignaturas,
        umbralAsistencia: jefe.UMBRAL_ASISTENCIA,
        error: null
    });
}));

router.get('/jefe/apoderados', conContexto(async ({ res, connection, usuario, cursos, curso }) => {
    if (!curso) return sinJefatura(res, usuario, 'jefe/apoderados');
    const apoderados = await jefe.apoderadosCurso(connection, curso);
    res.render('jefe/apoderados', {
        title: 'Apoderados del Curso - Educare',
        user: usuario,
        vacio: false,
        cursos,
        curso,
        activo: 'apoderados',
        apoderados,
        error: null
    });
}));

router.get('/jefe/estudiante/:id', conContexto(async ({ req, res, connection, usuario, cursos, curso }) => {
    if (!curso) return sinJefatura(res, usuario, 'jefe/estudiante');
    const estudiante = await jefe.estudianteDeJefatura(connection, curso, parseInt(req.params.id, 10));
    if (!estudiante) return res.redirect(`/jefe/notas?curso=${curso.id_curso_periodo}`);

    const listado = await jefe.estudiantesCurso(connection, curso);
    const ficha = listado.find((e) => e.id_estudiante === estudiante.id_estudiante);
    const datosBoletin = await boletin.construirBoletin(connection, estudiante.id_estudiante, curso.id_curso_periodo);
    const asistencia = await jefe.asistenciaCurso(connection, curso, [ficha]);
    const apoderados = (await jefe.apoderadosCurso(connection, curso))
        .filter((a) => a.pupilos.some((p) => p.id_estudiante === estudiante.id_estudiante));

    res.render('jefe/estudiante', {
        title: 'Ficha del Estudiante - Educare',
        user: usuario,
        vacio: false,
        cursos,
        curso,
        activo: 'notas',
        estudiante: { ...ficha, edad: jefe.calcularEdad(estudiante.fecha_nacimiento) },
        boletin: datosBoletin,
        asistencia: asistencia.filas[0],
        apoderados,
        umbralAsistencia: jefe.UMBRAL_ASISTENCIA,
        formatoNota: boletin.formatoNota,
        formatoFecha: boletin.formatoFecha,
        error: null
    });
}));

router.get('/jefe/informe/:id', conContexto(async ({ req, res, connection, usuario, curso }) => {
    if (!curso) return res.status(404).send('No tienes una jefatura asignada.');
    const estudiante = await jefe.estudianteDeJefatura(connection, curso, parseInt(req.params.id, 10));
    if (!estudiante) return res.status(404).send('Estudiante no encontrado en tu jefatura.');

    const datos = await boletin.construirBoletin(connection, estudiante.id_estudiante, curso.id_curso_periodo);
    const pdf = generarInformeNotas({
        estudiante,
        periodo: { nombre_curso: curso.nombre_curso, anio: curso.anio, semestre: curso.semestre },
        boletin: datos,
        emitidoPor: `Prof. Jefe ${usuario.nombre || ''} ${usuario.apellido || ''}`.trim(),
        fechaEmision: boletin.formatoFecha(new Date()),
        formatoNota: boletin.formatoNota,
        formatoFecha: boletin.formatoFecha
    });
    enviarPdf(res, `informe-notas-${estudiante.apellido}-${estudiante.nombre}-${curso.anio}-S${curso.semestre}.pdf`, pdf);
}));

router.get('/jefe/informe-curso', conContexto(async ({ res, connection, usuario, curso }) => {
    if (!curso) return res.status(404).send('No tienes una jefatura asignada.');
    const estudiantes = await jefe.estudiantesCurso(connection, curso);
    const notas = await jefe.notasCurso(connection, curso, estudiantes);
    const asistencia = await jefe.asistenciaCurso(connection, curso, estudiantes);
    const pdf = generarInformeCurso({
        curso,
        notas,
        asistencia,
        emitidoPor: `Prof. Jefe ${usuario.nombre || ''} ${usuario.apellido || ''}`.trim(),
        fechaEmision: boletin.formatoFecha(new Date()),
        formatoNota: boletin.formatoNota
    });
    enviarPdf(res, `informe-curso-${curso.nivel}-${curso.seccion}-${curso.anio}-S${curso.semestre}.pdf`, pdf);
}));

module.exports = router;
