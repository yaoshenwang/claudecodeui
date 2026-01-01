import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

const c = {
    info: (text) => `${colors.cyan}${text}${colors.reset}`,
    bright: (text) => `${colors.bright}${text}${colors.reset}`,
    dim: (text) => `${colors.dim}${text}${colors.reset}`,
};

// Use DATABASE_PATH environment variable if set, otherwise use default location
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'auth.db');
const INIT_SQL_PATH = path.join(__dirname, 'init.sql');

// Ensure database directory exists if custom path is provided
if (process.env.DATABASE_PATH) {
  const dbDir = path.dirname(DB_PATH);
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }
  } catch (error) {
    console.error(`Failed to create database directory ${dbDir}:`, error.message);
    throw error;
  }
}

// Create database connection
const db = new Database(DB_PATH);

// Show app installation path prominently
const appInstallPath = path.join(__dirname, '../..');
console.log('');
console.log(c.dim('═'.repeat(60)));
console.log(`${c.info('[INFO]')} App Installation: ${c.bright(appInstallPath)}`);
console.log(`${c.info('[INFO]')} Database: ${c.dim(path.relative(appInstallPath, DB_PATH))}`);
if (process.env.DATABASE_PATH) {
  console.log(`       ${c.dim('(Using custom DATABASE_PATH from environment)')}`);
}
console.log(c.dim('═'.repeat(60)));
console.log('');

const runMigrations = () => {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const columnNames = tableInfo.map(col => col.name);

    if (!columnNames.includes('git_name')) {
      console.log('Running migration: Adding git_name column');
      db.exec('ALTER TABLE users ADD COLUMN git_name TEXT');
    }

    if (!columnNames.includes('git_email')) {
      console.log('Running migration: Adding git_email column');
      db.exec('ALTER TABLE users ADD COLUMN git_email TEXT');
    }

    if (!columnNames.includes('has_completed_onboarding')) {
      console.log('Running migration: Adding has_completed_onboarding column');
      db.exec('ALTER TABLE users ADD COLUMN has_completed_onboarding BOOLEAN DEFAULT 0');
    }

    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error.message);
    throw error;
  }
};

// Initialize database with schema
const initializeDatabase = async () => {
  try {
    const initSQL = fs.readFileSync(INIT_SQL_PATH, 'utf8');
    db.exec(initSQL);
    console.log('Database initialized successfully');
    runMigrations();
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  }
};

// User database operations
const userDb = {
  // Check if any users exist
  hasUsers: () => {
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
      return row.count > 0;
    } catch (err) {
      throw err;
    }
  },

  // Create a new user
  createUser: (username, passwordHash) => {
    try {
      const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
      const result = stmt.run(username, passwordHash);
      return { id: result.lastInsertRowid, username };
    } catch (err) {
      throw err;
    }
  },

  // Get user by username
  getUserByUsername: (username) => {
    try {
      const row = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update last login time
  updateLastLogin: (userId) => {
    try {
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    } catch (err) {
      throw err;
    }
  },

  // Get user by ID
  getUserById: (userId) => {
    try {
      const row = db.prepare('SELECT id, username, created_at, last_login FROM users WHERE id = ? AND is_active = 1').get(userId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  getFirstUser: () => {
    try {
      const row = db.prepare('SELECT id, username, created_at, last_login FROM users WHERE is_active = 1 LIMIT 1').get();
      return row;
    } catch (err) {
      throw err;
    }
  },

  updateGitConfig: (userId, gitName, gitEmail) => {
    try {
      const stmt = db.prepare('UPDATE users SET git_name = ?, git_email = ? WHERE id = ?');
      stmt.run(gitName, gitEmail, userId);
    } catch (err) {
      throw err;
    }
  },

  getGitConfig: (userId) => {
    try {
      const row = db.prepare('SELECT git_name, git_email FROM users WHERE id = ?').get(userId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  completeOnboarding: (userId) => {
    try {
      const stmt = db.prepare('UPDATE users SET has_completed_onboarding = 1 WHERE id = ?');
      stmt.run(userId);
    } catch (err) {
      throw err;
    }
  },

  hasCompletedOnboarding: (userId) => {
    try {
      const row = db.prepare('SELECT has_completed_onboarding FROM users WHERE id = ?').get(userId);
      return row?.has_completed_onboarding === 1;
    } catch (err) {
      throw err;
    }
  }
};

// API Keys database operations
const apiKeysDb = {
  // Generate a new API key
  generateApiKey: () => {
    return 'ck_' + crypto.randomBytes(32).toString('hex');
  },

  // Create a new API key
  createApiKey: (userId, keyName) => {
    try {
      const apiKey = apiKeysDb.generateApiKey();
      const stmt = db.prepare('INSERT INTO api_keys (user_id, key_name, api_key) VALUES (?, ?, ?)');
      const result = stmt.run(userId, keyName, apiKey);
      return { id: result.lastInsertRowid, keyName, apiKey };
    } catch (err) {
      throw err;
    }
  },

  // Get all API keys for a user
  getApiKeys: (userId) => {
    try {
      const rows = db.prepare('SELECT id, key_name, api_key, created_at, last_used, is_active FROM api_keys WHERE user_id = ? ORDER BY created_at DESC').all(userId);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Validate API key and get user
  validateApiKey: (apiKey) => {
    try {
      const row = db.prepare(`
        SELECT u.id, u.username, ak.id as api_key_id
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.api_key = ? AND ak.is_active = 1 AND u.is_active = 1
      `).get(apiKey);

      if (row) {
        // Update last_used timestamp
        db.prepare('UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(row.api_key_id);
      }

      return row;
    } catch (err) {
      throw err;
    }
  },

  // Delete an API key
  deleteApiKey: (userId, apiKeyId) => {
    try {
      const stmt = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?');
      const result = stmt.run(apiKeyId, userId);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Toggle API key active status
  toggleApiKey: (userId, apiKeyId, isActive) => {
    try {
      const stmt = db.prepare('UPDATE api_keys SET is_active = ? WHERE id = ? AND user_id = ?');
      const result = stmt.run(isActive ? 1 : 0, apiKeyId, userId);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  }
};

// User credentials database operations (for GitHub tokens, GitLab tokens, etc.)
const credentialsDb = {
  // Create a new credential
  createCredential: (userId, credentialName, credentialType, credentialValue, description = null) => {
    try {
      const stmt = db.prepare('INSERT INTO user_credentials (user_id, credential_name, credential_type, credential_value, description) VALUES (?, ?, ?, ?, ?)');
      const result = stmt.run(userId, credentialName, credentialType, credentialValue, description);
      return { id: result.lastInsertRowid, credentialName, credentialType };
    } catch (err) {
      throw err;
    }
  },

  // Get all credentials for a user, optionally filtered by type
  getCredentials: (userId, credentialType = null) => {
    try {
      let query = 'SELECT id, credential_name, credential_type, description, created_at, is_active FROM user_credentials WHERE user_id = ?';
      const params = [userId];

      if (credentialType) {
        query += ' AND credential_type = ?';
        params.push(credentialType);
      }

      query += ' ORDER BY created_at DESC';

      const rows = db.prepare(query).all(...params);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get active credential value for a user by type (returns most recent active)
  getActiveCredential: (userId, credentialType) => {
    try {
      const row = db.prepare('SELECT credential_value FROM user_credentials WHERE user_id = ? AND credential_type = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1').get(userId, credentialType);
      return row?.credential_value || null;
    } catch (err) {
      throw err;
    }
  },

  // Delete a credential
  deleteCredential: (userId, credentialId) => {
    try {
      const stmt = db.prepare('DELETE FROM user_credentials WHERE id = ? AND user_id = ?');
      const result = stmt.run(credentialId, userId);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Toggle credential active status
  toggleCredential: (userId, credentialId, isActive) => {
    try {
      const stmt = db.prepare('UPDATE user_credentials SET is_active = ? WHERE id = ? AND user_id = ?');
      const result = stmt.run(isActive ? 1 : 0, credentialId, userId);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  }
};

// Backward compatibility - keep old names pointing to new system
const githubTokensDb = {
  createGithubToken: (userId, tokenName, githubToken, description = null) => {
    return credentialsDb.createCredential(userId, tokenName, 'github_token', githubToken, description);
  },
  getGithubTokens: (userId) => {
    return credentialsDb.getCredentials(userId, 'github_token');
  },
  getActiveGithubToken: (userId) => {
    return credentialsDb.getActiveCredential(userId, 'github_token');
  },
  deleteGithubToken: (userId, tokenId) => {
    return credentialsDb.deleteCredential(userId, tokenId);
  },
  toggleGithubToken: (userId, tokenId, isActive) => {
    return credentialsDb.toggleCredential(userId, tokenId, isActive);
  }
};

// CC-Switch: Provider database operations
const ccProvidersDb = {
  // Get all providers for an app type
  getAll: (appType = 'claude') => {
    try {
      const rows = db.prepare(`
        SELECT * FROM cc_providers
        WHERE app_type = ?
        ORDER BY sort_index ASC, created_at DESC
      `).all(appType);
      return rows.map(row => ({
        ...row,
        settings_config: JSON.parse(row.settings_config || '{}'),
        is_current: !!row.is_current
      }));
    } catch (err) {
      throw err;
    }
  },

  // Get current provider
  getCurrent: (appType = 'claude') => {
    try {
      const row = db.prepare(`
        SELECT * FROM cc_providers
        WHERE app_type = ? AND is_current = 1
        LIMIT 1
      `).get(appType);
      if (!row) return null;
      return {
        ...row,
        settings_config: JSON.parse(row.settings_config || '{}'),
        is_current: true
      };
    } catch (err) {
      throw err;
    }
  },

  // Get provider by ID
  getById: (id) => {
    try {
      const row = db.prepare('SELECT * FROM cc_providers WHERE id = ?').get(id);
      if (!row) return null;
      return {
        ...row,
        settings_config: JSON.parse(row.settings_config || '{}'),
        is_current: !!row.is_current
      };
    } catch (err) {
      throw err;
    }
  },

  // Create or update provider
  upsert: (provider) => {
    try {
      const { id, name, app_type = 'claude', settings_config, website_url, category, notes, icon, icon_color, is_current, sort_index } = provider;
      const configStr = typeof settings_config === 'string' ? settings_config : JSON.stringify(settings_config || {});

      const stmt = db.prepare(`
        INSERT INTO cc_providers (id, name, app_type, settings_config, website_url, category, notes, icon, icon_color, is_current, sort_index, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          settings_config = excluded.settings_config,
          website_url = excluded.website_url,
          category = excluded.category,
          notes = excluded.notes,
          icon = excluded.icon,
          icon_color = excluded.icon_color,
          is_current = excluded.is_current,
          sort_index = excluded.sort_index,
          updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(id, name, app_type, configStr, website_url || null, category || 'custom', notes || null, icon || null, icon_color || '#6366f1', is_current ? 1 : 0, sort_index || 0);
      return { id, success: true };
    } catch (err) {
      throw err;
    }
  },

  // Delete provider
  delete: (id) => {
    try {
      const stmt = db.prepare('DELETE FROM cc_providers WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Switch current provider
  switchTo: (id, appType = 'claude') => {
    try {
      db.transaction(() => {
        // Clear current for app type
        db.prepare('UPDATE cc_providers SET is_current = 0 WHERE app_type = ?').run(appType);
        // Set new current
        db.prepare('UPDATE cc_providers SET is_current = 1 WHERE id = ? AND app_type = ?').run(id, appType);
      })();
      return true;
    } catch (err) {
      throw err;
    }
  },

  // Update sort order
  updateSortOrder: (updates) => {
    try {
      const stmt = db.prepare('UPDATE cc_providers SET sort_index = ? WHERE id = ?');
      db.transaction(() => {
        for (const { id, sortIndex } of updates) {
          stmt.run(sortIndex, id);
        }
      })();
      return true;
    } catch (err) {
      throw err;
    }
  }
};

// CC-Switch: Prompts database operations
const ccPromptsDb = {
  // Get all prompts for an app type
  getAll: (appType = 'claude') => {
    try {
      const rows = db.prepare(`
        SELECT * FROM cc_prompts
        WHERE app_type = ?
        ORDER BY sort_index ASC, created_at DESC
      `).all(appType);
      return rows.map(row => ({
        ...row,
        is_enabled: !!row.is_enabled
      }));
    } catch (err) {
      throw err;
    }
  },

  // Get enabled prompt
  getEnabled: (appType = 'claude') => {
    try {
      const row = db.prepare(`
        SELECT * FROM cc_prompts
        WHERE app_type = ? AND is_enabled = 1
        LIMIT 1
      `).get(appType);
      if (!row) return null;
      return { ...row, is_enabled: true };
    } catch (err) {
      throw err;
    }
  },

  // Create or update prompt
  upsert: (prompt) => {
    try {
      const { id, app_type = 'claude', name, content, description, is_enabled, sort_index } = prompt;

      const stmt = db.prepare(`
        INSERT INTO cc_prompts (id, app_type, name, content, description, is_enabled, sort_index, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          content = excluded.content,
          description = excluded.description,
          is_enabled = excluded.is_enabled,
          sort_index = excluded.sort_index,
          updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(id, app_type, name, content, description || null, is_enabled ? 1 : 0, sort_index || 0);
      return { id, success: true };
    } catch (err) {
      throw err;
    }
  },

  // Delete prompt
  delete: (id) => {
    try {
      const stmt = db.prepare('DELETE FROM cc_prompts WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Enable prompt (disable others)
  enable: (id, appType = 'claude') => {
    try {
      db.transaction(() => {
        db.prepare('UPDATE cc_prompts SET is_enabled = 0 WHERE app_type = ?').run(appType);
        db.prepare('UPDATE cc_prompts SET is_enabled = 1 WHERE id = ?').run(id);
      })();
      return true;
    } catch (err) {
      throw err;
    }
  },

  // Disable all prompts for app type
  disableAll: (appType = 'claude') => {
    try {
      db.prepare('UPDATE cc_prompts SET is_enabled = 0 WHERE app_type = ?').run(appType);
      return true;
    } catch (err) {
      throw err;
    }
  }
};

// CC-Switch: MCP Servers database operations
const ccMcpServersDb = {
  // Get all MCP servers
  getAll: () => {
    try {
      const rows = db.prepare(`
        SELECT * FROM cc_mcp_servers
        ORDER BY sort_index ASC, created_at DESC
      `).all();
      return rows.map(row => ({
        ...row,
        args: JSON.parse(row.args || '[]'),
        env: JSON.parse(row.env || '{}'),
        enabled_claude: !!row.enabled_claude,
        enabled_codex: !!row.enabled_codex,
        enabled_gemini: !!row.enabled_gemini
      }));
    } catch (err) {
      throw err;
    }
  },

  // Get MCP servers enabled for a specific app
  getForApp: (appType = 'claude') => {
    try {
      const column = `enabled_${appType}`;
      const rows = db.prepare(`
        SELECT * FROM cc_mcp_servers
        WHERE ${column} = 1
        ORDER BY sort_index ASC, created_at DESC
      `).all();
      return rows.map(row => ({
        ...row,
        args: JSON.parse(row.args || '[]'),
        env: JSON.parse(row.env || '{}')
      }));
    } catch (err) {
      throw err;
    }
  },

  // Create or update MCP server
  upsert: (server) => {
    try {
      const { id, name, command, args, env, enabled_claude, enabled_codex, enabled_gemini, description, sort_index } = server;
      const argsStr = typeof args === 'string' ? args : JSON.stringify(args || []);
      const envStr = typeof env === 'string' ? env : JSON.stringify(env || {});

      const stmt = db.prepare(`
        INSERT INTO cc_mcp_servers (id, name, command, args, env, enabled_claude, enabled_codex, enabled_gemini, description, sort_index, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          command = excluded.command,
          args = excluded.args,
          env = excluded.env,
          enabled_claude = excluded.enabled_claude,
          enabled_codex = excluded.enabled_codex,
          enabled_gemini = excluded.enabled_gemini,
          description = excluded.description,
          sort_index = excluded.sort_index,
          updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(id, name, command, argsStr, envStr, enabled_claude ? 1 : 0, enabled_codex ? 1 : 0, enabled_gemini ? 1 : 0, description || null, sort_index || 0);
      return { id, success: true };
    } catch (err) {
      throw err;
    }
  },

  // Delete MCP server
  delete: (id) => {
    try {
      const stmt = db.prepare('DELETE FROM cc_mcp_servers WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Toggle app enabled state
  toggleApp: (id, appType, enabled) => {
    try {
      const column = `enabled_${appType}`;
      const stmt = db.prepare(`UPDATE cc_mcp_servers SET ${column} = ? WHERE id = ?`);
      stmt.run(enabled ? 1 : 0, id);
      return true;
    } catch (err) {
      throw err;
    }
  }
};

// CC-Switch: Skills repositories database operations
const ccSkillReposDb = {
  // Get all skill repos
  getAll: () => {
    try {
      const rows = db.prepare('SELECT * FROM cc_skill_repos ORDER BY created_at DESC').all();
      return rows.map(row => ({
        ...row,
        is_enabled: !!row.is_enabled
      }));
    } catch (err) {
      throw err;
    }
  },

  // Add skill repo
  add: (owner, name, branch = 'main') => {
    try {
      const stmt = db.prepare('INSERT OR REPLACE INTO cc_skill_repos (owner, name, branch) VALUES (?, ?, ?)');
      const result = stmt.run(owner, name, branch);
      return { id: result.lastInsertRowid, success: true };
    } catch (err) {
      throw err;
    }
  },

  // Remove skill repo
  remove: (owner, name) => {
    try {
      const stmt = db.prepare('DELETE FROM cc_skill_repos WHERE owner = ? AND name = ?');
      const result = stmt.run(owner, name);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Toggle repo enabled
  toggle: (id, enabled) => {
    try {
      const stmt = db.prepare('UPDATE cc_skill_repos SET is_enabled = ? WHERE id = ?');
      stmt.run(enabled ? 1 : 0, id);
      return true;
    } catch (err) {
      throw err;
    }
  }
};

// CC-Switch: Speed test database operations
const ccSpeedTestsDb = {
  // Save test result
  save: (providerId, appType, responseTimeMs, httpStatus, status) => {
    try {
      const stmt = db.prepare(`
        INSERT INTO cc_speed_tests (provider_id, app_type, response_time_ms, http_status, status)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(providerId, appType, responseTimeMs, httpStatus, status);
      return { id: result.lastInsertRowid, success: true };
    } catch (err) {
      throw err;
    }
  },

  // Get latest results for all providers
  getLatest: (appType = 'claude') => {
    try {
      const rows = db.prepare(`
        SELECT st.*, p.name as provider_name
        FROM cc_speed_tests st
        JOIN cc_providers p ON st.provider_id = p.id
        WHERE st.app_type = ?
        AND st.id IN (
          SELECT MAX(id) FROM cc_speed_tests WHERE app_type = ? GROUP BY provider_id
        )
        ORDER BY st.tested_at DESC
      `).all(appType, appType);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Clean old results (keep last N per provider)
  cleanup: (keepCount = 10) => {
    try {
      db.prepare(`
        DELETE FROM cc_speed_tests
        WHERE id NOT IN (
          SELECT id FROM (
            SELECT id, provider_id,
            ROW_NUMBER() OVER (PARTITION BY provider_id ORDER BY tested_at DESC) as rn
            FROM cc_speed_tests
          ) WHERE rn <= ?
        )
      `).run(keepCount);
      return true;
    } catch (err) {
      throw err;
    }
  }
};

// CC-Switch: Settings database operations
const ccSettingsDb = {
  get: (key) => {
    try {
      const row = db.prepare('SELECT value FROM cc_settings WHERE key = ?').get(key);
      return row ? JSON.parse(row.value) : null;
    } catch (err) {
      throw err;
    }
  },

  set: (key, value) => {
    try {
      const valueStr = JSON.stringify(value);
      db.prepare(`
        INSERT INTO cc_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `).run(key, valueStr);
      return true;
    } catch (err) {
      throw err;
    }
  },

  getAll: () => {
    try {
      const rows = db.prepare('SELECT * FROM cc_settings').all();
      const result = {};
      for (const row of rows) {
        result[row.key] = JSON.parse(row.value);
      }
      return result;
    } catch (err) {
      throw err;
    }
  }
};

export {
  db,
  initializeDatabase,
  userDb,
  apiKeysDb,
  credentialsDb,
  githubTokensDb, // Backward compatibility
  ccProvidersDb,
  ccPromptsDb,
  ccMcpServersDb,
  ccSkillReposDb,
  ccSpeedTestsDb,
  ccSettingsDb
};