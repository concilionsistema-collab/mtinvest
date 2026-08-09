const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  console.log('Connected to DB');

  try {
    await client.query(`ALTER TYPE "UsuarioPerfil" ADD VALUE 'ADMINISTRADOR'`);
    console.log('Added ADMINISTRADOR');
  } catch (e) {
    console.log('ADMINISTRADOR already exists or error:', e.message);
  }

  try {
    await client.query(`ALTER TYPE "UsuarioPerfil" ADD VALUE 'SOCIO'`);
    console.log('Added SOCIO');
  } catch (e) {
    console.log('SOCIO already exists or error:', e.message);
  }

  try {
    await client.query(`ALTER TABLE "usuario" ADD COLUMN "foto_perfil_url" TEXT`);
    console.log('Added foto_perfil_url column');
  } catch (e) {
    console.log('Column already exists or error:', e.message);
  }

  await client.end();
  console.log('Done');
}

run();
