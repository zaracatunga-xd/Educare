(function () {
    const tema = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

    const colores = () => (tema() === 'dark'
        ? { background: '#1e293b', color: '#f8fafc' }
        : { background: '#ffffff', color: '#0f172a' });

    function envolverSwal() {
        if (!window.Swal || window.Swal.__educare) return;
        const original = window.Swal.fire.bind(window.Swal);
        window.Swal.fire = function (opciones) {
            if (opciones && typeof opciones === 'object' && tema() === 'light') {
                if (opciones.background === '#1e293b') opciones.background = '#ffffff';
                if (opciones.color === '#f8fafc') opciones.color = '#0f172a';
            }
            return original.apply(null, arguments);
        };
        window.Swal.__educare = true;
    }

    function notificar(icono, titulo, texto) {
        if (!window.Swal) return;
        const c = colores();
        window.Swal.fire({
            icon: icono,
            title: titulo,
            text: texto || '',
            confirmButtonColor: icono === 'error' ? '#dc2626' : '#0d9488',
            background: c.background,
            color: c.color
        });
    }

    function confirmar(opciones) {
        if (!window.Swal) return Promise.resolve({ isConfirmed: window.confirm(opciones.text || '¿Confirmar?') });
        const c = colores();
        return window.Swal.fire(Object.assign({
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Sí, continuar',
            cancelButtonText: 'Cancelar',
            background: c.background,
            color: c.color
        }, opciones));
    }

    function mostrarMensajes(mensajes) {
        if (!mensajes) return;
        if (mensajes.success) notificar('success', '¡Listo!', mensajes.success);
        else if (mensajes.error) notificar('error', 'No se pudo completar', mensajes.error);
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    envolverSwal();
    document.addEventListener('DOMContentLoaded', envolverSwal);
    window.Educare = { notificar: notificar, confirmar: confirmar, mostrarMensajes: mostrarMensajes };
})();
