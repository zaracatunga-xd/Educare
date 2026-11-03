require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const session = require('express-session');
const { cabeceras, mismoOrigen } = require('./utils/seguridad');
const { soloRoles } = require('./utils/acceso');

const app = express();
const PORT = process.env.PORT || 3000;
const esProduccion = process.env.NODE_ENV === 'production';

if (esProduccion && !process.env.SESSION_SECRET) {
    throw new Error('Falta SESSION_SECRET en las variables de entorno.');
}

if (esProduccion) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', [
    path.join(__dirname, 'views'),
    path.join(__dirname, 'auth/views'),
    path.join(__dirname, 'views/partials')
]);

app.use(cabeceras(esProduccion));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(session({
    name: 'educare.sid',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: esProduccion,
        maxAge: 8 * 60 * 60 * 1000
    }
}));

app.use(mismoOrigen);

app.use((req, res, next) => {
    res.locals.sessionUser = (req.session && req.session.user) || null;
    res.locals.currentPath = req.path;
    next();
});

app.get('/', (req, res) => {
    res.render('index', {
        title: 'Educare - Escuela Especial Diferencial'
    });
});

const apoderadoRoutes = require('./routes/apoderadoRoutes');
const postRoutes = require('./routes/postRoutes');
const authRoutes = require('./auth/routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const profesorRoutes = require('./routes/profesorRoutes');

app.use('/apoderado', soloRoles('apoderado'));
app.use('/profesor', soloRoles('profesor', 'profesor jefe'));

app.use('/api', postRoutes);
app.use('/', authRoutes);
app.use('/', adminRoutes);
app.use('/', apoderadoRoutes);
app.use('/', profesorRoutes);

app.listen(PORT, () => {
    console.log(`Servidor de Educare corriendo en http://localhost:${PORT}`);
});
