const express = require('express');
const router = express.Router();
const chat = require('../utils/chat');

const requiereSesion = (req, res, next) => {
    const usuario = req.session.user || req.session.usuario;
    if (!usuario || !usuario.id_usuario) return res.status(401).json({ error: 'Sesión expirada. Vuelve a iniciar sesión.' });
    req.idUsuario = Number(usuario.id_usuario);
    next();
};

const validarContraparte = async (req, res, next) => {
    const otro = parseInt(req.params.idOtro, 10);
    if (!Number.isInteger(otro) || otro <= 0 || otro === req.idUsuario) {
        return res.status(400).json({ error: 'Destinatario no válido.' });
    }
    try {
        if (!(await chat.existeRelacion(req.idUsuario, otro))) {
            return res.status(403).json({ error: 'No tienes una conversación habilitada con este usuario.' });
        }
        req.idOtro = otro;
        next();
    } catch (error) {
        console.error('❌ Error al validar conversación:', error.message);
        res.status(500).json({ error: 'No se pudo validar la conversación.' });
    }
};

router.get('/chat/api/pendientes', requiereSesion, async (req, res) => {
    try {
        res.json({ pendientes: await chat.contarNoLeidos(req.idUsuario) });
    } catch (error) {
        console.error('❌ Error al contar mensajes pendientes:', error.message);
        res.status(500).json({ error: 'No se pudo consultar los mensajes pendientes.' });
    }
});

router.get('/chat/api/resumen', requiereSesion, async (req, res) => {
    try {
        res.json({ resumen: await chat.resumenConversaciones(req.idUsuario) });
    } catch (error) {
        console.error('❌ Error al obtener resumen del chat:', error.message);
        res.status(500).json({ error: 'No se pudo cargar el resumen.' });
    }
});

router.get('/chat/api/mensajes/:idOtro', requiereSesion, validarContraparte, async (req, res) => {
    try {
        const desde = Math.max(parseInt(req.query.desde, 10) || 0, 0);
        res.json(await chat.listarMensajes(req.idUsuario, req.idOtro, desde));
    } catch (error) {
        console.error('❌ Error al cargar mensajes:', error.message);
        res.status(500).json({ error: 'No se pudieron cargar los mensajes.' });
    }
});

router.post('/chat/api/enviar/:idOtro', requiereSesion, validarContraparte, async (req, res) => {
    const contenido = typeof req.body.contenido === 'string' ? req.body.contenido.trim() : '';
    if (!contenido) return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    if (contenido.length > chat.LIMITE_MENSAJE) {
        return res.status(400).json({ error: `El mensaje no puede superar los ${chat.LIMITE_MENSAJE} caracteres.` });
    }
    try {
        res.json({ mensaje: await chat.enviarMensaje(req.idUsuario, req.idOtro, contenido) });
    } catch (error) {
        console.error('❌ Error al enviar mensaje:', error.message);
        res.status(500).json({ error: 'No se pudo enviar el mensaje.' });
    }
});

module.exports = router;
