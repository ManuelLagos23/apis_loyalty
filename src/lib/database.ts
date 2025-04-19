import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const dbConfig = {
  user: 'postgresql',
  host: 'localhost',
  database: 'max_loyalty',
  password: '123456',
  port: 5432,
};


export async function getPgConnection(): Promise<Client> {
  const client = new Client(dbConfig);
  await client.connect(); 
  return client; 
}

export async function executePgQuery(query: string, values: string[] = []) {
  const client = await getPgConnection();
  try {
    const result = await client.query(query, values);
    return result.rows; 
  } catch (err) {
    console.error('Error ejecutando la consulta en PostgreSQL:', err);
    throw err;
  } finally {
    client.end();
  }
}



