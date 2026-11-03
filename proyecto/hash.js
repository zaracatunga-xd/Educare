let bcrypt;
try {
    bcrypt = require('bcrypt');
} catch (e) {
    bcrypt = require('bcryptjs');
}

bcrypt.hash('AdminPass2026!', 10).then(hash => {
    console.log('\n========================================');
    console.log('COPIA ESTE HASH GENERADO POR TU PROYECTO:');
    console.log(hash);
    console.log('========================================\n');
});