const pool = require('../config/db');

const LIMITE_MENSAJE = 1000;
const LIMITE_HISTORIAL = 200;

const existeRelacion = async (idUsuarioA, idUsuarioB) => {
    const [filas] = await pool.query(`
        SELECT 1
        FROM PROFESOR pr
        INNER JOIN USUARIO up ON up.id_persona = pr.id_persona
        INNER JOIN CURSO_ASIGNATURA ca ON ca.id_profesor = pr.id_profesor
        INNER JOIN INSCRIPCION i ON i.id_curso_periodo = ca.id_curso_periodo AND i.estado = 'A'
        INNER JOIN APODERADO_ESTUDIANTE ae ON ae.id_estudiante = i.id_estudiante AND ae.estado = 'A'
        INNER JOIN APODERADO ap ON ap.id_apoderado = ae.id_apoderado
        INNER JOIN USUARIO ua ON ua.id_persona = ap.id_persona
        WHERE (up.id_usuario = ? AND ua.id_usuario = ?)
           OR (up.id_usuario = ? AND ua.id_usuario = ?)
        LIMIT 1
    `, [idUsuarioA, idUsuarioB, idUsuarioB, idUsuarioA]);
    return filas.length > 0;
};

const listarMensajes = async (yo, otro, desde) => {
    const [filas] = await pool.query(`
        SELECT id_mensaje, id_emisor, contenido, fecha_envio, leido
        FROM MENSAJE_CHAT
        WHERE ((id_emisor = ? AND id_receptor = ?) OR (id_emisor = ? AND id_receptor = ?))
          AND id_mensaje > ?
        ORDER BY id_mensaje DESC
        LIMIT ${LIMITE_HISTORIAL}
    `, [yo, otro, otro, yo, desde]);

    filas.reverse();

    await pool.query(
        'UPDATE MENSAJE_CHAT SET leido = 1 WHERE id_emisor = ? AND id_receptor = ? AND leido = 0',
        [otro, yo]
    );

    const [leidos] = await pool.query(
        'SELECT COALESCE(MAX(id_mensaje), 0) AS hasta FROM MENSAJE_CHAT WHERE id_emisor = ? AND id_receptor = ? AND leido = 1',
        [yo, otro]
    );

    return {
        mensajes: filas.map((m) => ({
            id: m.id_mensaje,
            mio: m.id_emisor === yo,
            contenido: m.contenido,
            fecha: m.fecha_envio
        })),
        leidos_hasta: leidos[0].hasta
    };
};

const enviarMensaje = async (yo, otro, contenido) => {
    const [resultado] = await pool.query(
        'INSERT INTO MENSAJE_CHAT (id_emisor, id_receptor, contenido) VALUES (?, ?, ?)',
        [yo, otro, contenido]
    );
    const [filas] = await pool.query(
        'SELECT id_mensaje, contenido, fecha_envio FROM MENSAJE_CHAT WHERE id_mensaje = ?',
        [resultado.insertId]
    );
    return { id: filas[0].id_mensaje, mio: true, contenido: filas[0].contenido, fecha: filas[0].fecha_envio };
};

const resumenConversaciones = async (yo) => {
    const [noLeidos] = await pool.query(
        'SELECT id_emisor, COUNT(*) AS total FROM MENSAJE_CHAT WHERE id_receptor = ? AND leido = 0 GROUP BY id_emisor',
        [yo]
    );
    const [ultimos] = await pool.query(`
        SELECT m.id_emisor, m.id_receptor, m.contenido, m.fecha_envio
        FROM MENSAJE_CHAT m
        INNER JOIN (
            SELECT MAX(id_mensaje) AS ultimo
            FROM MENSAJE_CHAT
            WHERE id_emisor = ? OR id_receptor = ?
            GROUP BY IF(id_emisor = ?, id_receptor, id_emisor)
        ) u ON u.ultimo = m.id_mensaje
    `, [yo, yo, yo]);

    const resumen = {};
    ultimos.forEach((m) => {
        const otro = m.id_emisor === yo ? m.id_receptor : m.id_emisor;
        resumen[otro] = { no_leidos: 0, ultimo: m.contenido, fecha: m.fecha_envio, mio: m.id_emisor === yo };
    });
    noLeidos.forEach((n) => {
        if (!resumen[n.id_emisor]) resumen[n.id_emisor] = { no_leidos: 0, ultimo: '', fecha: null, mio: false };
        resumen[n.id_emisor].no_leidos = n.total;
    });
    return resumen;
};

const contarNoLeidos = async (idUsuario) => {
    const [filas] = await pool.query(
        'SELECT COUNT(*) AS total FROM MENSAJE_CHAT WHERE id_receptor = ? AND leido = 0',
        [idUsuario]
    );
    return Number(filas[0].total) || 0;
};

module.exports = { contarNoLeidos, LIMITE_MENSAJE, existeRelacion, listarMensajes, enviarMensaje, resumenConversaciones };
