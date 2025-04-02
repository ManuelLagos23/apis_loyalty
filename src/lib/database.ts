import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const dbConfig = {
  user: 'loyalty',
  host: 'localhost',
  database: 'max_loyalty',
  password: 'Admin2025',
  port: 5432,
};


export async function getPgConnection(): Promise<Client> {
  const client = new Client(dbConfig);
  await client.connect(); // Asegurarse de que se conecte al iniciar
  return client; 
}

export async function executePgQuery(query: string, values: string[] = []) {
  const client = await getPgConnection(); // Esperar a que devuelva el cliente conectado
  try {
    const result = await client.query(query, values);
    return result.rows; 
  } catch (err) {
    console.error('Error ejecutando la consulta en PostgreSQL:', err);
    throw err;
  } finally {
    client.end(); // Cerrar la conexión después de ejecutar la consulta
  }
}



