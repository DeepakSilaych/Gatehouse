import { createUser, findByUsername, listAll, remove } from './db.js';
import { hashPassword } from './auth.js';

const [,, command, ...args] = process.argv;

const commands = {
  async add() {
    const [username, password] = args;
    if (!username || !password) {
      console.error('Usage: node cli.js add <username> <password>');
      process.exit(1);
    }
    if (findByUsername(username)) {
      console.error(`User "${username}" already exists`);
      process.exit(1);
    }
    createUser(username, await hashPassword(password));
    console.log(`Created user "${username}"`);
  },

  list() {
    const users = listAll();
    if (!users.length) return console.log('No users');
    console.log('ID\tUsername\tCreated');
    users.forEach((u) => console.log(`${u.id}\t${u.username}\t${u.created_at}`));
  },

  remove() {
    const [username] = args;
    if (!username) {
      console.error('Usage: node cli.js remove <username>');
      process.exit(1);
    }
    const { changes } = remove(username);
    if (!changes) {
      console.error(`User "${username}" not found`);
      process.exit(1);
    }
    console.log(`Removed user "${username}"`);
  },
};

if (!commands[command]) {
  console.error('Commands: add, list, remove');
  process.exit(1);
}

await commands[command]();
