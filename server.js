const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const https = require('https');

// Tenta ler o .env manualmente para garantir que o PM2 não sobrescreva com variáveis vazias
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envConfig = require('dotenv').parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
} else {
    require('dotenv').config();
}

const app = express();
// No ambiente Cloud Run / Dev Server, a porta externa é mapeada para a porta interna 3000
const PORT = process.env.APP_PORT || (process.env.DEFAULT_APP_PORT ? parseInt(process.env.DEFAULT_APP_PORT, 10) : 3000);

let isDbAvailable = false;

// Armazenamento em memória caso o MySQL externo esteja inacessível (ex: firewall ou VPS offline)
const inMemoryStore = {
    plans: [
        { id: 1, name: 'Básico', price: 99.90, max_users: 3, active: 1 },
        { id: 2, name: 'Profissional', price: 199.90, max_users: 10, active: 1 },
        { id: 3, name: 'Enterprise', price: 499.90, max_users: 999, active: 1 }
    ],
    companies: [
        {
            id: 1,
            name: 'Empresa Demonstração',
            cnpj: '00.000.000/0001-00',
            email_contact: 'suporte@unityautomacoes.com.br',
            plan_id: 2,
            plan_name: 'Profissional',
            status: 'active',
            expiration_date: '2029-12-31',
            ixc_domain: '',
            ixc_token: '',
            logo_url: '',
            whaticket_url: 'https://apichat.unityautomacoes.com.br',
            whaticket_token: '',
            whaticket_default_user_id: '',
            whaticket_default_queue_id: '',
            whaticket_send_signature: false,
            whaticket_close_ticket: false,
            whaticket_fast_send: true,
            opa_suite_url: '',
            opa_suite_token: '',
            opa_suite_canal_id: '',
            opa_suite_default_template_id: '',
            opa_suite_default_department_id: '',
            created_at: new Date()
        }
    ],
    users: [
        {
            id: 1,
            company_id: 1,
            name: 'Unity Admin',
            email: 'unity@unityautomacoes.com.br',
            password: '200616',
            role: 'saas_owner',
            active: 1,
            permissions: { canManageCompany: true, canManageUsers: true, canViewScore: true },
            ixc_employee_id: null,
            opa_user_id: null,
            whaticket_user_id: null
        },
        {
            id: 2,
            company_id: 1,
            name: 'Suporte Unity',
            email: 'suporte@unityautomacoes.com.br',
            password: '200616',
            role: 'saas_owner',
            active: 1,
            permissions: { canManageCompany: true, canManageUsers: true, canViewScore: true },
            ixc_employee_id: null,
            opa_user_id: null,
            whaticket_user_id: null
        }
    ],
    scoreRules: {},
    osPenalties: [],
    osAssignments: {},
    osSplits: {}
};

// Função para limpar aspas que o script bash possa ter injetado no .env
const cleanEnv = (val) => {
    if (!val) return '';
    return val.replace(/^["']|["']$/g, '').trim();
};

// Configuração do Banco de Dados (SaaS)
const dbConfig = {
    host: cleanEnv(process.env.DB_HOST) || 'localhost',
    user: cleanEnv(process.env.DB_USER) || 'unity_user',
    // Fallback rígido para a senha caso o .env falhe na VPS
    password: cleanEnv(process.env.DB_PASSWORD) || 'unity123.789',
    database: cleanEnv(process.env.DB_NAME) || 'unity_saas',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 5000
};

console.log(`Tentando conectar ao banco: ${dbConfig.user}@${dbConfig.host} no banco ${dbConfig.database} (Senha configurada: ${dbConfig.password ? 'SIM' : 'NÃO'})`);

// Pool de conexão
const pool = mysql.createPool(dbConfig);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Aumentado limite para imagens/logos

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

        // Migrations Companies
        await addColumnSafe('companies', 'plan_id INT');
        await addColumnSafe('companies', 'email_contact VARCHAR(255)');
        await addColumnSafe('companies', 'status ENUM(\'active\', \'inactive\', \'suspended\') DEFAULT \'active\'');
        await addColumnSafe('companies', 'expiration_date DATE');
        await addColumnSafe('companies', 'address VARCHAR(255)');
        await addColumnSafe('companies', 'phone VARCHAR(50)');
        await addColumnSafe('companies', 'logo_url LONGTEXT'); 
        await addColumnSafe('companies', 'opa_suite_url VARCHAR(255)'); 
        await addColumnSafe('companies', 'opa_suite_token VARCHAR(255)'); 
        await addColumnSafe('companies', 'opa_suite_canal_id VARCHAR(100)'); 
        await addColumnSafe('companies', 'opa_suite_default_template_id VARCHAR(100)'); 
        await addColumnSafe('companies', 'opa_suite_default_department_id VARCHAR(100)'); 
        await addColumnSafe('companies', 'whaticket_url VARCHAR(255) DEFAULT \'https://apichat.unityautomacoes.com.br\''); 
        await addColumnSafe('companies', 'whaticket_token TEXT'); 
        await addColumnSafe('companies', 'whaticket_default_user_id VARCHAR(50)'); 
        await addColumnSafe('companies', 'whaticket_default_queue_id VARCHAR(50)'); 
        await addColumnSafe('companies', 'whaticket_send_signature BOOLEAN DEFAULT FALSE'); 
        await addColumnSafe('companies', 'whaticket_close_ticket BOOLEAN DEFAULT FALSE'); 
        await addColumnSafe('companies', 'whaticket_fast_send BOOLEAN DEFAULT TRUE'); 

        // Migrations Users
        await connection.query(`CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, role ENUM('saas_owner', 'super_admin', 'admin', 'user', 'employee') DEFAULT 'user', active BOOLEAN DEFAULT TRUE, permissions JSON, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE)`);
        
        await addColumnSafe('users', 'ixc_employee_id VARCHAR(50) DEFAULT NULL');
        await addColumnSafe('users', 'opa_user_id VARCHAR(100) DEFAULT NULL');
        await addColumnSafe('users', 'whaticket_user_id VARCHAR(50) DEFAULT NULL');
        try {
            await connection.query(`ALTER TABLE users MODIFY COLUMN role ENUM('saas_owner', 'super_admin', 'admin', 'user', 'employee') DEFAULT 'user'`);
        } catch (e) {}

        await connection.query(`CREATE TABLE IF NOT EXISTS score_rules (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT, subject_id VARCHAR(50) NOT NULL, points DECIMAL(10, 2) DEFAULT 0, type ENUM('internal', 'external', 'both') DEFAULT 'both', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY unique_rule (company_id, subject_id))`);

        // Migration Score Rules (Divisão de Pontos)
        await addColumnSafe('score_rules', 'allow_split BOOLEAN DEFAULT FALSE');

        // Tabela de Splits (Divisão de Pontos por OS)
        await connection.query(`CREATE TABLE IF NOT EXISTS os_splits (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT, os_id VARCHAR(50) NOT NULL, technician_id VARCHAR(50) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY unique_split_entry (company_id, os_id, technician_id))`);

        // Tabela de Atribuição de OS para Funcionários/Técnicos
        await connection.query(`CREATE TABLE IF NOT EXISTS os_assignments (
            id INT AUTO_INCREMENT PRIMARY KEY, 
            company_id INT NOT NULL, 
            os_id VARCHAR(50) NOT NULL, 
            user_id VARCHAR(50), 
            technician_id VARCHAR(50), 
            assigned_name VARCHAR(255), 
            assigned_by VARCHAR(255), 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
            UNIQUE KEY unique_assignment (company_id, os_id)
        )`);

        // Tabela de Penalizações (Penalties)
        try {
            await connection.query(`CREATE TABLE IF NOT EXISTS os_penalties (id INT AUTO_INCREMENT PRIMARY KEY, company_id INT, os_id VARCHAR(50) NOT NULL, technician_id VARCHAR(50) NOT NULL, amount DECIMAL(10, 2) NOT NULL, reason TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
            console.log('✅ Tabela os_penalties verificada/criada com sucesso.');
        } catch (penaltyTableError) {
            console.error('❌ Erro ao criar tabela os_penalties:', penaltyTableError);
        }

        const [users] = await connection.query("SELECT * FROM users WHERE email = ? OR email = ?", ['unity@unityautomacoes.com.br', 'suporte@unityautomacoes.com.br']);
        if (users.length === 0) {
            console.log('👤 Criando usuários padrão Unity e Suporte...');
            await connection.query(`INSERT INTO users (name, email, password, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)`, ['Unity Admin', 'unity@unityautomacoes.com.br', '200616', 'saas_owner', true, JSON.stringify({ canManageCompany: true, canManageUsers: true, canViewScore: true })]);
            await connection.query(`INSERT INTO users (name, email, password, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)`, ['Suporte Unity', 'suporte@unityautomacoes.com.br', '200616', 'saas_owner', true, JSON.stringify({ canManageCompany: true, canManageUsers: true, canViewScore: true })]);
        } else if (users.length === 1 && users[0].email === 'unity@unityautomacoes.com.br') {
            console.log('👤 Criando usuário Suporte...');
            await connection.query(`INSERT INTO users (name, email, password, role, active, permissions) VALUES (?, ?, ?, ?, ?, ?)`, ['Suporte Unity', 'suporte@unityautomacoes.com.br', '200616', 'saas_owner', true, JSON.stringify({ canManageCompany: true, canManageUsers: true, canViewScore: true })]);
        }

        console.log('✅ Banco de dados inicializado/atualizado com sucesso!');
        isDbAvailable = true;
    } catch (error) {
        isDbAvailable = false;
        console.warn('⚠️ Banco de dados externo indisponível (' + error.message + '). Sistema operando em modo resiliente local.');
    } finally {
        if (connection) connection.release();
    }
}

// --- ROTAS DE CONFIGURAÇÃO DA EMPRESA ---

// Obter Configurações
app.get('/api/companies/:id', async (req, res) => {
    try {
        if (isDbAvailable) {
            try {
                const [rows] = await pool.query('SELECT id, name, cnpj, email_contact, phone, address, ixc_domain, ixc_token, logo_url, whaticket_url, whaticket_token, whaticket_default_user_id, whaticket_default_queue_id, whaticket_send_signature, whaticket_close_ticket, whaticket_fast_send, opa_suite_url, opa_suite_token, opa_suite_canal_id, opa_suite_default_template_id, opa_suite_default_department_id FROM companies WHERE id = ?', [req.params.id]);
                if (rows.length > 0) {
                    const c = rows[0];
                    return res.json({
                        id: c.id,
                        name: c.name,
                        cnpj: c.cnpj,
                        email: c.email_contact,
                        phone: c.phone,
                        address: c.address,
                        ixcDomain: c.ixc_domain,
                        ixcToken: c.ixc_token,
                        logoUrl: c.logo_url,
                        whaticketUrl: c.whaticket_url || 'https://apichat.unityautomacoes.com.br',
                        whaticketToken: c.whaticket_token || '',
                        whaticketDefaultUserId: c.whaticket_default_user_id || '',
                        whaticketDefaultQueueId: c.whaticket_default_queue_id || '',
                        whaticketSendSignature: Boolean(c.whaticket_send_signature),
                        whaticketCloseTicket: Boolean(c.whaticket_close_ticket),
                        whaticketFastSend: c.whaticket_fast_send !== 0,
                        opaSuiteUrl: c.opa_suite_url || '',
                        opaSuiteToken: c.opa_suite_token || '',
                        opaSuiteCanalId: c.opa_suite_canal_id || '',
                        opaSuiteDefaultTemplateId: c.opa_suite_default_template_id || '',
                        opaSuiteDefaultDepartmentId: c.opa_suite_default_department_id || ''
                    });
                }
            } catch (dbErr) {
                console.warn('⚠️ Falha ao buscar empresa no MySQL, usando fallback:', dbErr.message);
            }
        }
        const c = inMemoryStore.companies.find(comp => String(comp.id) === String(req.params.id)) || inMemoryStore.companies[0];
        res.json({
            id: c.id,
            name: c.name,
            cnpj: c.cnpj,
            email: c.email_contact,
            phone: c.phone || '',
            address: c.address || '',
            ixcDomain: c.ixc_domain || '',
            ixcToken: c.ixc_token || '',
            logoUrl: c.logo_url || '',
            whaticketUrl: c.whaticket_url || 'https://apichat.unityautomacoes.com.br',
            whaticketToken: c.whaticket_token || '',
            whaticketDefaultUserId: c.whaticket_default_user_id || '',
            whaticketDefaultQueueId: c.whaticket_default_queue_id || '',
            whaticketSendSignature: Boolean(c.whaticket_send_signature),
            whaticketCloseTicket: Boolean(c.whaticket_close_ticket),
            whaticketFastSend: c.whaticket_fast_send !== false,
            opaSuiteUrl: c.opa_suite_url || '',
            opaSuiteToken: c.opa_suite_token || '',
            opaSuiteCanalId: c.opa_suite_canal_id || '',
            opaSuiteDefaultTemplateId: c.opa_suite_default_template_id || '',
            opaSuiteDefaultDepartmentId: c.opa_suite_default_department_id || ''
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualizar Configurações
app.put('/api/companies/:id', async (req, res) => {
    const { 
        name, cnpj, email, phone, address, ixcDomain, ixcToken, logoUrl, 
        whaticketUrl, whaticketToken, whaticketDefaultUserId, whaticketDefaultQueueId, whaticketSendSignature, whaticketCloseTicket, whaticketFastSend,
        opaSuiteUrl, opaSuiteToken, opaSuiteCanalId, opaSuiteDefaultTemplateId, opaSuiteDefaultDepartmentId 
    } = req.body;
    try {
        if (isDbAvailable) {
            try {
                await pool.query(`
                    UPDATE companies 
                    SET name=?, cnpj=?, email_contact=?, phone=?, address=?, ixc_domain=?, ixc_token=?, logo_url=?, 
                        whaticket_url=?, whaticket_token=?, whaticket_default_user_id=?, whaticket_default_queue_id=?, whaticket_send_signature=?, whaticket_close_ticket=?, whaticket_fast_send=?,
                        opa_suite_url=?, opa_suite_token=?, opa_suite_canal_id=?, opa_suite_default_template_id=?, opa_suite_default_department_id=?
                    WHERE id=?
                `, [
                    name, cnpj, email, phone, address, ixcDomain, ixcToken, logoUrl, 
                    whaticketUrl || 'https://apichat.unityautomacoes.com.br', whaticketToken || null, whaticketDefaultUserId || null, whaticketDefaultQueueId || null, whaticketSendSignature ? 1 : 0, whaticketCloseTicket ? 1 : 0, whaticketFastSend ? 1 : 0,
                    opaSuiteUrl || null, opaSuiteToken || null, opaSuiteCanalId || null, opaSuiteDefaultTemplateId || null, opaSuiteDefaultDepartmentId || null, 
                    req.params.id
                ]);
            } catch (dbErr) {
                console.warn('⚠️ Falha ao atualizar empresa no MySQL, atualizando fallback:', dbErr.message);
            }
        }
        const c = inMemoryStore.companies.find(comp => String(comp.id) === String(req.params.id));
        if (c) {
            if (name !== undefined) c.name = name;
            if (cnpj !== undefined) c.cnpj = cnpj;
            if (email !== undefined) c.email_contact = email;
            if (phone !== undefined) c.phone = phone;
            if (address !== undefined) c.address = address;
            if (ixcDomain !== undefined) c.ixc_domain = ixcDomain;
            if (ixcToken !== undefined) c.ixc_token = ixcToken;
            if (logoUrl !== undefined) c.logo_url = logoUrl;
            if (whaticketUrl !== undefined) c.whaticket_url = whaticketUrl;
            if (whaticketToken !== undefined) c.whaticket_token = whaticketToken;
            if (whaticketDefaultUserId !== undefined) c.whaticket_default_user_id = whaticketDefaultUserId;
            if (whaticketDefaultQueueId !== undefined) c.whaticket_default_queue_id = whaticketDefaultQueueId;
            if (whaticketSendSignature !== undefined) c.whaticket_send_signature = Boolean(whaticketSendSignature);
            if (whaticketCloseTicket !== undefined) c.whaticket_close_ticket = Boolean(whaticketCloseTicket);
            if (whaticketFastSend !== undefined) c.whaticket_fast_send = Boolean(whaticketFastSend);
            if (opaSuiteUrl !== undefined) c.opa_suite_url = opaSuiteUrl;
            if (opaSuiteToken !== undefined) c.opa_suite_token = opaSuiteToken;
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- PROXY IXC (Resolver CORS) ---
app.use('/api/ixc-proxy', async (req, res) => {
    const companyId = req.headers['x-company-id'];
    
    if (!companyId || companyId === 'undefined' || companyId === 'null') {
        return res.status(400).json({ error: 'Company ID not provided in headers' });
    }

    try {
        const [rows] = await pool.query('SELECT ixc_domain, ixc_token FROM companies WHERE id = ?', [companyId]);
        
        if (rows.length === 0 || !rows[0].ixc_domain || !rows[0].ixc_token) {
            return res.status(400).json({ error: 'Integração IXC não configurada para esta empresa.' });
        }

        const { ixc_domain, ixc_token } = rows[0];
        
        let baseUrl = ixc_domain.trim();
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
        if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

        const targetUrl = `${baseUrl}${req.url}`;
        const tokenBase64 = Buffer.from(ixc_token.trim()).toString('base64');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); 

        const response = await fetch(targetUrl, {
            method: 'POST', 
            headers: {
                'Authorization': `Basic ${tokenBase64}`,
                'Content-Type': 'application/json',
                'ixcsoft': 'listar'
            },
            body: JSON.stringify(req.body),
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        const data = await response.text();
        
        try {
            res.json(JSON.parse(data));
        } catch (e) {
            res.status(response.status).send(data);
        }

    } catch (error) {
        if (error.name === 'AbortError') {
             console.error('Proxy Timeout');
             return res.status(504).json({ error: 'Timeout: IXC demorou muito para responder.' });
        }
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Erro de comunicação com o IXC: ' + error.message });
    }
});

// --- GESTÃO DE USUÁRIOS (TENANT) ---

app.get('/api/users', async (req, res) => {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    try {
        if (isDbAvailable) {
            try {
                const [rows] = await pool.query('SELECT id, name, email, role, active, permissions, ixc_employee_id, opa_user_id, whaticket_user_id FROM users WHERE company_id = ?', [companyId]);
                const users = rows.map(u => ({
                    ...u,
                    permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions,
                    active: !!u.active,
                    ixcEmployeeId: u.ixc_employee_id,
                    opaUserId: u.opa_user_id || null,
                    whaticketUserId: u.whaticket_user_id || null
                }));
                return res.json(users);
            } catch (dbErr) {
                console.warn('⚠️ Falha ao buscar usuários no MySQL, usando fallback:', dbErr.message);
            }
        }
        const users = inMemoryStore.users
            .filter(u => String(u.company_id) === String(companyId))
            .map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                active: !!u.active,
                permissions: u.permissions,
                ixcEmployeeId: u.ixc_employee_id,
                opaUserId: u.opa_user_id || null,
                whaticketUserId: u.whaticket_user_id || null
            }));
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
    const { companyId, name, email, password, role, permissions, active, ixcEmployeeId, opaUserId, whaticketUserId } = req.body;
    try {
        const whaticketId = whaticketUserId || null;
        if (isDbAvailable) {
            try {
                const [result] = await pool.query(
                    'INSERT INTO users (company_id, name, email, password, role, permissions, active, ixc_employee_id, opa_user_id, whaticket_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [companyId, name, email, password, role, JSON.stringify(permissions), active, ixcEmployeeId || null, opaUserId || null, whaticketId]
                );
                return res.json({ success: true, id: result.insertId });
            } catch (dbErr) {
                console.warn('⚠️ Falha ao criar usuário no MySQL, gravando no fallback:', dbErr.message);
            }
        }
        const newId = inMemoryStore.users.length + 1;
        inMemoryStore.users.push({
            id: newId,
            company_id: parseInt(companyId),
            name,
            email,
            password,
            role,
            permissions,
            active: !!active,
            ixc_employee_id: ixcEmployeeId || null,
            opa_user_id: opaUserId || null,
            whaticket_user_id: whaticketId
        });
        res.json({ success: true, id: newId });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id', async (req, res) => {
    const { name, email, password, permissions, active, role, ixcEmployeeId, opaUserId, whaticketUserId } = req.body;
    try {
        const whaticketId = whaticketUserId !== undefined ? (whaticketUserId || null) : undefined;
        if (isDbAvailable) {
            try {
                let query = 'UPDATE users SET name=?, email=?, permissions=?, active=?, role=?, ixc_employee_id=?, opa_user_id=?';
                let params = [name, email, JSON.stringify(permissions), active, role, ixcEmployeeId || null, opaUserId || null];
                if (whaticketId !== undefined) {
                    query += ', whaticket_user_id=?';
                    params.push(whaticketId);
                }
                if (password && password.trim() !== '') {
                    query += ', password=?';
                    params.push(password);
                }
                query += ' WHERE id=?';
                params.push(req.params.id);
                await pool.query(query, params);
                return res.json({ success: true });
            } catch (dbErr) {
                console.warn('⚠️ Falha ao atualizar usuário no MySQL, gravando no fallback:', dbErr.message);
            }
        }
        const user = inMemoryStore.users.find(u => String(u.id) === String(req.params.id));
        if (user) {
            if (name !== undefined) user.name = name;
            if (email !== undefined) user.email = email;
            if (password) user.password = password;
            if (permissions !== undefined) user.permissions = permissions;
            if (active !== undefined) user.active = !!active;
            if (role !== undefined) user.role = role;
            if (ixcEmployeeId !== undefined) user.ixc_employee_id = ixcEmployeeId;
            if (opaUserId !== undefined) user.opa_user_id = opaUserId;
            if (whaticketId !== undefined) user.whaticket_user_id = whaticketId;
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROTAS DE REGRAS E PONTUAÇÃO ---

app.get('/api/score-rules', async (req, res) => {
    try {
        let query = 'SELECT * FROM score_rules';
        let params = [];
        if (req.query.companyId) { query += ' WHERE company_id = ?'; params.push(req.query.companyId); }
        const [rows] = await pool.query(query, params);
        const rulesMap = {};
        rows.forEach(row => { 
            rulesMap[row.subject_id] = { 
                subjectId: row.subject_id, 
                points: Number(row.points), 
                type: row.type,
                allowSplit: !!row.allow_split 
            }; 
        });
        res.json(rulesMap);
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.post('/api/score-rules', async (req, res) => {
    try {
        await pool.query(`INSERT INTO score_rules (company_id, subject_id, points, type, allow_split) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE points = VALUES(points), type = VALUES(type), allow_split = VALUES(allow_split)`, 
        [req.body.companyId || 0, req.body.subjectId, req.body.points, req.body.type, req.body.allowSplit]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

// --- ROTAS DE DIVISÃO DE PONTOS (SPLITS) ---

// Obter Splits (Retorna mapa { os_id: [tech_id1, tech_id2] })
app.get('/api/os-splits', async (req, res) => {
    const companyId = req.query.companyId;
    if (!companyId || companyId === 'undefined' || companyId === 'null') return res.status(400).json({ error: 'Company ID required' });
    try {
        const [rows] = await pool.query('SELECT os_id, technician_id FROM os_splits WHERE company_id = ?', [companyId]);
        const splits = {};
        rows.forEach(row => {
            if (!splits[row.os_id]) splits[row.os_id] = [];
            splits[row.os_id].push(row.technician_id);
        });
        res.json(splits);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Salvar Split (Sobrescreve participantes de uma OS)
app.post('/api/os-splits', async (req, res) => {
    const { companyId, osId, technicianIds } = req.body;
    if (!companyId) return res.status(400).json({ error: 'Company ID required' });
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Remove anteriores
        await connection.query('DELETE FROM os_splits WHERE company_id = ? AND os_id = ?', [companyId, osId]);
        
        // Insere novos (se houver)
        if (technicianIds && technicianIds.length > 0) {
            const values = technicianIds.map(tid => [companyId, osId, tid]);
            await connection.query('INSERT INTO os_splits (company_id, os_id, technician_id) VALUES ?', [values]);
        }
        
        await connection.commit();
        res.json({ success: true });
    } catch (e) {
        await connection.rollback();
        res.status(500).json({ error: e.message });
    } finally {
        connection.release();
    }
});

// --- ROTAS DE PENALIZAÇÕES ---

// Obter Penalizações
app.get('/api/os-penalties', async (req, res) => {
    const companyId = req.query.companyId;
    if (!companyId || companyId === 'undefined' || companyId === 'null') return res.status(400).json({ error: 'Company ID required' });
    try {
        const [rows] = await pool.query('SELECT * FROM os_penalties WHERE company_id = ?', [companyId]);
        const penalties = rows.map(row => ({
            id: row.id,
            osId: row.os_id,
            technicianId: row.technician_id,
            amount: Number(row.amount),
            reason: row.reason,
            createdAt: row.created_at
        }));
        res.json(penalties);
    } catch (e) { 
        console.error('Erro na rota GET /api/os-penalties:', e);
        // Retorna array vazio em caso de erro para não quebrar o frontend
        res.status(200).json([]); 
    }
});

// Salvar Penalização
app.post('/api/os-penalties', async (req, res) => {
    const { companyId, osId, technicianId, amount, reason } = req.body;
    try {
        console.log(`Tentando salvar penalização: OS ${osId}, Tech ${technicianId}, Amount ${amount}`);
        await pool.query(
            'INSERT INTO os_penalties (company_id, os_id, technician_id, amount, reason) VALUES (?, ?, ?, ?, ?)',
            [companyId, osId, technicianId, amount, reason]
        );
        res.json({ success: true });
    } catch (e) { 
        console.error('Erro ao salvar penalização (POST /api/os-penalties):', e);
        res.status(500).json({ error: e.message, details: 'Erro ao inserir no banco de dados' }); 
    }
});

// Remover Penalização
app.delete('/api/os-penalties/:id', async (req, res) => {
    try {
        console.log(`Tentando deletar penalização ID: ${req.params.id}`);
        await pool.query('DELETE FROM os_penalties WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { 
        console.error('Erro ao deletar penalização (DELETE /api/os-penalties):', e);
        res.status(500).json({ error: e.message }); 
    }
});

// --- ROTAS DE ATRIBUIÇÃO DE OS PARA FUNCIONÁRIOS ---

// Obter Atribuições (Retorna mapa { [os_id]: { osId, userId, technicianId, assignedName, assignedBy, createdAt } })
app.get('/api/os-assignments', async (req, res) => {
    const companyId = req.query.companyId || req.headers['x-company-id'];
    if (!companyId || companyId === 'undefined' || companyId === 'null') return res.status(400).json({ error: 'Company ID required' });
    try {
        const [rows] = await pool.query('SELECT os_id, user_id, technician_id, assigned_name, assigned_by, created_at FROM os_assignments WHERE company_id = ?', [companyId]);
        const map = {};
        rows.forEach(r => {
            map[r.os_id] = {
                osId: r.os_id,
                userId: r.user_id,
                technicianId: r.technician_id,
                assignedName: r.assigned_name,
                assignedBy: r.assigned_by,
                createdAt: r.created_at
            };
        });
        res.json(map);
    } catch (e) {
        console.error('Erro ao buscar atribuições:', e);
        res.status(200).json({});
    }
});

// Salvar Atribuição (Suporta atribuição individual ou em lote)
app.post('/api/os-assignments', async (req, res) => {
    const { companyId, osIds, osId, userId, technicianId, assignedName, assignedBy } = req.body;
    const cid = companyId || req.headers['x-company-id'];
    if (!cid) return res.status(400).json({ error: 'Company ID required' });

    const targetOsIds = Array.isArray(osIds) ? osIds : (osId ? [osId] : []);
    if (targetOsIds.length === 0) return res.status(400).json({ error: 'Nenhuma OS informada.' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const targetId of targetOsIds) {
            await connection.query(`
                INSERT INTO os_assignments (company_id, os_id, user_id, technician_id, assigned_name, assigned_by)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    user_id = VALUES(user_id),
                    technician_id = VALUES(technician_id),
                    assigned_name = VALUES(assigned_name),
                    assigned_by = VALUES(assigned_by)
            `, [cid, targetId, userId || null, technicianId || null, assignedName || null, assignedBy || null]);
        }
        await connection.commit();
        res.json({ success: true, count: targetOsIds.length });
    } catch (e) {
        await connection.rollback();
        console.error('Erro ao atribuir OS:', e);
        res.status(500).json({ error: e.message });
    } finally {
        connection.release();
    }
});

// Remover Atribuição
app.delete('/api/os-assignments/:osId', async (req, res) => {
    const cid = req.query.companyId || req.headers['x-company-id'];
    if (!cid) return res.status(400).json({ error: 'Company ID required' });
    try {
        await pool.query('DELETE FROM os_assignments WHERE company_id = ? AND os_id = ?', [cid, req.params.osId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROTAS DE INTEGRAÇÃO OPA! SUITE (PROVEDOR WHATSAPP OFICIAL) ---

// Helper para obter configuração Opa Suite da empresa
async function getOpaSuiteConfig(companyId, directUrl, directToken) {
    if (directUrl && directToken) {
        let url = directUrl.trim();
        if (url.endsWith('/')) url = url.slice(0, -1);
        if (!url.startsWith('http')) url = 'https://' + url;
        return { url, token: directToken.trim() };
    }
    if (!companyId) return null;
    const [rows] = await pool.query('SELECT opa_suite_url, opa_suite_token, opa_suite_canal_id, opa_suite_default_template_id, opa_suite_default_department_id FROM companies WHERE id = ?', [companyId]);
    if (rows.length === 0 || !rows[0].opa_suite_url || !rows[0].opa_suite_token) {
        return null;
    }
    let url = rows[0].opa_suite_url.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    if (!url.startsWith('http')) url = 'https://' + url;
    return {
        url,
        token: rows[0].opa_suite_token.trim(),
        canalId: rows[0].opa_suite_canal_id,
        templateId: rows[0].opa_suite_default_template_id,
        departmentId: rows[0].opa_suite_default_department_id
    };
}

// Listar Clientes no Opa! Suite (suporta GET e POST)
const handleOpaClientes = async (req, res) => {
    const companyId = req.headers['x-company-id'] || req.body?.companyId || req.query.companyId;
    const directUrl = req.body?.directUrl || req.query.directUrl;
    const directToken = req.body?.directToken || req.query.directToken;
    const query = req.query.query || req.body?.query || '';
    const filter = req.body?.filter;

    try {
        const config = await getOpaSuiteConfig(companyId, directUrl, directToken);
        if (!config) {
            return res.status(400).json({ error: 'Integração Opa! Suite não configurada. Preencha URL e Token em Configurações.' });
        }

        let targetUrl = `${config.url}/api/v1/cliente/`;
        if (query) {
            targetUrl += `?query=${encodeURIComponent(query)}`;
        } else if (filter) {
            targetUrl += `?filter=${encodeURIComponent(JSON.stringify(filter))}`;
        }

        console.log(`Opa! Suite Buscando clientes em: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.token}`,
                'Accept': 'application/json'
            }
        });

        const textData = await response.text();
        try {
            const data = JSON.parse(textData);
            res.status(response.status).json(data);
        } catch {
            res.status(response.status).send(textData);
        }
    } catch (e) {
        console.error('Erro Opa! Suite Clientes:', e);
        res.status(500).json({ error: 'Erro ao consultar Opa! Suite: ' + e.message });
    }
};

app.get('/api/opasuite/clientes', handleOpaClientes);
app.post('/api/opasuite/clientes', handleOpaClientes);

// Função utilitária para chamadas HTTP/HTTPS ao Opa! Suite (suporta GET com body)
const requestOpaSuite = (targetUrl, method = 'GET', bodyData = null, token) => {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(targetUrl);
            const protocol = parsedUrl.protocol === 'http:' ? http : https;
            const bodyBuffer = bodyData ? Buffer.from(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData)) : null;

            const reqOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
                path: parsedUrl.pathname + parsedUrl.search,
                method: method || 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    ...(bodyBuffer ? {
                        'Content-Type': 'application/json',
                        'Content-Length': bodyBuffer.length
                    } : {})
                }
            };

            const req = protocol.request(reqOptions, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({ status: res.statusCode || 200, data });
                });
            });

            req.on('error', (err) => reject(err));
            if (bodyBuffer) {
                req.write(bodyBuffer);
            }
            req.end();
        } catch (err) {
            reject(err);
        }
    });
};

// Listar Departamentos no Opa! Suite (suporta GET e POST)
const handleOpaDepartamentos = async (req, res) => {
    const companyId = req.headers['x-company-id'] || req.body?.companyId || req.query.companyId;
    const directUrl = req.body?.directUrl || req.query.directUrl;
    const directToken = req.body?.directToken || req.query.directToken;
    const customFilter = req.body?.filter;
    const customOptions = req.body?.options || { limit: 100 };

    try {
        const config = await getOpaSuiteConfig(companyId, directUrl, directToken);
        if (!config) {
            return res.status(400).json({ error: 'Integração Opa! Suite não configurada. Preencha URL e Token em Configurações.' });
        }

        const baseUrl = config.url.replace(/\/+$/, '');
        const targetUrl = `${baseUrl}/api/v1/departamento/`;
        console.log(`Opa! Suite Buscando departamentos em: ${targetUrl}`);

        const requestBody = {
            filter: customFilter || {},
            options: customOptions
        };

        let response = await requestOpaSuite(targetUrl, 'GET', requestBody, config.token);
        let parsed = null;
        try {
            parsed = JSON.parse(response.data);
        } catch {}

        let departamentos = [];
        if (parsed && Array.isArray(parsed.data)) {
            departamentos = parsed.data;
        } else if (parsed && Array.isArray(parsed)) {
            departamentos = parsed;
        } else if (parsed && Array.isArray(parsed.registros)) {
            departamentos = parsed.registros;
        }

        if (departamentos.length === 0) {
            try {
                const fallbackRes = await requestOpaSuite(`${baseUrl}/api/v1/departamento`, 'GET', requestBody, config.token);
                const fbParsed = JSON.parse(fallbackRes.data);
                const fbList = Array.isArray(fbParsed?.data) ? fbParsed.data : (Array.isArray(fbParsed) ? fbParsed : []);
                if (fbList.length > 0) {
                    departamentos = fbList;
                }
            } catch (err) {}
        }

        console.log(`Opa! Suite: ${departamentos.length} departamento(s) encontrado(s).`);

        return res.status(200).json({
            status: 'success',
            code: 200,
            data: departamentos
        });
    } catch (e) {
        console.error('Erro Opa! Suite Departamentos:', e);
        res.status(500).json({ error: 'Erro ao listar departamentos Opa! Suite: ' + e.message });
    }
};

app.get('/api/opasuite/departamentos', handleOpaDepartamentos);
app.post('/api/opasuite/departamentos', handleOpaDepartamentos);

// Listar Templates no Opa! Suite (suporta busca por canal de comunicação específico ou geral)
const handleOpaTemplates = async (req, res) => {
    const companyId = req.headers['x-company-id'] || req.body?.companyId || req.query.companyId;
    const directUrl = req.body?.directUrl || req.query.directUrl;
    const directToken = req.body?.directToken || req.query.directToken;
    const requestedCanalId = req.query.canalId || req.body?.canalId || req.headers['x-canal-id'];
    const customFilter = req.body?.filter;
    const customOptions = req.body?.options || { limit: 200 };

    try {
        const config = await getOpaSuiteConfig(companyId, directUrl, directToken);
        if (!config) {
            return res.status(400).json({ error: 'Integração Opa! Suite não configurada. Preencha URL e Token em Configurações.' });
        }

        const baseUrl = config.url.replace(/\/+$/, '');
        let templates = [];

        // 1. Se canalId foi informado (ou salvo nas configurações da empresa), busca templates relacionados ao canal:
        // GET /api/v1/canal-comunicacao/:idCanal/template
        const channelToQuery = requestedCanalId || config.canalId;
        if (channelToQuery) {
            console.log(`Opa! Suite Buscando templates por canal em: ${baseUrl}/api/v1/canal-comunicacao/${channelToQuery}/template`);
            try {
                const canalRes = await requestOpaSuite(`${baseUrl}/api/v1/canal-comunicacao/${channelToQuery}/template`, 'GET', null, config.token);
                const parsedCanal = JSON.parse(canalRes.data);
                const canalTemplates = Array.isArray(parsedCanal?.data) ? parsedCanal.data : (Array.isArray(parsedCanal) ? parsedCanal : []);
                if (canalTemplates.length > 0) {
                    templates = canalTemplates;
                    console.log(`Opa! Suite: ${templates.length} template(s) retornado(s) do canal ${channelToQuery}.`);
                }
            } catch (errCanal) {
                console.warn(`Opa! Suite erro ao buscar templates do canal ${channelToQuery}:`, errCanal.message);
            }
        }

        // 2. Se ainda não achou templates e nenhum canal específico foi filtrado, 
        // busca os canais WhatsApp cadastrados e extrai os templates deles
        if (templates.length === 0 && !requestedCanalId) {
            try {
                console.log(`Opa! Suite: Tentando buscar canais WhatsApp para extrair templates associados...`);
                const channelsRes = await requestOpaSuite(`${baseUrl}/api/v1/canal-comunicacao/`, 'GET', { filter: { canal: 'Whatsapp' }, options: { limit: 20 } }, config.token);
                const parsedChannels = JSON.parse(channelsRes.data);
                const channelsList = Array.isArray(parsedChannels?.data) ? parsedChannels.data : (Array.isArray(parsedChannels) ? parsedChannels : []);
                
                for (const ch of channelsList) {
                    if (ch._id) {
                        try {
                            const chTplRes = await requestOpaSuite(`${baseUrl}/api/v1/canal-comunicacao/${ch._id}/template`, 'GET', null, config.token);
                            const parsedTpl = JSON.parse(chTplRes.data);
                            const tpls = Array.isArray(parsedTpl?.data) ? parsedTpl.data : (Array.isArray(parsedTpl) ? parsedTpl : []);
                            if (tpls.length > 0) {
                                for (const t of tpls) {
                                    if (!templates.some(existing => existing._id === t._id)) {
                                        templates.push(t);
                                    }
                                }
                            }
                        } catch (e) {}
                    }
                }
            } catch (errChannels) {}
        }

        // 3. Fallback: Endpoint genérico /api/v1/template com JSON body
        if (templates.length === 0) {
            const requestBody = {
                filter: customFilter || {},
                options: customOptions
            };

            console.log(`Opa! Suite Buscando templates em: ${baseUrl}/api/v1/template`);

            let response = await requestOpaSuite(`${baseUrl}/api/v1/template`, 'GET', requestBody, config.token);
            let parsed = null;
            try {
                parsed = JSON.parse(response.data);
            } catch {}

            if (parsed && Array.isArray(parsed.data)) {
                templates = parsed.data;
            } else if (parsed && Array.isArray(parsed)) {
                templates = parsed;
            } else if (parsed && Array.isArray(parsed.registros)) {
                templates = parsed.registros;
            }

            // Fallback com barra
            if (templates.length === 0) {
                try {
                    const retrySlash = await requestOpaSuite(`${baseUrl}/api/v1/template/`, 'GET', requestBody, config.token);
                    const slashParsed = JSON.parse(retrySlash.data);
                    const slashList = Array.isArray(slashParsed?.data) ? slashParsed.data : (Array.isArray(slashParsed) ? slashParsed : []);
                    if (slashList.length > 0) templates = slashList;
                } catch (errSlash) {}
            }
        }

        console.log(`Opa! Suite: ${templates.length} template(s) localizado(s) no total.`);

        return res.status(200).json({
            status: 'success',
            code: 200,
            data: templates
        });
    } catch (e) {
        console.error('Erro Opa! Suite Templates:', e);
        res.status(500).json({ error: 'Erro ao listar templates Opa! Suite: ' + e.message });
    }
};

app.get('/api/opasuite/templates', handleOpaTemplates);
app.post('/api/opasuite/templates', handleOpaTemplates);

// Listar Canais de Comunicação no Opa! Suite (suporta GET e POST)
const handleOpaCanais = async (req, res) => {
    const companyId = req.headers['x-company-id'] || req.body?.companyId || req.query.companyId;
    const directUrl = req.body?.directUrl || req.query.directUrl;
    const directToken = req.body?.directToken || req.query.directToken;
    const requestedCanal = req.query.canal || req.body?.canal || 'Whatsapp';
    const customFilter = req.body?.filter;
    const customOptions = req.body?.options || { limit: 100 };

    try {
        const config = await getOpaSuiteConfig(companyId, directUrl, directToken);
        if (!config) {
            return res.status(400).json({ error: 'Integração Opa! Suite não configurada. Preencha URL e Token em Configurações.' });
        }

        const baseUrl = config.url.replace(/\/+$/, '');
        const targetUrl = `${baseUrl}/api/v1/canal-comunicacao/`;
        console.log(`Opa! Suite Buscando canais em: ${targetUrl} com canal: ${requestedCanal}`);

        const filterPayload = customFilter ? customFilter : (requestedCanal && requestedCanal !== 'all' ? { canal: requestedCanal } : {});
        const requestBody = {
            filter: filterPayload,
            options: customOptions
        };

        // 1. Tenta GET com body
        let response = await requestOpaSuite(targetUrl, 'GET', requestBody, config.token);
        let parsed = null;
        try {
            parsed = JSON.parse(response.data);
        } catch {}

        let channels = [];
        if (parsed && Array.isArray(parsed.data)) {
            channels = parsed.data;
        } else if (parsed && Array.isArray(parsed)) {
            channels = parsed;
        } else if (parsed && Array.isArray(parsed.registros)) {
            channels = parsed.registros;
        }

        // 2. Se não encontrou canais com o filtro específico, tenta sem filtro para buscar todos
        if (channels.length === 0) {
            try {
                const fallbackRes = await requestOpaSuite(targetUrl, 'GET', { options: { limit: 100 } }, config.token);
                const fallbackParsed = JSON.parse(fallbackRes.data);
                const allList = Array.isArray(fallbackParsed?.data) ? fallbackParsed.data : (Array.isArray(fallbackParsed) ? fallbackParsed : []);
                if (allList.length > 0) {
                    channels = allList;
                    parsed = fallbackParsed;
                }
            } catch (errFallback) {
                console.warn('Fallback listagem de canais sem filtro:', errFallback.message);
            }
        }

        // Se o objetivo é WhatsApp, filtra em memória caso a API tenha retornado canais diversos
        if (requestedCanal && requestedCanal !== 'all' && channels.length > 0) {
            const lowerCanal = requestedCanal.toLowerCase();
            const filteredWa = channels.filter(c => 
                (c.canal && c.canal.toLowerCase() === lowerCanal) ||
                (c.integracao && c.integracao.toLowerCase() === 'dialog360') ||
                (c.nome && c.nome.toLowerCase().includes('whatsapp'))
            );
            if (filteredWa.length > 0) {
                return res.status(200).json({
                    status: 'success',
                    code: 200,
                    data: filteredWa
                });
            }
        }

        if (parsed) {
            return res.status(response.status || 200).json(parsed);
        } else {
            return res.status(response.status || 200).send(response.data);
        }
    } catch (e) {
        console.error('Erro Opa! Suite Canais:', e);
        res.status(500).json({ error: 'Erro ao listar canais Opa! Suite: ' + e.message });
    }
};

app.get('/api/opasuite/canais', handleOpaCanais);
app.post('/api/opasuite/canais', handleOpaCanais);

// Listar Usuários do Opa! Suite (Atendentes)
const handleOpaUsuarios = async (req, res) => {
    const companyId = req.headers['x-company-id'] || req.query.companyId || req.body.companyId;
    const { directUrl, directToken, filter, options, status, tipo, nome } = { ...req.query, ...req.body };
    try {
        const config = await getOpaSuiteConfig(companyId, directUrl, directToken);
        if (!config) {
            return res.status(400).json({ error: 'Integração Opa! Suite não configurada. Preencha URL e Token em Configurações.' });
        }

        const baseUrl = config.url.replace(/\/+$/, '');
        let targetUrl = `${baseUrl}/api/v1/usuario/`;

        const requestFilter = {
            ...(filter && typeof filter === 'object' ? filter : {}),
            ...(status ? { status } : {}),
            ...(tipo ? { tipo } : {}),
            ...(nome ? { nome } : {})
        };

        // Por padrão busca usuários ativos se nada foi filtrado
        if (Object.keys(requestFilter).length === 0) {
            requestFilter.status = 'A';
        }

        const requestOptions = {
            limit: 200,
            ...(options && typeof options === 'object' ? options : {})
        };

        const payload = {
            filter: requestFilter,
            options: requestOptions
        };

        console.log(`Opa! Suite Listando usuários: ${targetUrl}`, JSON.stringify(payload));
        let response = await requestOpaSuite(targetUrl, 'GET', payload, config.token);

        // Se falhar com 404, tenta sem a barra final
        if (response.status === 404) {
            targetUrl = `${baseUrl}/api/v1/usuario`;
            response = await requestOpaSuite(targetUrl, 'GET', payload, config.token);
        }

        let parsed = null;
        try {
            parsed = JSON.parse(response.data);
        } catch (err) {
            console.warn('Opa! Suite resposta de usuários não é JSON estrito:', response.data);
        }

        if (parsed) {
            return res.status(response.status || 200).json(parsed);
        } else {
            return res.status(response.status || 200).send(response.data);
        }
    } catch (e) {
        console.error('Erro Opa! Suite Usuários:', e);
        res.status(500).json({ error: 'Erro ao listar usuários do Opa! Suite: ' + e.message });
    }
};

app.get('/api/opasuite/usuarios', handleOpaUsuarios);
app.post('/api/opasuite/usuarios', handleOpaUsuarios);

// Enviar Template no Opa! Suite
app.post('/api/opasuite/send-template', async (req, res) => {
    const companyId = req.headers['x-company-id'] || req.body.companyId;
    const { directUrl, directToken, contato, template, canal, departamento, atendente, atendenteId, id_atendente, opaUserId, allowSendingToStartedCustomerService } = req.body;
    try {
        const config = await getOpaSuiteConfig(companyId, directUrl, directToken);
        if (!config) {
            return res.status(400).json({ error: 'Integração Opa! Suite não configurada. Preencha URL e Token em Configurações.' });
        }

        const channelToSend = canal || config.canalId;
        if (!channelToSend) {
            return res.status(400).json({ error: 'ID do Canal de comunicação não informado.' });
        }

        const departmentToSend = departamento || config.departmentId;
        const attendantToSend = atendente || atendenteId || id_atendente || opaUserId;

        const baseUrl = config.url.replace(/\/+$/, '');
        const targetUrl = `${baseUrl}/api/v1/template/send`;
        console.log(`Opa! Suite Enviando template para: ${targetUrl} (canal: ${channelToSend}, depto: ${departmentToSend || 'nenhum'}, atendente: ${attendantToSend || 'nenhum'})`);

        // Formata o número do contato estritamente como a API do Opa! Suite exige: +55...
        let phoneFormatted = (contato?.canalCliente || contato?.telefone || '').toString().trim();
        const rawDigits = phoneFormatted.replace(/\D/g, '');
        const withDdi = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
        const canalCliente = `+${withDdi}`;

        const payload = {
            contato: {
                canalCliente: canalCliente,
                ...(contato?.nome ? { nome: contato.nome } : {})
            },
            template: {
                _id: template._id || template.id,
                ...(Array.isArray(template.variaveis) ? { variaveis: template.variaveis } : {}),
                ...(template.midiaAlternativa ? { midiaAlternativa: template.midiaAlternativa } : {})
            },
            canal: channelToSend,
            ...(departmentToSend ? { departamento: departmentToSend } : {}),
            ...(attendantToSend ? { id_atendente: attendantToSend, atendente: attendantToSend } : {}),
            allowSendingToStartedCustomerService: allowSendingToStartedCustomerService !== undefined ? Boolean(allowSendingToStartedCustomerService) : true
        };

        const response = await requestOpaSuite(targetUrl, 'POST', payload, config.token);
        let parsed = null;
        try {
            parsed = JSON.parse(response.data);
            return res.status(response.status || 200).json(parsed);
        } catch {
            return res.status(response.status || 200).send(response.data);
        }
    } catch (e) {
        console.error('Erro Opa! Suite Enviar Template:', e);
        res.status(500).json({ error: 'Erro ao enviar template Opa! Suite: ' + e.message });
    }
});

// --- ROTAS DE INTEGRAÇÃO WHATICKET (WHATSAPP) ---

// Helper para obter configuração Whaticket da empresa
async function getWhaticketConfig(companyId, directUrl, directToken) {
    if (directUrl && directToken) {
        let url = directUrl.trim();
        if (url.endsWith('/')) url = url.slice(0, -1);
        if (!url.startsWith('http')) url = 'https://' + url;
        return {
            url,
            token: directToken.trim(),
            defaultUserId: '',
            defaultQueueId: '',
            sendSignature: false,
            closeTicket: false,
            fastSend: true
        };
    }

    if (!companyId) return null;

    if (isDbAvailable) {
        try {
            const [rows] = await pool.query('SELECT whaticket_url, whaticket_token, whaticket_default_user_id, whaticket_default_queue_id, whaticket_send_signature, whaticket_close_ticket, whaticket_fast_send FROM companies WHERE id = ?', [companyId]);
            if (rows.length > 0 && rows[0].whaticket_token) {
                let url = (rows[0].whaticket_url || 'https://apichat.unityautomacoes.com.br').trim();
                if (url.endsWith('/')) url = url.slice(0, -1);
                if (!url.startsWith('http')) url = 'https://' + url;
                return {
                    url,
                    token: rows[0].whaticket_token.trim(),
                    defaultUserId: rows[0].whaticket_default_user_id || '',
                    defaultQueueId: rows[0].whaticket_default_queue_id || '',
                    sendSignature: Boolean(rows[0].whaticket_send_signature),
                    closeTicket: Boolean(rows[0].whaticket_close_ticket),
                    fastSend: rows[0].whaticket_fast_send !== 0
                };
            }
        } catch (e) {
            console.warn('⚠️ Falha ao buscar config Whaticket no MySQL:', e.message);
        }
    }

    const c = inMemoryStore.companies.find(comp => String(comp.id) === String(companyId)) || inMemoryStore.companies[0];
    if (c && c.whaticket_token) {
        let url = (c.whaticket_url || 'https://apichat.unityautomacoes.com.br').trim();
        if (url.endsWith('/')) url = url.slice(0, -1);
        if (!url.startsWith('http')) url = 'https://' + url;
        return {
            url,
            token: c.whaticket_token.trim(),
            defaultUserId: c.whaticket_default_user_id || '',
            defaultQueueId: c.whaticket_default_queue_id || '',
            sendSignature: Boolean(c.whaticket_send_signature),
            closeTicket: Boolean(c.whaticket_close_ticket),
            fastSend: c.whaticket_fast_send !== false
        };
    }

    return null;
}

// Formatação estrita para WhatsApp conforme documentação:
// "O número deve conter somente Código do País + DDD + Número, sem máscara ou caracteres especiais (ex.: 5511999998888)."
function formatWhaticketNumber(rawNumber) {
    if (!rawNumber) return '';
    let digits = String(rawNumber).replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10 || digits.length === 11) {
        digits = `55${digits}`;
    }
    return digits;
}

// Utilitário para requisições à API do Whaticket
async function requestWhaticketApi(targetUrl, method = 'POST', payload = null, token) {
    const headers = {
        'Authorization': `Bearer ${token}`
    };
    if (payload && (method === 'POST' || method === 'PUT')) {
        headers['Content-Type'] = 'application/json';
    }

    console.log(`[Whaticket] ${method} ${targetUrl}`, payload ? JSON.stringify(payload) : '');

    const fetchOptions = {
        method,
        headers
    };
    if (payload && (method === 'POST' || method === 'PUT')) {
        fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        data = text;
    }

    return {
        status: response.status,
        ok: response.ok,
        data
    };
}

// 1. Listar Conexões Disponíveis (GET /api/messages/connections)
const handleWhaticketConnections = async (req, res) => {
    const companyId = req.headers['x-company-id'] || req.body?.companyId || req.query.companyId;
    const directUrl = req.body?.directUrl || req.query.directUrl;
    const directToken = req.body?.directToken || req.query.directToken;

    try {
        const config = await getWhaticketConfig(companyId, directUrl, directToken);
        if (!config || !config.token) {
            return res.status(400).json({ error: 'Token do Whaticket não informado ou empresa não configurada.' });
        }

        const targetUrl = `${config.url}/api/messages/connections`;
        const result = await requestWhaticketApi(targetUrl, 'GET', null, config.token);
        return res.status(result.status || 200).json(result.data);
    } catch (e) {
        console.error('Erro Whaticket Connections:', e);
        res.status(500).json({ error: 'Erro ao consultar conexões do Whaticket: ' + e.message });
    }
};

app.get('/api/whaticket/connections', handleWhaticketConnections);
app.post('/api/whaticket/connections', handleWhaticketConnections);

// 2. Verificar Número no WhatsApp (POST /api/messages/checkNumber)
app.post('/api/whaticket/check-number', async (req, res) => {
    const companyId = req.headers['x-company-id'] || req.body?.companyId;
    const { directUrl, directToken, number } = req.body;

    try {
        const config = await getWhaticketConfig(companyId, directUrl, directToken);
        if (!config || !config.token) {
            return res.status(400).json({ error: 'Token do Whaticket não informado ou empresa não configurada.' });
        }

        const formattedNumber = formatWhaticketNumber(number);
        if (!formattedNumber) {
            return res.status(400).json({ error: 'Número de telefone não informado.' });
        }

        const targetUrl = `${config.url}/api/messages/checkNumber`;
        const result = await requestWhaticketApi(targetUrl, 'POST', { number: formattedNumber }, config.token);
        return res.status(result.status || 200).json(result.data);
    } catch (e) {
        console.error('Erro Whaticket Check Number:', e);
        res.status(500).json({ error: 'Erro ao verificar número no Whaticket: ' + e.message });
    }
});

// 3. Enviar Mensagens (Texto com/sem Ticket, Imagem por URL, Botões, Bulk)
app.post('/api/whaticket/send-message', async (req, res) => {
    const companyId = req.headers['x-company-id'] || req.body?.companyId;
    const { 
        directUrl, 
        directToken, 
        number, 
        body, 
        userId, 
        queueId, 
        sendSignature, 
        closeTicket, 
        fastSend, 
        url, 
        caption, 
        buttons, 
        footer, 
        type, 
        delay, 
        messages 
    } = req.body;

    try {
        const config = await getWhaticketConfig(companyId, directUrl, directToken);
        if (!config || !config.token) {
            return res.status(400).json({ error: 'Token do Whaticket não configurado. Acesse Configurações da Empresa para cadastrar o Token.' });
        }

        // Caso seja Envio em Lote (Bulk)
        if (Array.isArray(messages) && messages.length > 0) {
            const targetUrl = `${config.url}/api/messages/send/bulk`;
            const formattedMessages = messages.map(m => ({
                number: formatWhaticketNumber(m.number),
                body: m.body
            }));
            const payload = {
                delay: Number(delay) || 2000,
                messages: formattedMessages
            };
            const result = await requestWhaticketApi(targetUrl, 'POST', payload, config.token);
            return res.status(result.status || 200).json(result.data);
        }

        const formattedNumber = formatWhaticketNumber(number);
        if (!formattedNumber) {
            return res.status(400).json({ error: 'Número de telefone inválido ou não informado. Use DDD + Número (ex: 5511999998888).' });
        }

        // Caso seja Envio de Imagem por URL pública
        if (url && typeof url === 'string' && url.trim().length > 0) {
            const targetUrl = `${config.url}/api/messages/send/linkImage`;
            const payload = {
                number: formattedNumber,
                url: url.trim(),
                caption: caption || body || ''
            };
            const result = await requestWhaticketApi(targetUrl, 'POST', payload, config.token);
            return res.status(result.status || 200).json(result.data);
        }

        // Caso seja Mensagem com Botões Interativos
        if (Array.isArray(buttons) && buttons.length > 0) {
            const targetUrl = `${config.url}/api/messages/send/buttons`;
            const payload = {
                number: formattedNumber,
                body: body || 'Escolha uma opção:',
                footer: footer || '',
                type: type || 'buttons',
                buttons: buttons.map(b => ({
                    text: b.text,
                    id: String(b.id),
                    ...(b.queueId ? { queueId: Number(b.queueId) || b.queueId } : {}),
                    ...(b.userId ? { userId: Number(b.userId) || b.userId } : {})
                }))
            };
            const result = await requestWhaticketApi(targetUrl, 'POST', payload, config.token);
            return res.status(result.status || 200).json(result.data);
        }

        // Modo de envio: Verificar se deve usar Envio Sem Ticket (noTicket)
        const isFastSend = fastSend !== undefined ? Boolean(fastSend) : config.fastSend;

        if (isFastSend) {
            // 4. Envio Sem Ticket (Disparo Rápido)
            const targetUrl = `${config.url}/api/messages/send/noTicket`;
            const payload = {
                number: formattedNumber,
                body: body || ''
            };
            const result = await requestWhaticketApi(targetUrl, 'POST', payload, config.token);
            return res.status(result.status || 200).json(result.data);
        } else {
            // 1. Envio de Mensagem de Texto com Ticket
            const targetUrl = `${config.url}/api/messages/send`;
            const payload = {
                number: formattedNumber,
                body: body || '',
                userId: (userId !== undefined && userId !== null && userId !== '') ? String(userId) : (config.defaultUserId || ''),
                queueId: (queueId !== undefined && queueId !== null && queueId !== '') ? String(queueId) : (config.defaultQueueId || ''),
                sendSignature: sendSignature !== undefined ? Boolean(sendSignature) : config.sendSignature,
                closeTicket: closeTicket !== undefined ? Boolean(closeTicket) : config.closeTicket
            };
            const result = await requestWhaticketApi(targetUrl, 'POST', payload, config.token);
            return res.status(result.status || 200).json(result.data);
        }
    } catch (e) {
        console.error('Erro Whaticket Send Message:', e);
        res.status(500).json({ error: 'Erro ao enviar mensagem via Whaticket: ' + e.message });
    }
});

// --- ROTAS DO SISTEMA (Login, SaaS, etc) ---

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (isDbAvailable) {
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
                    return res.json({
                        success: true,
                        user: {
                            id: user.id.toString(),
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            permissions: typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions,
                            companyId: user.company_id ? user.company_id.toString() : null,
                            ixcEmployeeId: user.ixc_employee_id ? user.ixc_employee_id.toString() : null,
                            opaUserId: user.opa_user_id ? user.opa_user_id.toString() : null,
                            whaticketUserId: user.whaticket_user_id ? user.whaticket_user_id.toString() : null
                        },
                        company: companyData
                    });
                }
            } catch (dbErr) {
                console.warn('⚠️ Falha ao verificar login no MySQL, testando credenciais locais:', dbErr.message);
            }
        }

        // Fallback local caso o MySQL externo esteja inacessível
        const cleanEmail = (email || '').toLowerCase().trim();
        const user = inMemoryStore.users.find(u => u.email.toLowerCase() === cleanEmail && u.password === password && u.active);
        if (user) {
            const companyData = inMemoryStore.companies.find(c => c.id === user.company_id) || inMemoryStore.companies[0];
            return res.json({
                success: true,
                user: {
                    id: user.id.toString(),
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    permissions: user.permissions,
                    companyId: user.company_id ? user.company_id.toString() : '1',
                    ixcEmployeeId: user.ixc_employee_id ? user.ixc_employee_id.toString() : null,
                    opaUserId: user.opa_user_id ? user.opa_user_id.toString() : null,
                    whaticketUserId: user.whaticket_user_id ? user.whaticket_user_id.toString() : null
                },
                company: companyData
            });
        }

        res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/saas/plans', async (req, res) => {
    try { 
        if (isDbAvailable) {
            try {
                const [rows] = await pool.query('SELECT * FROM saas_plans'); 
                return res.json(rows); 
            } catch (e) {
                console.warn('⚠️ Falha ao listar planos no MySQL, usando fallback:', e.message);
            }
        }
        res.json(inMemoryStore.plans);
    } catch (e) { 
        res.json(inMemoryStore.plans); 
    }
});

app.get('/api/saas/companies', async (req, res) => {
    try { 
        if (isDbAvailable) {
            try {
                const [rows] = await pool.query(`SELECT c.*, p.name as plan_name FROM companies c LEFT JOIN saas_plans p ON c.plan_id = p.id ORDER BY c.created_at DESC`); 
                return res.json(rows); 
            } catch (e) {
                console.warn('⚠️ Falha ao listar empresas no MySQL, usando fallback:', e.message);
            }
        }
        res.json(inMemoryStore.companies);
    } catch (e) { 
        res.json(inMemoryStore.companies); 
    }
});

app.post('/api/saas/companies', async (req, res) => {
    const { name, cnpj, emailContact, planId, adminName, adminEmail, adminPassword } = req.body;
    try {
        if (isDbAvailable) {
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                const [resCo] = await connection.query(`INSERT INTO companies (name, cnpj, email_contact, plan_id, status, expiration_date) VALUES (?, ?, ?, ?, 'active', DATE_ADD(NOW(), INTERVAL 30 DAY))`, [name, cnpj, emailContact, parseInt(planId)]);
                await connection.query(`INSERT INTO users (company_id, name, email, password, role, active, permissions) VALUES (?, ?, ?, ?, 'super_admin', 1, ?)`, [resCo.insertId, adminName, adminEmail, adminPassword, JSON.stringify({ canManageCompany: true, canManageUsers: true, canViewScore: true })]);
                await connection.commit();
                return res.json({ success: true, companyId: resCo.insertId });
            } catch (error) { 
                await connection.rollback(); 
                console.warn('⚠️ Erro ao inserir empresa no MySQL:', error.message);
            } finally { 
                connection.release(); 
            }
        }
        const newCoId = inMemoryStore.companies.length + 1;
        inMemoryStore.companies.push({
            id: newCoId,
            name,
            cnpj,
            email_contact: emailContact,
            plan_id: parseInt(planId),
            plan_name: inMemoryStore.plans.find(p => p.id === parseInt(planId))?.name || 'Profissional',
            status: 'active',
            expiration_date: '2029-12-31',
            created_at: new Date()
        });
        inMemoryStore.users.push({
            id: inMemoryStore.users.length + 1,
            company_id: newCoId,
            name: adminName,
            email: adminEmail,
            password: adminPassword,
            role: 'super_admin',
            active: 1,
            permissions: { canManageCompany: true, canManageUsers: true, canViewScore: true }
        });
        res.json({ success: true, companyId: newCoId });
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

app.put('/api/saas/companies/:id', async (req, res) => {
    const { name, cnpj, emailContact, planId } = req.body;
    try { 
        if (isDbAvailable) {
            try {
                await pool.query(`UPDATE companies SET name = ?, cnpj = ?, email_contact = ?, plan_id = ? WHERE id = ?`, [name, cnpj, emailContact, parseInt(planId), req.params.id]); 
                return res.json({ success: true }); 
            } catch (e) {
                console.warn('⚠️ Erro ao atualizar empresa no MySQL:', e.message);
            }
        }
        const co = inMemoryStore.companies.find(c => String(c.id) === String(req.params.id));
        if (co) {
            if (name) co.name = name;
            if (cnpj) co.cnpj = cnpj;
            if (emailContact) co.email_contact = emailContact;
            if (planId) co.plan_id = parseInt(planId);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.patch('/api/saas/companies/:id/status', async (req, res) => {
    try { 
        if (isDbAvailable) {
            try {
                await pool.query('UPDATE companies SET status = ? WHERE id = ?', [req.body.status, req.params.id]); 
                return res.json({ success: true }); 
            } catch (e) {
                console.warn('⚠️ Erro ao atualizar status no MySQL:', e.message);
            }
        }
        const co = inMemoryStore.companies.find(c => String(c.id) === String(req.params.id));
        if (co) co.status = req.body.status;
        res.json({ success: true });
    } catch (e) { res.status(500).json({error: e.message}); }
});

// --- INICIALIZAÇÃO DO SERVIDOR COM VITE DEV MIDDLEWARE OU DIST ESTÁTICO ---
async function startServer() {
    initDatabase().catch(e => console.warn('Aviso DB inicial:', e.message));

    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction) {
        try {
            const { createServer: createViteServer } = require('vite');
            const vite = await createViteServer({
                server: { middlewareMode: true },
                appType: 'spa',
            });
            app.use(vite.middlewares);
            console.log('⚡ Vite dev middleware anexado com sucesso');
        } catch (viteError) {
            console.warn('⚠️ Não foi possível anexar o middleware do Vite, servindo dist:', viteError.message);
            app.use(express.static(path.join(__dirname, 'dist')));
            app.get('*', (req, res) => {
                res.sendFile(path.join(__dirname, 'dist', 'index.html'));
            });
        }
    } else {
        app.use(express.static(path.join(__dirname, 'dist')));
        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'dist', 'index.html'));
        });
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    });
}

startServer();
