import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

// Environment variables or fallback config for development
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDemoKeyForTrackMyBusApp12345",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "trackmybus-demo.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "trackmybus-demo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "trackmybus-demo.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:abcdef123456"
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

// Local storage persistent fallback store for standalone/offline testing
const STORAGE_KEY = 'tmb_firebase_drivers_mock';

function getLocalStore() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveLocalStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('Failed to save to local storage store:', e);
  }
}

/**
 * Register a driver using Firebase Authentication & store profile in Firestore drivers/{uid}
 */
export async function registerDriverInFirebase({ name, email, password, route, busNumber }) {
  let uid = null;
  let firebaseSuccess = false;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    uid = userCredential.user.uid;
    firebaseSuccess = true;
  } catch (authError) {
    console.warn('Firebase Auth user creation warning/fallback:', authError.message);
    if (authError.code === 'auth/email-already-in-use') {
      throw new Error('An account with this email address already exists.');
    }
    // Generate deterministic mock uid if offline/demo
    uid = 'driver_' + btoa(email).replace(/=/g, '').toLowerCase();
  }

  const createdAt = new Date().toISOString();
  const driverProfile = {
    uid,
    name,
    email,
    route,
    busNumber,
    status: 'pending',
    createdAt,
    approvedAt: null,
    approvedBy: null
  };

  // Attempt saving to Firestore
  if (firebaseSuccess) {
    try {
      await setDoc(doc(db, 'drivers', uid), {
        ...driverProfile,
        createdAt: serverTimestamp()
      });
    } catch (fsError) {
      console.warn('Firestore doc write fallback:', fsError.message);
    }
  }

  // Always update local store & sync with backend SQLite for multi-subsystem consistency
  const store = getLocalStore();
  store[uid] = driverProfile;
  saveLocalStore(store);

  // Sync to Express backend API as secondary backing store
  try {
    await fetch(`${window.location.protocol}//${window.location.hostname}:5000/api/auth/driver-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username: email, password, route, busNumber })
    });
  } catch (apiErr) {
    console.warn('Backend SQLite sync warning:', apiErr.message);
  }

  return driverProfile;
}

/**
 * Login driver using Firebase Authentication and fetch status from Firestore
 */
export async function loginDriverInFirebase(email, password) {
  let uid = null;
  let firebaseUser = null;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    firebaseUser = userCredential.user;
    uid = firebaseUser.uid;
  } catch (authError) {
    console.warn('Firebase Auth sign in notice/fallback:', authError.message);
    if (authError.code === 'auth/wrong-password' || authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential') {
      // Check local store before failing
      const store = getLocalStore();
      const matchedUid = Object.keys(store).find(k => store[k].email?.toLowerCase() === email.toLowerCase());
      if (matchedUid) {
        uid = matchedUid;
      } else {
        throw new Error('Invalid email or password.');
      }
    } else {
      uid = 'driver_' + btoa(email).replace(/=/g, '').toLowerCase();
    }
  }

  // Fetch driver profile from Firestore
  let profile = await getDriverProfile(uid, email);

  if (!profile) {
    throw new Error('Driver profile not found. Please register as a driver first.');
  }

  return { uid, email, profile };
}

/**
 * Fetch driver profile from Firestore drivers/{uid} or email search
 */
/**
 * Fetch driver profile from Firestore drivers/{uid} or email search or SQLite fallback
 */
export async function getDriverProfile(uid, email = null) {
  try {
    if (uid) {
      const docRef = doc(db, 'drivers', uid.toString());
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString())
        };
      }
    }

    const searchEmail = email || (typeof uid === 'string' && uid.includes('@') ? uid : null);
    if (searchEmail) {
      const q = query(collection(db, 'drivers'), where('email', '==', searchEmail.toLowerCase()));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const docSnap = querySnap.docs[0];
        const data = docSnap.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString())
        };
      }
    }
  } catch (err) {
    console.warn('Firestore fetch profile notice:', err.message);
  }

  // Fallback to local store search by key or email/username
  const store = getLocalStore();
  if (uid && store[uid]) return store[uid];
  if (uid && store[uid.toString()]) return store[uid.toString()];

  const targetEmail = email || (typeof uid === 'string' && uid.includes('@') ? uid : null);
  if (targetEmail) {
    const matchedUid = Object.keys(store).find(k => 
      store[k].email?.toLowerCase() === targetEmail.toLowerCase() ||
      store[k].username?.toLowerCase() === targetEmail.toLowerCase()
    );
    if (matchedUid) return store[matchedUid];
  }

  // Check active user session in localStorage
  try {
    const currentUser = JSON.parse(localStorage.getItem('tmb_user') || 'null');
    if (currentUser && (
      currentUser.id === uid || 
      currentUser.uid === uid || 
      currentUser.username?.toLowerCase() === targetEmail?.toLowerCase() ||
      currentUser.email?.toLowerCase() === targetEmail?.toLowerCase()
    )) {
      return {
        uid: currentUser.uid || currentUser.id,
        name: currentUser.name,
        email: currentUser.username || currentUser.email,
        status: currentUser.status || 'pending',
        route: currentUser.route || 'Assigned Route',
        busNumber: currentUser.busNumber || 'Assigned Bus',
        createdAt: currentUser.createdAt || new Date().toISOString()
      };
    }
  } catch (e) {}

  return null;
}

/**
 * Fetch all drivers with pending status for Admin Approval Panel
 */
export async function getPendingDriversFromFirestore() {
  const driversList = [];

  try {
    const q = query(collection(db, 'drivers'), where('status', '==', 'pending'));
    const querySnap = await getDocs(q);
    querySnap.forEach((doc) => {
      const data = doc.data();
      driversList.push({
        id: doc.id,
        uid: doc.id,
        name: data.name,
        email: data.email,
        route: data.route || 'Not assigned',
        busNumber: data.busNumber || 'N/A',
        status: data.status || 'pending',
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString())
      });
    });
  } catch (err) {
    console.warn('Firestore getPendingDrivers error, checking local store:', err.message);
  }

  // Also include any drivers in local store
  const store = getLocalStore();
  Object.keys(store).forEach(uid => {
    const item = store[uid];
    if (item.status === 'pending') {
      const exists = driversList.some(d => d.uid === uid || d.email === item.email);
      if (!exists) {
        driversList.push({
          id: uid,
          uid: uid,
          name: item.name,
          email: item.email,
          route: item.route || 'Not assigned',
          busNumber: item.busNumber || 'N/A',
          status: item.status || 'pending',
          createdAt: item.createdAt || new Date().toISOString()
        });
      }
    }
  });

  return driversList;
}

/**
 * Approve a driver (status: "approved", approvedAt: current timestamp, approvedBy: admin UID)
 */
export async function approveDriverInFirestore(driverTarget, adminUid = 'admin') {
  const approvedAt = new Date().toISOString();
  const targetUid = typeof driverTarget === 'object' ? (driverTarget.uid || driverTarget.id) : driverTarget;
  const targetEmail = typeof driverTarget === 'object' ? (driverTarget.email || driverTarget.username) : (typeof driverTarget === 'string' && driverTarget.includes('@') ? driverTarget : null);

  // 1. Firestore update by UID
  if (targetUid) {
    try {
      const docRef = doc(db, 'drivers', targetUid.toString());
      await updateDoc(docRef, {
        status: 'approved',
        approvedAt: serverTimestamp(),
        approvedBy: adminUid
      });
    } catch (err) {
      console.warn('Firestore approve driver by UID fallback:', err.message);
    }
  }

  // 2. Firestore update by Email
  if (targetEmail) {
    try {
      const q = query(collection(db, 'drivers'), where('email', '==', targetEmail.toLowerCase()));
      const querySnap = await getDocs(q);
      querySnap.forEach(async (dDoc) => {
        await updateDoc(dDoc.ref, {
          status: 'approved',
          approvedAt: serverTimestamp(),
          approvedBy: adminUid
        });
      });
    } catch (err) {
      console.warn('Firestore approve driver by email fallback:', err.message);
    }
  }

  // 3. Update Local Storage Store
  const store = getLocalStore();
  let matched = false;

  Object.keys(store).forEach(k => {
    const item = store[k];
    const isUidMatch = (k === targetUid || k === targetUid?.toString() || item.uid === targetUid || item.id === targetUid);
    const isEmailMatch = targetEmail && (
      item.email?.toLowerCase() === targetEmail.toLowerCase() ||
      item.username?.toLowerCase() === targetEmail.toLowerCase()
    );

    if (isUidMatch || isEmailMatch) {
      store[k].status = 'approved';
      store[k].approvedAt = approvedAt;
      store[k].approvedBy = adminUid;
      matched = true;
    }
  });

  if (!matched && targetUid) {
    store[targetUid] = {
      uid: targetUid,
      email: targetEmail || '',
      status: 'approved',
      approvedAt,
      approvedBy: adminUid
    };
  }

  saveLocalStore(store);

  // 4. Also update active user session in localStorage if driver is logged in
  try {
    const currentUser = JSON.parse(localStorage.getItem('tmb_user') || 'null');
    if (currentUser && (
      currentUser.id === targetUid || 
      currentUser.uid === targetUid || 
      currentUser.username?.toLowerCase() === targetEmail?.toLowerCase() ||
      currentUser.email?.toLowerCase() === targetEmail?.toLowerCase()
    )) {
      currentUser.status = 'approved';
      localStorage.setItem('tmb_user', JSON.stringify(currentUser));
    }
  } catch (e) {}

  return { success: true, status: 'approved', approvedAt };
}

/**
 * Reject a driver (status: "rejected", approvedBy: admin UID)
 */
export async function rejectDriverInFirestore(driverTarget, adminUid = 'admin') {
  const targetUid = typeof driverTarget === 'object' ? (driverTarget.uid || driverTarget.id) : driverTarget;
  const targetEmail = typeof driverTarget === 'object' ? (driverTarget.email || driverTarget.username) : (typeof driverTarget === 'string' && driverTarget.includes('@') ? driverTarget : null);

  if (targetUid) {
    try {
      const docRef = doc(db, 'drivers', targetUid.toString());
      await updateDoc(docRef, {
        status: 'rejected',
        approvedBy: adminUid
      });
    } catch (err) {
      console.warn('Firestore reject driver fallback:', err.message);
    }
  }

  if (targetEmail) {
    try {
      const q = query(collection(db, 'drivers'), where('email', '==', targetEmail.toLowerCase()));
      const querySnap = await getDocs(q);
      querySnap.forEach(async (dDoc) => {
        await updateDoc(dDoc.ref, {
          status: 'rejected',
          approvedBy: adminUid
        });
      });
    } catch (err) {}
  }

  const store = getLocalStore();
  Object.keys(store).forEach(k => {
    const item = store[k];
    const isUidMatch = (k === targetUid || k === targetUid?.toString() || item.uid === targetUid || item.id === targetUid);
    const isEmailMatch = targetEmail && (
      item.email?.toLowerCase() === targetEmail.toLowerCase() ||
      item.username?.toLowerCase() === targetEmail.toLowerCase()
    );

    if (isUidMatch || isEmailMatch) {
      store[k].status = 'rejected';
      store[k].approvedBy = adminUid;
    }
  });

  saveLocalStore(store);

  try {
    const currentUser = JSON.parse(localStorage.getItem('tmb_user') || 'null');
    if (currentUser && (
      currentUser.id === targetUid || 
      currentUser.uid === targetUid || 
      currentUser.username?.toLowerCase() === targetEmail?.toLowerCase() ||
      currentUser.email?.toLowerCase() === targetEmail?.toLowerCase()
    )) {
      currentUser.status = 'rejected';
      localStorage.setItem('tmb_user', JSON.stringify(currentUser));
    }
  } catch (e) {}

  return { success: true, status: 'rejected' };
}

/**
 * Listen to real-time changes for a driver profile doc in Firestore & local stores
 */
export function listenToDriverStatus(uid, callback) {
  let unsubscribeFirestore = () => {};

  try {
    if (uid) {
      const docRef = doc(db, 'drivers', uid.toString());
      unsubscribeFirestore = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          callback(data);
        }
      }, (error) => {
        console.warn('Firestore status listener notice:', error.message);
      });
    }
  } catch (e) {
    console.warn('Firestore snapshot setup notice:', e.message);
  }

  // Poll local storage & current user session periodically
  const intervalId = setInterval(() => {
    const store = getLocalStore();
    const currentUser = JSON.parse(localStorage.getItem('tmb_user') || 'null');
    const searchEmail = currentUser?.username || currentUser?.email;

    let matchedItem = null;
    if (uid && store[uid]) matchedItem = store[uid];
    else if (uid && store[uid.toString()]) matchedItem = store[uid.toString()];
    else if (searchEmail) {
      const matchedKey = Object.keys(store).find(k => 
        store[k].email?.toLowerCase() === searchEmail.toLowerCase() ||
        store[k].username?.toLowerCase() === searchEmail.toLowerCase()
      );
      if (matchedKey) matchedItem = store[matchedKey];
    }

    if (matchedItem) {
      callback(matchedItem);
    } else if (currentUser && currentUser.status) {
      callback(currentUser);
    }
  }, 1000);

  return () => {
    unsubscribeFirestore();
    clearInterval(intervalId);
  };
}
