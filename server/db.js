// Single shared Prisma client. Keep a global reference in dev to avoid
// spawning a new client on every file reload.
const { PrismaClient } = require('@prisma/client');

const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
