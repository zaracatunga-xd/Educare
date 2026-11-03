module.exports = {
    // Middleware para verificar que el usuario tenga sesión activa
    isAuthenticated: (req, res, next) => {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) {
            return res.redirect('/login');
        }
        res.locals.user = sessionUser;
        next();
    },

    // Middleware exclusivo para verificar el rol Administrador (id_rol === 1)
    isAdmin: (req, res, next) => {
        const sessionUser = req.session.user || req.session.usuario;
        if (!sessionUser) {
            return res.redirect('/login');
        }

        const isAdministrator = 
            Number(sessionUser.id_rol) === 1 || 
            (sessionUser.rol_nombre && sessionUser.rol_nombre.toLowerCase() === 'administrador') ||
            (sessionUser.rol && sessionUser.rol.toLowerCase() === 'administrador');

        if (!isAdministrator) {
            return res.redirect('/login');
        }

        res.locals.user = sessionUser;
        next();
    }
};