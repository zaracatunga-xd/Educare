const pool = require('../../config/db');

// Modelo de autenticación - consultar usuario por correo
const findUserByEmail = async (correo) => {
    try {
        const [rows] = await pool.query(
            `SELECT u.id_usuario, u.id_persona, u.correo, u.password, u.estado,
                    p.rut, p.nombre, p.apellido,
                    r.id_rol, r.nombre as rol_nombre
             FROM USUARIO u
             INNER JOIN PERSONA p ON p.id_persona = u.id_persona
             LEFT JOIN USUARIO_ROL ur ON ur.id_usuario = u.id_usuario
             LEFT JOIN ROL r ON r.id_rol = ur.id_rol
             WHERE u.correo = ?`,
            [correo]
        );
        return rows;
    } catch (error) {
        console.error('Error en authModel.findUserByEmail:', error);
        throw error;
    }
};

// Modelo de autenticación - consultar usuario por RUT
const findUserByRut = async (rut) => {
    try {
        const [rows] = await pool.query(
            `SELECT u.id_usuario, u.id_persona, u.correo, u.password, u.estado,
                    p.rut, p.nombre, p.apellido,
                    r.id_rol, r.nombre as rol_nombre
             FROM USUARIO u
             INNER JOIN PERSONA p ON p.id_persona = u.id_persona
             LEFT JOIN USUARIO_ROL ur ON ur.id_usuario = u.id_usuario
             LEFT JOIN ROL r ON r.id_rol = ur.id_rol
             WHERE p.rut = ?`,
            [rut]
        );
        return rows;
    } catch (error) {
        console.error('Error en authModel.findUserByRut:', error);
        throw error;
    }
};

// Modelo de autenticación - buscar persona por RUT
const findPersonaByRut = async (rut) => {
    try {
        const [rows] = await pool.query(
            `SELECT id_persona, rut, nombre, apellido FROM PERSONA WHERE rut = ?`,
            [rut]
        );
        return rows;
    } catch (error) {
        console.error('Error en authModel.findPersonaByRut:', error);
        throw error;
    }
};

// Modelo de autenticación - verificar si un correo ya está registrado
const findUserByCorreo = async (correo) => {
    try {
        const [rows] = await pool.query(
            `SELECT id_usuario, correo FROM USUARIO WHERE correo = ?`,
            [correo]
        );
        return rows;
    } catch (error) {
        console.error('Error en authModel.findUserByCorreo:', error);
        throw error;
    }
};

// Modelo de autenticación - listar roles disponibles
const getRoles = async () => {
    try {
        const [rows] = await pool.query(
            `SELECT id_rol, nombre, descripcion FROM ROL WHERE id_rol NOT IN (3) AND nombre <> 'Profesor Jefe' ORDER BY id_rol`
        );
        return rows;
    } catch (error) {
        console.error('Error en authModel.getRoles:', error);
        throw error;
    }
};

// Modelo de autenticación - registrar persona + usuario + usuario_rol + profesor (transacción)
const createUsuario = async ({ rut, nombre, apellido, fecha_nacimiento, genero, correo, passwordHash, password, id_rol, id_asignatura }) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const hashFinal = passwordHash || password;

        // 1. Insertar en PERSONA
        const [personaResult] = await conn.query(
            `INSERT INTO PERSONA (rut, nombre, apellido, fecha_nacimiento, genero) VALUES (?, ?, ?, ?, ?)`,
            [rut, nombre, apellido, fecha_nacimiento || null, genero || null]
        );
        const id_persona = personaResult.insertId;

        // 2. Insertar en USUARIO con estado 'P' (Pendiente de aprobación)
        const [usuarioResult] = await conn.query(
            `INSERT INTO USUARIO (id_persona, correo, password, estado) VALUES (?, ?, ?, 'P')`,
            [id_persona, correo, hashFinal]
        );
        const id_usuario = usuarioResult.insertId;

        // 3. Asignar Rol en USUARIO_ROL
        await conn.query(
            `INSERT INTO USUARIO_ROL (id_usuario, id_rol) VALUES (?, ?)`,
            [id_usuario, id_rol]
        );

        // 4. Guardar especialidad en PROFESOR convirtiendo el ID al NOMBRE TEXTUAL del ramo
        if (id_asignatura) {
            await conn.query(
                `INSERT INTO PROFESOR (id_persona, id_asignatura, especialidad)
                 SELECT ?, a.id_asignatura, a.nombre FROM ASIGNATURA a WHERE a.id_asignatura = ?`,
                [id_persona, id_asignatura]
            );
        }

        await conn.commit();
        return id_usuario;
    } catch (error) {
        await conn.rollback();
        console.error('Error en authModel.createUsuario:', error);
        throw error;
    } finally {
        conn.release();
    }
};

// Modelo de autenticación - listar profesores
const getProfesores = async () => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                u.id_usuario, 
                u.correo, 
                per.id_persona, 
                per.rut, 
                per.nombre, 
                per.apellido, 
                prof.id_profesor, 
                COALESCE(a.nombre, prof.especialidad, 'Sin registrar') AS especialidad, 
                prof.telefono
            FROM PROFESOR prof
            INNER JOIN PERSONA per ON prof.id_persona = per.id_persona
            INNER JOIN USUARIO u ON per.id_persona = u.id_persona
            LEFT JOIN ASIGNATURA a 
                   ON CAST(a.id_asignatura AS CHAR) = CAST(prof.especialidad AS CHAR) 
                   OR a.nombre = prof.especialidad
        `);
        return rows;
    } catch (error) {
        console.error('Error en authModel.getProfesores:', error);
        throw error;
    }
};

module.exports = {
    findUserByEmail,
    findUserByRut,
    findPersonaByRut,
    findUserByCorreo,
    getRoles,
    createUsuario,
    getProfesores
};