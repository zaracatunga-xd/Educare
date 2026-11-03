const mysql = require('mysql2/promise');
const pool = mysql.createPool({

    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER ,
    password: process.env.MYSQL_PASS,
    database: process.env.MYSQL_DB,
    port: process.env.MYSQL_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl:{
        rejectUnauthorized: false
    }

});
module.exports = pool;