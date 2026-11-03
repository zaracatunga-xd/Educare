const pool = require('../../config/db');

// Ruta de prueba para verificar conexión a MySQL
exports.testConnection = async (req, res) => {
    try {
        // Consulta simple para verificar conexión
        const [rows] = await pool.query('SELECT 1 as test');
        
        res.json({
            success: true,
            message: 'Conexión a MySQL exitosa',
            data: rows
        });
    } catch (error) {
        console.error('Error de conexión a MySQL:', error);
        res.status(500).json({
            success: false,
            message: 'Error al conectar a MySQL',
            error: error.message
        });
    }
};
