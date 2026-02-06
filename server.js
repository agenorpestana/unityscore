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
app.use(express.json({ limit: '50mb' })); // Aumentado limite para imagens/logos

// Servir arquivos estáticos do React
app.use(express.static(path.join(__dirname, 'dist')));

// --- INICIALIZAÇÃO E MIGRAÇÃO DO BANCO DE DADOS ---
async function initDatabase() {
    let connection;
    try {
        connection = await pool.getConnection();
        
        console.log('🔧 Verificando estrutura do banco de dados...');

        // Tabelas Base (Planos, Companies, Users, Score_Rules)
        await connection.query(`CREATE TABLE IF NOT EXISTS saas_plans (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, price DECIMAL(10, 2) NOT NULL, max_users INT NOT NULL, active BOOLEAN DEFAULT TRUE)`);
        
        const [plans] = await connection.query("SELECT * FROM saas_plans");
        if (plans.length === 0) {
            await connection.query(`INSERT INTO saas_plans (name, price, max_users) VALUES ('Básico', 99.90, 3), ('Profissional', 199.90, 10), ('Enterprise', 499.90, 999)`);
        }

        await connection.query(`CREATE TABLE IF NOT EXISTS companies (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, cnpj VARCHAR(20), email_contact VARCHAR(255), plan_id INT, status ENUM('active', 'inactive', 'suspended') DEFAULT 'active', expiration_date DATE, ixc_domain VARCHAR(255), ixc_token VARCHAR(255), active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (plan_id) REFERENCES saas_plans(id))`);

        // --- MIGRATIONS (Colunas adicionais para Configurações) ---
        const addColumnSafe = async (table, columnDef) => {
            try {
                await connection.query(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
                console.log(`Column added to ${table}: ${columnDef}`);
            } catch (e) {
                if (e.errno !== 1060) console.log(`Note on ${table}: ${e.message}`);
            }
        };

        await addColumnSafe('companies', 'plan_id INT');
        await addColumnSafe('companies', 'email_contact VARCHAR(255)');
        await addColumnSafe('companies', 'status ENUM(\'active\', \'inactive\', \'suspended\') DEFAULT \'active\'');
        await addColumnSafe('companies', 'expiration_date DATE');
        
        // Novos campos de configuração
        await addColumnSafe('companies', 'address VARCHAR(255)');
        await addColumnSafe('companies', 'phone VARCHAR(50)');
        await addColumnSafe('companies', 'logo_url LONGTEXT'); // Base64 pode ser grande

        await connection.query(`CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, role ENUM('saas_owner', 'super_admin', 'admin', 'user') DEFAULT 'user', active BOOLEAN DEFAULT TRUE, permissions JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE)`);

        await connection.query(`CREATE TABLE IF NOT EXISTS score_rules (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT, subject_id VARCHAR(50) NOT NULL, points DECIMAL(10, 2) DEFAULT 0, type ENUM('internal', 'external', 'both') DEFAULT 'both', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY unique_rule (company_id, subject_id))`);

        const [users] = await connection.query("SELECT * FROM users WHERE email = ?", ['unity@unityautomacoes.com.br']);
        if (users.length === 0) {
            console.log('👤 Criando usuário padrão Unity...');
            await connection.query(`INSERT INTO users (name, email, password, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)`, ['Unity Admin', 'unity@unityautomacoes.com.br', '200616', 'saas_owner', true, JSON.stringify({ canManageCompany: true, canManageUsers: true, canViewScore: true })]);
        }

        console.log('✅ Banco de dados inicializado/atualizado com sucesso!');
    } catch (error) {
        console.error('❌ Erro na inicialização do banco:', error);
    } finally {
        if (connection) connection.release();
    }
}
initDatabase();

// --- ROTAS DE CONFIGURAÇÃO DA EMPRESA ---

// Obter Configurações
app.get('/api/companies/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, cnpj, email_contact, phone, address, ixc_domain, ixc_token, logo_url FROM companies WHERE id = ?', [req.params.id]);
        if (rows.length > 0) {
            // Normaliza para camelCase para o frontend
            const c = rows[0];
            res.json({
                id: c.id,
                name: c.name,
                cnpj: c.cnpj,
                email: c.email_contact,
                phone: c.phone,
                address: c.address,
                ixcDomain: c.ixc_domain,
                ixcToken: c.ixc_token,
                logoUrl: c.logo_url
            });
        } else {
            res.status(404).json({ error: 'Empresa não encontrada' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualizar Configurações
app.put('/api/companies/:id', async (req, res) => {
    const { name, cnpj, email, phone, address, ixcDomain, ixcToken, logoUrl } = req.body;
    try {
        await pool.query(`
            UPDATE companies 
            SET name=?, cnpj=?, email_contact=?, phone=?, address=?, ixc_domain=?, ixc_token=?, logo_url=?
            WHERE id=?
        `, [name, cnpj, email, phone, address, ixcDomain, ixcToken, logoUrl, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- PROXY IXC (Resolver CORS) ---
// O frontend chama /api/ixc-proxy/webservice/v1/... e o backend chama o IXC
app.use('/api/ixc-proxy', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    
    if (!companyId) {
        return res.status(400).json({ error: 'Company ID not provided in headers' });
    }

    try {
        // 1. Buscar credenciais no banco
        const [rows] = await pool.query('SELECT ixc_domain, ixc_token FROM companies WHERE id = ?', [companyId]);
        
        if (rows.length === 0 || !rows[0].ixc_domain || !rows[0].ixc_token) {
            return res.status(400).json({ error: 'Integração IXC não configurada para esta empresa.' });
        }

        const { ixc_domain, ixc_token } = rows[0];
        
        // Limpar URL e garantir formato correto
        let baseUrl = ixc_domain.trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

        // Construir URL final (req.url inclui o path após /api/ixc-proxy, ex: /webservice/v1/su_oss_chamado)
        const targetUrl = `${baseUrl}${req.url}`;
        const tokenBase64 = Buffer.from(ixc_token.trim()).toString('base64');

        // 2. Fazer requisição ao IXC (Backend-to-Backend não tem CORS)
        const response = await fetch(targetUrl, {
            method: 'POST', // IXC geralmente usa POST para listar
            headers: {
                'Authorization': `Basic ${tokenBase64}`,
                'Content-Type': 'application/json',
                'ixcsoft': 'listar'
            },
            body: JSON.stringify(req.body)
        });

        // 3. Devolver resposta ao frontend
        const data = await response.text();
        
        try {
            res.json(JSON.parse(data));
        } catch (e) {
            // Se não for JSON (erro HTML do IXC), devolve status original
            res.status(response.status).send(data);
        }

    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Erro de comunicação com o IXC: ' + error.message });
    }
});

// --- ROTAS DO SISTEMA (Login, SaaS, etc) ---

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND password = ? AND active = 1', [email, password]);
        if (rows.length > 0) {
            const user = rows[0];
            let companyData = null;
            if (user.company_id) {
                const [companies] = await pool.query('SELECT * FROM companies WHERE id = ?', [user.company_id]);
                companyData = companies[0];
                if (companyData && companyData.status !== 'active') {
                     return res.status(403).json({ success: false, message: 'Empresa suspensa.' });
                }
            }
            res.json({
                success: true,
                user: {
                    id: user.id.toString(),
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    permissions: typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions,
                    companyId: user.company_id ? user.company_id.toString() : null
                },
                company: companyData
            });
        } else {
            res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/saas/plans', async (req, res) => {
    try { const [rows] = await pool.query('SELECT * FROM saas_plans'); res.json(rows); } catch (e) { res.status(500).json({error: e.message}); }
});

app.get('/api/saas/companies', async (req, res) => {
    try { const [rows] = await pool.query(`SELECT c.*, p.name as plan_name FROM companies c LEFT JOIN saas_plans p ON c.plan_id = p.id ORDER BY c.created_at DESC`); res.json(rows); } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/api/saas/companies', async (req, res) => {
    const { name, cnpj, emailContact, planId, adminName, adminEmail, adminPassword } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [resCo] = await connection.query(`INSERT INTO companies (name, cnpj, email_contact, plan_id, status, expiration_date) VALUES (?, ?, ?, ?, 'active', DATE_ADD(NOW(), INTERVAL 30 DAY))`, [name, cnpj, emailContact, parseInt(planId)]);
        await connection.query(`INSERT INTO users (company_id, name, email, password, role, active, permissions) VALUES (?, ?, ?, ?, 'super_admin', 1, ?)`, [resCo.insertId, adminName, adminEmail, adminPassword, JSON.stringify({ canManageCompany: true, canManageUsers: true, canViewScore: true })]);
        await connection.commit();
        res.json({ success: true, companyId: resCo.insertId });
    } catch (error) { await connection.rollback(); res.status(500).json({ error: error.message }); } finally { connection.release(); }
});

app.put('/api/saas/companies/:id', async (req, res) => {
    const { name, cnpj, emailContact, planId } = req.body;
    try { await pool.query(`UPDATE companies SET name = ?, cnpj = ?, email_contact = ?, plan_id = ? WHERE id = ?`, [name, cnpj, emailContact, parseInt(planId), req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({error: e.message}); }
});

app.patch('/api/saas/companies/:id/status', async (req, res) => {
    try { await pool.query('UPDATE companies SET status = ? WHERE id = ?', [req.body.status, req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({error: e.message}); }
});

app.get('/api/score-rules', async (req, res) => {
    try {
        let query = 'SELECT * FROM score_rules';
        let params = [];
        if (req.query.companyId) { query += ' WHERE company_id = ?'; params.push(req.query.companyId); }
        const [rows] = await pool.query(query, params);
        const rulesMap = {};
        rows.forEach(row => { rulesMap[row.subject_id] = { subjectId: row.subject_id, points: Number(row.points), type: row.type }; });
        res.json(rulesMap);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/api/score-rules', async (req, res) => {
    try {
        await pool.query(`INSERT INTO score_rules (company_id, subject_id, points, type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE points = VALUES(points), type = VALUES(type)`, [req.body.companyId || 0, req.body.subjectId, req.body.points, req.body.type]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'dist', 'index.html')); });
app.listen(PORT, () => { console.log(`🚀 Server running on port ${PORT}`); });