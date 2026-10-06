import mongoose from 'mongoose';
import config from './env.js';
import logger from './logger.js';

export async function connectDb(uri = config.mongodbUri): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
  });
  logger.info({ db: conn.connection.name }, 'MongoDB connected');
  return conn;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
