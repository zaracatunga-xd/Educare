const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../../config/db'); // Conexión al pool de MySQL
const { validarNacimiento } = require('../../utils/fechas');
const {
    findUserByEmail,
    findUserByRut,
    findPersonaByRut,
    findUserByCorreo,
    getRoles,
    createUsuario
} = require('../models/authModel');
const limiteIntentos = require('../../utils/limiteIntentos');

const limiteLogin = limiteIntentos.crear({ maximo: 5, ventanaMs: 15 * 60 * 1000, bloqueoMs: 15 * 60 * 1000 });
const limiteRegistro = limiteIntentos.crear({ maximo: 10, ventanaMs: 60 * 60 * 1000, bloqueoMs: 60 * 60 * 1000 });

// Genera un hash seguro de la contraseña usando scrypt (módulo nativo de Node.js)
const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
};

// Verifica una contraseña ingresada (soporta tanto Bcrypt como Scrypt)
const verifyPassword = async (password, storedHash) => {
    if (!storedHash || typeof storedHash !== 'string') return false;

    // 1. Si la contraseña fue encriptada con Bcrypt
    if (storedHash.startsWith('$2')) {
        return await bcrypt.compare(password, storedHash);
    }

    // 2. Si la contraseña fue encriptada con Scrypt
    if (storedHash.includes(':')) {
        const [salt, key] = storedHash.split(':');
        const derivedKey = crypto.scryptSync(password, salt, 64);
        const storedKey = Buffer.from(key, 'hex');
        if (storedKey.length !== derivedKey.length) {
            return false;
        }
        return crypto.timingSafeEqual(storedKey, derivedKey);
    }

    return false;
};

// Controlador de autenticación - mostrar formulario de login
exports.showLoginForm = (req, res) => {
    res.render('login', {
        title: 'Login - Educare',
        error: null
    });
};

// Controlador de autenticación - procesar login
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        const clave = `${req.ip}|${String(username || '').toLowerCase().trim()}`;
        const minutos = limiteLogin.bloqueado(clave);
        if (minutos) {
            return res.render('login', { title: 'Login - Educare', error: `Demasiados intentos fallidos. Intente nuevamente en ${minutos} minuto(s).` });
        }

        // 1. Validaciones básicas de entrada
        if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
            return res.render('login', { title: 'Login - Educare', error: 'Debe ingresar usuario y contraseña' });
        }

        if (username.length < 3 || username.length > 100) {
            return res.render('login', { title: 'Login - Educare', error: 'El usuario debe tener entre 3 y 100 caracteres' });
        }

        if (password.length < 4) {
            return res.render('login', { title: 'Login - Educare', error: 'La contraseña debe tener al menos 4 caracteres' });
        }

        // 2. Búsqueda en la Base de Datos
        let users;
        const esCorreo = username.includes('@');

        if (esCorreo) {
            users = await findUserByEmail(username);
        } else {
            users = await findUserByRut(username);
        }


        if (!users || users.length === 0) {
            limiteLogin.fallo(clave);
            return res.render('login', {
                title: 'Login - Educare',
                error: 'Usuario o contraseña incorrectos.'
            });
        }

        const user = users[0];

        // 3. Verificación de Contraseña
        const esPasswordValida = await verifyPassword(password, user.password);

        if (!esPasswordValida) {
            limiteLogin.fallo(clave);
            return res.render('login', {
                title: 'Login - Educare',
                error: 'Usuario o contraseña incorrectos.'
            });
        }

        // 4. Verificación de Estado ('P' = Pendiente, 'I' = Inactivo, 'A' = Aprobado)
        const estadoNormalizado = String(user.estado || '').toUpperCase().trim();

        if (estadoNormalizado === 'P') {
            return res.render('login', {
                title: 'Login - Educare',
                error: 'Su cuenta está pendiente de aprobación por el administrador.'
            });
        }

        if (estadoNormalizado === 'I') {
            return res.render('login', {
                title: 'Login - Educare',
                error: 'Su cuenta se encuentra inactiva. Contacte al administrador.'
            });
        }

        if (estadoNormalizado !== 'A' && estadoNormalizado !== 'APROBADO') {
            return res.render('login', {
                title: 'Login - Educare',
                error: 'Su cuenta no está autorizada para ingresar.'
            });
        }

        // 5. Creación de Sesión y Redirección
        const datosSesion = {
            id_usuario: user.id_usuario,
            id_persona: user.id_persona,
            correo: user.correo,
            rut: user.rut,
            nombre: user.nombre,
            apellido: user.apellido,
            rol: user.rol_nombre,
            id_rol: user.id_rol
        };


        limiteLogin.exito(clave);

        return req.session.regenerate((errSesion) => {
          if (errSesion) {
            console.error('Error al crear sesión:', errSesion.message);
            return res.render('login', { title: 'Login - Educare', error: 'Error interno al guardar la sesión.' });
          }
          req.session.user = datosSesion;
          req.session.save((err) => {
            if (err) {
                console.error('Error al guardar sesión:', err.message);
                return res.render('login', { title: 'Login - Educare', error: 'Error interno al guardar la sesión.' });
            }

            const idRol = Number(user.id_rol);
            const rolNombre = (user.rol_nombre || '').toUpperCase().trim();

            if (rolNombre === 'PROFESOR JEFE') {
                return res.redirect('/jefe');
            } else if (rolNombre === 'PROFESOR' || rolNombre === 'DOCENTE') {
                return res.redirect('/profesor');
            } else if (rolNombre === 'APODERADO') {
                return res.redirect('/apoderado');
            } else if (rolNombre === 'ADMINISTRADOR' || rolNombre === 'ADMIN') {
                return res.redirect('/admin');
            } else if (rolNombre === 'ESTUDIANTE') {
                return res.redirect('/');
            }

            if (idRol === 2) {
                return res.redirect('/profesor');
            } else if (idRol === 1) {
                return res.redirect('/admin');
            } else {
                return res.redirect('/apoderado');
            }
          });
        });

    } catch (error) {
        console.error('Error en login:', error.message);
        return res.render('login', {
            title: 'Login - Educare',
            error: 'Ocurrió un error inesperado al procesar la solicitud.'
        });
    }
};

// Controlador de autenticación - mostrar formulario de registro
exports.showRegisterForm = async (req, res) => {
    try {
        const roles = await getRoles();
        let asignaturas = [];
        try {
            const [rows] = await pool.query("SELECT id_asignatura, nombre FROM ASIGNATURA ORDER BY nombre ASC");
            asignaturas = rows;
        } catch (dbErr) {
            console.error("❌ Error al obtener asignaturas:", dbErr.message);
        }

        res.render('register', {
            title: 'Registro - Educare',
            error: null,
            success: null,
            roles: roles || [],
            asignaturas: asignaturas || [],
            values: {}
        });
    } catch (error) {
        console.error('Error en authController.showRegisterForm:', error);
        res.render('register', {
            title: 'Registro - Educare',
            error: 'Error al cargar el formulario. Intente nuevamente.',
            success: null,
            roles: [],
            asignaturas: [],
            values: {}
        });
    }
};

// Controlador de autenticación - procesar registro
exports.register = async (req, res) => {
    const renderError = async (message, values = {}) => {
        let roles = [];
        let asignaturas = [];
        try { 
            roles = await getRoles(); 
            const [rows] = await pool.query("SELECT id_asignatura, nombre FROM ASIGNATURA ORDER BY nombre ASC");
            asignaturas = rows;
        } catch (e) { /* ignorar */ }

        return res.render('register', {
            title: 'Registro - Educare',
            error: message,
            success: null,
            roles: roles || [],
            asignaturas: asignaturas || [],
            values
        });
    };

    const claveRegistro = String(req.ip);
    if (limiteRegistro.bloqueado(claveRegistro)) {
        return await renderError('Demasiados registros desde esta conexión. Intente más tarde.', {});
    }
    limiteRegistro.fallo(claveRegistro);

    try {
        const { rut, nombre, apellido, fecha_nacimiento, genero, correo, id_rol, id_asignatura, password, confirm_password } = req.body;
        const values = { rut, nombre, apellido, fecha_nacimiento, genero, correo, id_rol, id_asignatura };

        if (!rut || !nombre || !apellido || !correo || !id_rol || !password || !confirm_password) {
            return await renderError('Todos los campos marcados como obligatorios deben completarse', values);
        }

        if (rut.length > 12 || nombre.length > 50 || apellido.length > 50 || correo.length > 100) {
            return await renderError('Uno o más campos exceden la longitud permitida', values);
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
            return await renderError('El correo ingresado no tiene un formato válido', values);
        }

        const errorFecha = validarNacimiento(fecha_nacimiento, 'adulto');
        if (errorFecha) {
            return await renderError(errorFecha, values);
        }

        if (password.length < 6 || password.length > 16) {
            return await renderError('La contraseña debe tener entre 6 y 16 caracteres', values);
        }

        if (password !== confirm_password) {
            return await renderError('La contraseña y la confirmación no coinciden', values);
        }

        const personaExistente = await findPersonaByRut(rut);
        if (personaExistente && personaExistente.length > 0) {
            return await renderError('Ya existe una persona registrada con ese RUT', values);
        }

        const correoExistente = await findUserByCorreo(correo);
        if (correoExistente && correoExistente.length > 0) {
            return await renderError('Ya existe un usuario registrado con ese correo', values);
        }

        const passwordHash = hashPassword(password);

        await createUsuario({ rut, nombre, apellido, fecha_nacimiento, genero, correo, passwordHash, id_rol, id_asignatura });

        const roles = await getRoles();
        let asignaturas = [];
        try {
            const [rows] = await pool.query("SELECT id_asignatura, nombre FROM ASIGNATURA ORDER BY nombre ASC");
            asignaturas = rows;
        } catch (e) { /* ignorar */ }

        return res.render('register', {
            title: 'Registro - Educare',
            error: null,
            success: 'Registro completado con éxito. Su cuenta está pendiente de aprobación por el administrador.',
            roles: roles || [],
            asignaturas: asignaturas || [],
            values: {}
        });
    } catch (error) {
        console.error('Error en authController.register:', error);
        return await renderError('Error al registrar el usuario. Intente nuevamente.', req.body || {});
    }
};

// Controlador de autenticación - logout
exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
        }
        res.redirect('/login');
    });
};