import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export function useUserAuth() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [branchId, setBranchId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;
    let localSessionData: any = null;

    const localSessionStr = localStorage.getItem('direct_employee_session');
    if (localSessionStr) {
      try {
        localSessionData = JSON.parse(localSessionStr);
      } catch (e) {
        console.error("Invalid local session", e);
      }
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (unsubscribeUserDoc) {
          unsubscribeUserDoc();
          unsubscribeUserDoc = null;
        }
        
        if (localSessionData && localSessionData.uid) {
           // Direct employee login mode
           setupUserListener(localSessionData.uid);
        } else {
           setLoading(false);
        }
        return;
      }

      const email = user.email || '';
      if (!email) {
        if (localSessionData && localSessionData.uid) {
          setupUserListener(localSessionData.uid);
        } else {
          setLoading(false);
        }
        return;
      }
      const isInternal = email.endsWith('@restaurant.internal') || email === 'salem.sam59@gmail.com';
      
      let searchDocId = email;
      if (isInternal && email !== 'salem.sam59@gmail.com') {
         searchDocId = email.split('@')[0];
         // Fallback logic check
         try {
           if (searchDocId) {
             const docCheck = await getDoc(doc(db, 'users', searchDocId));
             if (!docCheck.exists()) {
                searchDocId = email;
             }
           }
         } catch(e) {}
      }

      setupUserListener(searchDocId, email);
    });

    const setupUserListener = (docId: string, userEmail: string = '') => {
      if (!docId) {
        if (userEmail === 'salem.sam59@gmail.com' || userEmail.endsWith('@restaurant.internal')) {
          setIsAdmin(true);
        }
        setLoading(false);
        return;
      }

      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }

      unsubscribeUserDoc = onSnapshot(doc(db, 'users', docId), async (userDoc) => {
        const isSuperAdmin = userEmail === 'salem.sam59@gmail.com' || userEmail.endsWith('@restaurant.internal');
        if (isSuperAdmin) {
          setIsAdmin(true);
        }
        
        if (userDoc.exists()) {
          const userData: any = { id: userDoc.id, ...userDoc.data() };
          setCurrentUser(userData);
          
          if (userData.branchId) {
             setBranchId(userData.branchId);
          }

          let roleId = userData.roleId;
          let userPerms = userData.permissions || [];
          
          if (userPerms && userPerms.length > 0) {
            setPermissions(userPerms);
            if (!isSuperAdmin) setIsAdmin(userData.roleId === 'admin'); // Assuming 'admin' role has it, or just if roleId="admin"
          } else if (roleId) {
            try {
              const roleDoc = await getDoc(doc(db, 'roles', roleId));
              if (roleDoc.exists()) {
                setPermissions(roleDoc.data().permissions || []);
                if (!isSuperAdmin) setIsAdmin(roleDoc.data().isSystem && roleId === 'admin');
              }
            } catch(e) {}
          }
        }
        setLoading(false);
      }, (err) => {
         if (err.code !== 'permission-denied') {
            console.error('Listener error in useUserAuth:', err);
         }
         if (err.code === 'permission-denied') {
             localStorage.removeItem('direct_employee_session');
             try { auth.signOut(); } catch(e) {}
         }
         setLoading(false);
      });
    };

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  const hasPermission = (permission: string) => {
    return isAdmin || permissions.includes(permission);
  };

  return { user: currentUser, permissions, isAdmin, hasPermission, branchId, loading };
}
