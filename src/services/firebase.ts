import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserStats, Message } from '../types';

// Support both commonjs wrapped and standard JSON imports safely
const actualConfig = (firebaseConfig as any).default || firebaseConfig;

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(actualConfig) : getApp();

// Initialize Firestore with extreme resilience
let firestoreDb;
try {
  const dbId = actualConfig.firestoreDatabaseId;
  if (dbId && dbId.trim() !== '') {
    console.log(`Attempting to initialize Firestore with database ID: ${dbId}`);
    try {
      firestoreDb = getFirestore(app, dbId);
    } catch (innerErr) {
      console.warn("getFirestore with custom database ID failed, trying initializeFirestore:", innerErr);
      firestoreDb = initializeFirestore(app, {}, dbId);
    }
  } else {
    firestoreDb = getFirestore(app);
  }
} catch (error) {
  console.error("Failed to initialize custom Firestore. Falling back to default database instance.", error);
  try {
    firestoreDb = getFirestore(app);
  } catch (fallbackError) {
    console.error("Critical: Failed to initialize even default Firestore instance.", fallbackError);
    // As a final safety net, try empty initializeFirestore
    try {
      firestoreDb = initializeFirestore(app, {});
    } catch (finalError) {
      console.error("Unrecoverable Firestore Initialization Error:", finalError);
      throw finalError;
    }
  }
}

export const db = firestoreDb;
export const auth = getAuth(app);

// Test Firestore Connection on Boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection test: Success");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration. Client is offline.");
    } else {
      console.log("Firestore connection test run completed (expected default-deny block).");
    }
  }
}
testConnection();

// Error Handling System
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Fetch user stats from Firestore
export async function getUserStatsFirestore(userId: string): Promise<UserStats | null> {
  const path = `users/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) {
      return snap.data() as UserStats;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

// Write/Save user stats to Firestore
export async function saveUserStatsFirestore(userId: string, stats: UserStats): Promise<void> {
  const path = `users/${userId}`;
  try {
    const { workouts, ...restStats } = stats;
    await setDoc(doc(db, 'users', userId), {
      ...restStats,
      workouts: workouts || [],
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Fetch chat logs from Firestore
export async function getUserMessagesFirestore(userId: string): Promise<Message[]> {
  const path = `users/${userId}/messages`;
  try {
    const messagesCol = collection(db, 'users', userId, 'messages');
    const q = query(messagesCol, orderBy('timestamp', 'asc'));
    const snap = await getDocs(q);
    const msgs: Message[] = [];
    snap.forEach((d) => {
      const data = d.data();
      msgs.push({
        role: data.role,
        content: data.content,
        timestamp: data.timestamp
      });
    });
    return msgs;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

// Save a single chat message to Firestore
export async function saveMessageFirestore(userId: string, msg: Message): Promise<void> {
  const path = `users/${userId}/messages`;
  try {
    const messagesCol = collection(db, 'users', userId, 'messages');
    const msgId = msg.timestamp.toString() + '_' + Math.random().toString(36).substring(2, 7);
    await setDoc(doc(messagesCol, msgId), {
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

// Clear all message history for a user
export async function clearUserMessagesFirestore(userId: string): Promise<void> {
  const path = `users/${userId}/messages`;
  try {
    const messagesCol = collection(db, 'users', userId, 'messages');
    const snap = await getDocs(messagesCol);
    const deletePromises: Promise<void>[] = [];
    snap.forEach((d) => {
      deletePromises.push(deleteDoc(d.ref));
    });
    await Promise.all(deletePromises);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
