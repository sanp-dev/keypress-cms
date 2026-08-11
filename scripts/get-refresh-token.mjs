// scripts/get-refresh-token.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { URL } from 'url';

const envPath = path.join(process.cwd(), '.env');

// Read .env file helper
function readEnv() {
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env file not found at', envPath);
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let key = match[1];
      let value = match[2] || '';
      if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.length > 0 && value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      env[key] = value.trim();
    }
  });
  return env;
}

// Update .env file helper
function updateEnv(key, newValue) {
  let content = fs.readFileSync(envPath, 'utf8');
  const regex = new RegExp(`^(${key}\\s*=\\s*)(.*)$`, 'm');

  if (regex.test(content)) {
    content = content.replace(regex, `$1${newValue}`);
  } else {
    content += `\n${key}=${newValue}`;
  }
  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`Successfully updated ${key} in .env file.`);
}

async function run() {
  const env = readEnv();
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Error: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in .env');
    process.exit(1);
  }

  const PORT = 4321;
  const redirectUri = `http://localhost:${PORT}/api/auth/google/callback`;

  // Construct auth URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('scope', 'https://www.googleapis.com/auth/webmasters');
  authUrl.searchParams.append('access_type', 'offline');
  authUrl.searchParams.append('prompt', 'consent');

  console.log('\n======================================================');
  console.log('GOOGLE OAUTH REFRESH TOKEN GENERATOR');
  console.log('======================================================');
  console.log('\n1. Opening server on', redirectUri);
  console.log('2. Please copy and open the following link in your browser to authorize access to Google Search Console:\n');
  console.log('\x1b[36m%s\x1b[0m', authUrl.toString());
  console.log('\n======================================================\n');

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);

    if (reqUrl.pathname === '/api/auth/google/callback') {
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        console.error('Authorization failed:', error);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Authorization Failed</h1><p>Error: ${error}</p>`);
        server.close();
        process.exit(1);
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Error</h1><p>No authorization code received.</p>');
        return;
      }

      console.log('Received authorization code, exchanging for tokens...');

      try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            code: code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }).toString(),
        });

        const data = await tokenResponse.json();

        if (!tokenResponse.ok) {
          throw new Error(data.error_description || data.error || 'Failed to fetch tokens');
        }

        const refreshToken = data.refresh_token;
        if (!refreshToken) {
          throw new Error('No refresh token received. Make sure you select "consent" and did not just re-approve a previous session.');
        }

        console.log('\n======================================================');
        console.log('SUCCESSFULLY OBTAINED REFRESH TOKEN!');
        console.log('======================================================');
        console.log('Refresh Token:', refreshToken);
        console.log('======================================================\n');

        updateEnv('GOOGLE_REFRESH_TOKEN', refreshToken);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 50px; background-color: #0f172a; color: #f8fafc;">
              <div style="max-width: 500px; margin: 0 auto; background-color: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                <div style="color: #22c55e; font-size: 48px; margin-bottom: 20px;">✓</div>
                <h1 style="margin-bottom: 10px;">Authorization Successful!</h1>
                <p style="color: #94a3b8; font-size: 16px; line-height: 1.5;">
                  The new refresh token has been received and automatically saved to your <strong>.env</strong> file.
                </p>
                <p style="color: #94a3b8; font-size: 14px; margin-top: 20px;">
                  You can close this tab and return to the terminal.
                </p>
              </div>
            </body>
          </html>
        `);

        // Wait a second then exit
        setTimeout(() => {
          server.close();
          console.log('Exiting...');
          process.exit(0);
        }, 1000);

      } catch (err) {
        console.error('Error exchanging code:', err.message);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>Error Exchanging Code</h1><p>${err.message}</p>`);
        server.close();
        process.exit(1);
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

run();
