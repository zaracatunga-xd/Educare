(function () {
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = (anios) => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + anios);
        return iso(d);
    };
    const hoy = () => iso(new Date());

    const REGLAS = {
        'birth-student': () => ({
            min: shift(-30),
            max: hoy(),
            bajo: 'El estudiante no puede tener más de 30 años.',
            alto: 'La fecha de nacimiento no puede ser futura.'
        }),
        'birth-adult': () => ({
            min: shift(-100),
            max: shift(-18),
            bajo: 'La fecha de nacimiento no es válida.',
            alto: 'La persona debe ser mayor de 18 años y la fecha no puede ser futura.'
        }),
        past: () => ({
            min: '1990-01-01',
            max: hoy(),
            bajo: 'La fecha es demasiado antigua.',
            alto: 'La fecha no puede ser futura.'
        }),
        future: () => ({
            min: hoy(),
            max: shift(5),
            bajo: 'La fecha no puede ser anterior a hoy.',
            alto: 'La fecha no puede superar los 5 años desde hoy.'
        }),
        after: (el) => {
            const form = el.form || document;
            const ref = form.querySelector('[name="' + el.dataset.dateAfter + '"]');
            return {
                min: ref && ref.value ? ref.value : '',
                max: shift(10),
                bajo: 'La fecha no puede ser anterior a la fecha de evaluación.',
                alto: 'La fecha es demasiado lejana.'
            };
        }
    };

    function aplicar(el) {
        const regla = REGLAS[el.dataset.dateRule];
        if (!regla) return null;
        const r = regla(el);
        if (r.min) el.min = r.min; else el.removeAttribute('min');
        if (r.max) el.max = r.max;
        return r;
    }

    function validar(el) {
        const r = aplicar(el);
        if (!r) return true;
        el.setCustomValidity('');
        if (!el.value) {
            if (el.validity.badInput) el.setCustomValidity('La fecha ingresada no es válida.');
        } else if (el.validity.rangeUnderflow || (r.min && el.value < r.min)) {
            el.setCustomValidity(r.bajo);
        } else if (el.validity.rangeOverflow || (r.max && el.value > r.max)) {
            el.setCustomValidity(r.alto);
        }
        return el.validity.valid;
    }

    function inicializar(raiz) {
        (raiz || document).querySelectorAll('input[type="date"][data-date-rule]').forEach(aplicar);
    }

    function avisar(el) {
        const mensaje = el.validationMessage;
        el.focus();
        if (window.Swal) {
            const tema = document.documentElement.getAttribute('data-theme') === 'dark';
            Swal.fire({
                icon: 'warning',
                title: 'Fecha no válida',
                text: mensaje,
                confirmButtonColor: '#0d9488',
                background: tema ? '#1e293b' : '#ffffff',
                color: tema ? '#f8fafc' : '#0f172a'
            });
        } else {
            el.reportValidity();
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        inicializar();
        new MutationObserver(function (mutaciones) {
            mutaciones.forEach(function (m) {
                m.addedNodes.forEach(function (n) {
                    if (n.nodeType === 1) {
                        if (n.matches && n.matches('input[type="date"][data-date-rule]')) aplicar(n);
                        inicializar(n);
                    }
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
    });

    document.addEventListener('focusin', function (e) {
        if (e.target.matches && e.target.matches('input[type="date"][data-date-rule]')) aplicar(e.target);
    });

    document.addEventListener('input', function (e) {
        if (e.target.matches && e.target.matches('input[type="date"][data-date-rule]')) {
            validar(e.target);
            if (e.target.name) {
                const form = e.target.form;
                if (form) {
                    form.querySelectorAll('input[type="date"][data-date-after="' + e.target.name + '"]').forEach(validar);
                }
            }
        }
    });

    document.addEventListener('submit', function (e) {
        const campos = e.target.querySelectorAll ? e.target.querySelectorAll('input[type="date"][data-date-rule]') : [];
        for (let i = 0; i < campos.length; i++) {
            if (!validar(campos[i])) {
                e.preventDefault();
                e.stopImmediatePropagation();
                avisar(campos[i]);
                return;
            }
        }
    }, true);
})();
