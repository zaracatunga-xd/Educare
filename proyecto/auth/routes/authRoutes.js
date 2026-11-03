const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Importación del pool de conexiones (ajustado a la raíz config/db)
const pool = require('../../config/db');

// ==========================================
// 1. RUTAS DE INICIO DE SESIÓN (LOGIN)
// ==========================================

router.get('/login', authController.showLoginForm);
router.post('/login', authController.login);

// ==========================================
// 2. RUTAS DE REGISTRO DE USUARIO
// ==========================================

// GET: Cargar formulario INCLUYENDO Administrador (excluyendo solo Estudiantes/Alumnos)
router.get('/register', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();

        // Consulta sin filtros para traer absolutamente todos los roles
        const [roles] = await connection.query(`SELECT id_rol, nombre FROM ROL ORDER BY id_rol ASC`);
        
        console.log('🔍 ROLES OBTENIDOS DE LA BD:', roles);

        const [asignaturas] = await connection.query(`SELECT id_asignatura, nombre FROM ASIGNATURA ORDER BY nombre ASC`).catch(() => [[]]);

        res.render('register', {
            title: 'Registro de Usuario - Educare',
            roles: roles || [],
            asignaturas: asignaturas || [],
            values: {},
            error: null
        });

    } catch (error) {
        console.error("❌ Error al cargar formulario de registro:", error.message);
        res.render('register', {
            title: 'Registro de Usuario - Educare',
            roles: [],
            asignaturas: [],
            values: {},
            error: 'Error al conectar con la base de datos.'
        });
    } finally {
        if (connection) connection.release();
    }
});
// POST: Procesar la creación de usuario
router.post('/register', authController.register);

// ==========================================
// 3. CIERRE DE SESIÓN
// ==========================================

router.get('/logout', authController.logout);

module.exports = router;