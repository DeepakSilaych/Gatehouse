import { execSync } from 'child_process';

const SERVICE = 'auth-service';
const CLI_PATH = 'src/cli.js';

function exec(args) {
  try {
    execSync(`docker compose exec ${SERVICE} node ${CLI_PATH} ${args}`, {
      stdio: 'inherit',
    });
  } catch {
    process.exit(1);
  }
}

export function addUser(username, password) {
  if (!username || !password) {
    console.error('Usage: gatehouse add-user <username> <password>');
    process.exit(1);
  }
  exec(`add ${username} ${password}`);
}

export function removeUser(username) {
  if (!username) {
    console.error('Usage: gatehouse remove-user <username>');
    process.exit(1);
  }
  exec(`remove ${username}`);
}

export function listUsers() {
  exec('list');
}
