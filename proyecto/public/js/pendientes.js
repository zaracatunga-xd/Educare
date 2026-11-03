(function () {
    const tarjeta = document.getElementById('tarjetaChat');
    if (!tarjeta) return;

    const titulo = tarjeta.querySelector('[data-chat-titulo]');
    const ping = tarjeta.querySelector('[data-chat-ping]');
    const activo = tarjeta.querySelector('[data-chat-activo]');
    const pendientes = tarjeta.querySelector('[data-chat-pendientes]');
    const total = tarjeta.querySelector('[data-chat-total]');

    function mostrar(cantidad) {
        const hay = cantidad > 0;
        total.textContent = cantidad > 99 ? '99+' : String(cantidad);
        pendientes.classList.toggle('hidden', !hay);
        activo.classList.toggle('hidden', hay);
        ping.classList.toggle('hidden', !hay);
        titulo.classList.toggle('text-sky-300', hay);
        titulo.classList.toggle('text-slate-400', !hay);
        tarjeta.classList.toggle('border-sky-500/60', hay);
        tarjeta.classList.toggle('border-slate-800', !hay);
    }

    async function consultar() {
        if (document.hidden) return;
        try {
            const respuesta = await fetch('/chat/api/pendientes', { credentials: 'same-origin' });
            if (!respuesta.ok) return;
            const datos = await respuesta.json();
            mostrar(Number(datos.pendientes) || 0);
        } catch (error) {
            return;
        }
    }

    setInterval(consultar, 10000);
})();
