const cabeceras = (esProduccion) => (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.removeHeader('X-Powered-By');
    if (esProduccion) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
};

const mismoOrigen = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const host = req.get('host');
    const origen = req.get('origin');
    const sitio = req.get('sec-fetch-site');
    const referer = req.get('referer');

    let valido = true;
    if (origen) {
        try { valido = new URL(origen).host === host; } catch (e) { valido = false; }
    } else if (sitio) {
        valido = sitio === 'same-origin' || sitio === 'none';
    } else if (referer) {
        try { valido = new URL(referer).host === host; } catch (e) { valido = false; }
    }

    if (!valido) {
        if (req.accepts(['html', 'json']) === 'json' || req.is('json')) {
            return res.status(403).json({ error: 'Solicitud no permitida.' });
        }
        return res.status(403).send('Solicitud no permitida.');
    }
    next();
};

module.exports = { cabeceras, mismoOrigen };
