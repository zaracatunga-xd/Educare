const express = require('express');
const router = express.Router();
const postControllers = require('../auth/controllers/postControllers');
const { isAdmin } = require('../auth/authMiddleware');

router.get('/test-connection', isAdmin, postControllers.testConnection);

module.exports = router;
