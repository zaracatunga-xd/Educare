const sesionUsuario = (req) => (req.session && (req.session.user || req.session.usuario)) || null;

const normalizar = (usuario) => {
    const rol = String((usuario && usuario.rol) || '').toLowerCase().trim();
    if (rol === 'admin') return 'administrador';
    if (rol === 'docente') return 'profesor';
    return rol;
};

const inicioPorRol = (usuario) => {
    switch (normalizar(usuario)) {
        case 'administrador': return '/admin';
        case 'profesor jefe': return '/jefe';
        case 'profesor': return '/profesor';
        case 'apoderado': return '/apoderado';
        default: return '/login';
    }
};

const soloRoles = (...permitidos) => (req, res, next) => {
    const usuario = sesionUsuario(req);
    if (!usuario) return res.redirect('/login');
    if (!permitidos.includes(normalizar(usuario))) {
        const destino = inicioPorRol(usuario);
        return res.redirect(destino === req.baseUrl ? '/login' : destino);
    }
    next();
};

module.exports = { sesionUsuario, normalizar, inicioPorRol, soloRoles };
