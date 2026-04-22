#!/usr/bin/env node

import { program } from 'commander';
import { init } from '../cli/init.js';
import { addSite } from '../cli/add-site.js';
import { generateAll } from '../cli/generate.js';
import { addUser, removeUser, listUsers } from '../cli/users.js';

program.name('gatehouse').description('Auth gateway for your services').version('1.0.0');

program.command('init').description('Interactive setup wizard').action(init);

program.command('add-site').description('Add or update a site').action(addSite);

program
  .command('generate')
  .description('Regenerate proxy configs from gatehouse.json')
  .action(() => {
    console.log('  Generating configs...');
    generateAll();
  });

program
  .command('add-user <username> <password>')
  .description('Create a user')
  .action(addUser);

program
  .command('remove-user <username>')
  .description('Remove a user')
  .action(removeUser);

program.command('list-users').description('List all users').action(listUsers);

program.parse();
