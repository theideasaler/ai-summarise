import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getAuth, Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private app = initializeApp(environment.firebase);
  private auth: Auth = getAuth(this.app);
  private firestore: Firestore = getFirestore(this.app);
  private storage: FirebaseStorage = getStorage(this.app);

  constructor(private logger: LoggerService) {
    this.logger.log('Firebase initialized successfully');
  }

  // Authentication methods
  async signInWithEmail(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error) {
      this.logger.error('Sign in error:', error);
      throw error;
    }
  }

  async signUpWithEmail(email: string, password: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error) {
      this.logger.error('Sign up error:', error);
      throw error;
    }
  }

  async signOut() {
    try {
      await signOut(this.auth);
    } catch (error) {
      this.logger.error('Sign out error:', error);
      throw error;
    }
  }

  // Get current user
  getCurrentUser(): User | null {
    return this.auth.currentUser;
  }

  // Get auth state as Observable
  getAuthState(): Observable<User | null> {
    return new Observable(observer => {
      return this.auth.onAuthStateChanged(observer);
    });
  }

  // Get Firestore instance
  getFirestore(): Firestore {
    return this.firestore;
  }

  // Get Storage instance
  getStorage(): FirebaseStorage {
    return this.storage;
  }

  // Get Auth instance
  getAuth(): Auth {
    return this.auth;
  }
}