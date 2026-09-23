/**
 * Secure first-admin bootstrap script.
 * Usage: npm run create-admin
 *
 * Deliberately NOT an HTTP endpoint and NOT a hard-coded credential -
 * per the project security rules, admin accounts are only created via
 * this local script (requires database/server access) or later, by an
 * existing SUPER_ADMIN through the dashboard.
 */
import readline from 'readline';
import { prisma } from '../config/prisma';
import { hashPassword } from '../utils/auth';

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Minimal hidden input for the password prompt (avoids echoing to terminal).
function askHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(query);
    stdin.resume();
    stdin.setRawMode?.(true);
    let input = '';
    const onData = (char: Buffer) => {
      const c = char.toString('utf8');
      if (c === '\n' || c === '\r' || c === '\u0004') {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (c === '\u0003') {
        process.exit(1);
      } else if (c === '\u007f') {
        input = input.slice(0, -1);
      } else {
        input += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('=== ALMUS CHAT: Create First Super Admin ===\n');
  const name = await ask(rl, 'Full name: ');
  const email = await ask(rl, 'Email: ');
  rl.close();
  const password = await askHidden('Password (min 8 chars, hidden): ');

  if (!name || !email || password.length < 8) {
    console.error('\nAll fields are required and password must be at least 8 characters.');
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.error('\nAn admin with that email already exists.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.create({
    data: { name, email, passwordHash, role: 'SUPER_ADMIN' },
  });

  console.log(`\nSUPER_ADMIN created: ${admin.email} (id: ${admin.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
