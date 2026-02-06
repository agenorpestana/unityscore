const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configuração do Banco de Dados (SaaS)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Pool de conexão
const pool = mysql.createPool(dbConfig);

// Middlewares
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do React (pasta dist gerada pelo build)
app.use(express.static(path.join(__dirname, 'dist')));

// --- Rotas da API (Backend do SaaS) ---

// Teste de Saúde do Sistema
app.get('/api/health', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();
        res.json({ 
            status: 'online', 
            database: 'connected', 
            system: 'Unity Score SaaS',
            version: '1.0.0'
        });
    } catch (error) {
        console.error('Erro de conexão com banco:', error);
        res.status(500).json({ 
            status: 'online', 
            database: 'disconnected', 
            error: error.message 
        });
    }
});

// Endpoint para criar o Tenant (Empresa) - Será usado pelo Super Admin
app.post('/api/admin/companies', async (req, res) => {
    // TODO: Implementar lógica real de criação no banco
    // Este endpoint demonstra onde a lógica do MySQL será implementada
    const { name, cnpj, planId } = req.body;
    res.json({ message: 'Endpoint preparado para criação de empresas', received: { name, cnpj } });
});

// --- Fallback para SPA (React Router) ---
// Qualquer rota não capturada pela API ou arquivos estáticos retorna o index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Inicialização do Servidor
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Unity Score SaaS rodando na porta ${PORT}`);
    console.log(`📂 Servindo frontend de: ${path.join(__dirname, 'dist')}`);
    console.log(`=========================================`);
});