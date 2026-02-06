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

// Servir arquivos estáticos do React
app.use(express.static(path.join(__dirname, 'dist')));

// --- INICIALIZAÇÃO DO BANCO DE DADOS ---
async function initDatabase() {
    try {
        const connection = await pool.getConnection();
        
        console.log('🔧 Verificando estrutura do banco de dados...');

        // 1. Tabela de Empresas (Tenants)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                cnpj VARCHAR(20),
                ixc_domain VARCHAR(255),
                ixc_token VARCHAR(255),
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Tabela de Usuários
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('saas_owner', 'super_admin', 'admin', 'user') DEFAULT 'user',
                active BOOLEAN DEFAULT TRUE,
                permissions JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            )
        `);

        // 3. Tabela de Regras de Pontuação
        await connection.query(`
            CREATE TABLE IF NOT EXISTS score_rules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_id INT,
                subject_id VARCHAR(50) NOT NULL,
                points DECIMAL(10, 2) DEFAULT 0,
                type ENUM('internal', 'external', 'both') DEFAULT 'both',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_rule (company_id, subject_id)
            )
        `);

        // 4. Inserir Usuário SaaS Owner Padrão (Se não existir)
        const [users] = await connection.query("SELECT * FROM users WHERE email = ?", ['unity@unityautomacoes.com.br']);
        
        if (users.length === 0) {
            console.log('👤 Criando usuário padrão Unity...');
            await connection.query(`
                INSERT INTO users (name, email, password, role, active, permissions)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                'Unity Admin',
                'unity@unityautomacoes.com.br',
                '200616', // Senha padrão solicitada
                'saas_owner',
                true,
                JSON.stringify({ canManageCompany: true, canManageUsers: true, canViewScore: true })
            ]);
        }

        connection.release();
        console.log('✅ Banco de dados inicializado com sucesso!');
    } catch (error) {
        console.error('❌ Erro na inicialização do banco:', error);
    }
}

// Executar init
initDatabase();

// --- ROTAS DA API ---

// 1. Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND password = ? AND active = 1', [email, password]);
        
        if (rows.length > 0) {
            const user = rows[0];
            // Se tiver company_id, busca dados da empresa
            let companyData = null;
            if (user.company_id) {
                const [companies] = await pool.query('SELECT * FROM companies WHERE id = ?', [user.company_id]);
                companyData = companies[0];
            }

            // Converter permissions de JSON string para Objeto se necessário
            let perms = user.permissions;
            if (typeof perms === 'string') {
                try { perms = JSON.parse(perms); } catch(e) {}
            }

            res.json({
                success: true,
                user: {
                    id: user.id.toString(),
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    permissions: perms,
                    companyId: user.company_id ? user.company_id.toString() : null
                },
                company: companyData
            });
        } else {
            res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

// 2. Obter Regras de Pontuação
app.get('/api/score-rules', async (req, res) => {
    // Em um cenário real, pegaríamos o ID da empresa do token JWT.
    // Aqui vamos pegar via query param para simplificar ou assumir null para saas_owner
    const companyId = req.query.companyId || null; 
    
    try {
        let query = 'SELECT * FROM score_rules';
        let params = [];
        
        if (companyId) {
            query += ' WHERE company_id = ?';
            params.push(companyId);
        }

        const [rows] = await pool.query(query, params);
        
        // Formatar para o formato esperado pelo frontend (Record<string, ScoreRule>)
        const rulesMap = {};
        rows.forEach(row => {
            rulesMap[row.subject_id] = {
                subjectId: row.subject_id,
                points: Number(row.points),
                type: row.type
            };
        });

        res.json(rulesMap);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Salvar Regra de Pontuação
app.post('/api/score-rules', async (req, res) => {
    const { companyId, subjectId, points, type } = req.body;
    
    // Se não tiver companyId (ex: saas owner testando), vamos ignorar ou usar 0
    // Em produção, isso deve ser obrigatório para tenants.
    const cid = companyId || 0; 

    try {
        await pool.query(`
            INSERT INTO score_rules (company_id, subject_id, points, type)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE points = VALUES(points), type = VALUES(type)
        `, [cid, subjectId, points, type]);
        
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', system: 'Unity Score SaaS' });
});

// Fallback SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});